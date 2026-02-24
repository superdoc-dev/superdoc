type JsonSchema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  const?: unknown;
  enum?: unknown[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
};

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'const',
  'enum',
  'oneOf',
  'anyOf',
]);

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

function isType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function validateInternal(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  let hasUnsupportedKeyword = false;
  for (const key of Object.keys(schema)) {
    if (SUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    errors.push(`${path}: unsupported schema keyword "${key}"`);
    hasUnsupportedKeyword = true;
  }

  if (hasUnsupportedKeyword) return;

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${JSON.stringify(schema.enum)}`);
    return;
  }

  if (schema.oneOf) {
    let matchCount = 0;
    for (const nested of schema.oneOf) {
      const nestedErrors: string[] = [];
      validateInternal(nested, value, path, nestedErrors);
      if (nestedErrors.length === 0) matchCount += 1;
    }
    if (matchCount !== 1) {
      errors.push(`${path}: expected exactly one oneOf schema match`);
    }
    return;
  }

  if (schema.anyOf) {
    let matched = false;
    for (const nested of schema.anyOf) {
      const nestedErrors: string[] = [];
      validateInternal(nested, value, path, nestedErrors);
      if (nestedErrors.length === 0) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      errors.push(`${path}: expected at least one anyOf schema match`);
    }
    return;
  }

  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const hasTypeMatch = expectedTypes.some((expectedType) => isType(value, expectedType));
    if (!hasTypeMatch) {
      errors.push(`${path}: expected type ${expectedTypes.join('|')}`);
      return;
    }
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.includes('array') && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      validateInternal(schema.items as JsonSchema, item, `${path}[${index}]`, errors);
    });
    return;
  }

  const isObjectSchema = schema.type === 'object' || (schema.properties && typeof value === 'object');
  if (!isObjectSchema || typeof value !== 'object' || value === null || Array.isArray(value)) return;

  const objectValue = value as Record<string, unknown>;
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in objectValue) || objectValue[key] === undefined) {
        errors.push(`${path}: missing required property "${key}"`);
      }
    }
  }

  if (schema.properties) {
    for (const [key, nestedSchema] of Object.entries(schema.properties)) {
      if (!(key in objectValue) || objectValue[key] === undefined) continue;
      validateInternal(nestedSchema, objectValue[key], `${path}.${key}`, errors);
    }
  }

  if (schema.additionalProperties === false && schema.properties) {
    const allowed = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(objectValue)) {
      if (!allowed.has(key)) {
        errors.push(`${path}: unexpected property "${key}"`);
      }
    }
  }
}

export function validateJsonSchema(schema: JsonSchema, value: unknown): SchemaValidationResult {
  const errors: string[] = [];
  validateInternal(schema, value, '$', errors);
  return { valid: errors.length === 0, errors };
}
