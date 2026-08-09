import type { JsonSchema } from './types';

export function collectReferencedDefinitions(
  schemas: unknown,
  definitions: Record<string, JsonSchema>,
): Record<string, JsonSchema> {
  const referencedDefinitions: Record<string, JsonSchema> = {};

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;

    const reference = '$ref' in value && typeof value.$ref === 'string' ? value.$ref : undefined;
    const match = reference?.match(/^#\/\$defs\/([^/]+)$/u);
    if (match) {
      const name = match[1].replaceAll('~1', '/').replaceAll('~0', '~');
      if (!Object.hasOwn(referencedDefinitions, name)) {
        if (!Object.hasOwn(definitions, name)) throw new Error(`Missing schema definition for ${reference}.`);
        referencedDefinitions[name] = definitions[name];
        visit(definitions[name]);
      }
    }

    for (const child of Object.values(value)) visit(child);
  }

  visit(schemas);
  return referencedDefinitions;
}

export function resolveSchema(
  schema: JsonSchema,
  definitions: Record<string, JsonSchema>,
): { schema: JsonSchema; reference?: string } {
  const reference = typeof schema.$ref === 'string' ? schema.$ref.match(/^#\/\$defs\/(.+)$/u)?.[1] : undefined;
  return reference && definitions[reference] ? { schema: definitions[reference], reference } : { schema };
}

export function schemaType(schema: JsonSchema, definitions: Record<string, JsonSchema>): string {
  const resolved = resolveSchema(schema, definitions);
  if (resolved.reference) return resolved.reference;
  const value = resolved.schema;
  if ('const' in value) return JSON.stringify(value.const);
  if (Array.isArray(value.enum)) return value.enum.map((entry) => JSON.stringify(entry)).join(' | ');
  if (Array.isArray(value.oneOf) || Array.isArray(value.anyOf)) {
    const variants = (Array.isArray(value.oneOf) ? value.oneOf : value.anyOf) as JsonSchema[];
    const labels = variantLabels(variants, definitions);
    if (labels.every((label) => !/^Variant \d+$/u.test(label))) return labels.join(' | ');
    return variants.map((entry) => schemaType(entry, definitions)).join(' | ');
  }
  if (Array.isArray(value.type)) {
    const types = value.type.filter((type): type is string => typeof type === 'string');
    if (types.length > 0) {
      return types
        .map((type) =>
          type === 'array' ? `${schemaType((value.items as JsonSchema | undefined) ?? {}, definitions)}[]` : type,
        )
        .join(' | ');
    }
  }
  if (value.type === 'array') return `${schemaType((value.items as JsonSchema | undefined) ?? {}, definitions)}[]`;
  if (typeof value.type === 'string') return value.type;
  if (value.properties) return 'object';
  return 'unknown';
}

export function schemaDescription(schema: JsonSchema, definitions: Record<string, JsonSchema>) {
  if (typeof schema.description === 'string') return schema.description;
  const resolvedDescription = resolveSchema(schema, definitions).schema.description;
  return typeof resolvedDescription === 'string' ? resolvedDescription : undefined;
}

export function schemaProperties(schema: JsonSchema, definitions: Record<string, JsonSchema>) {
  const resolved = resolveSchema(schema, definitions).schema;
  const properties = resolved.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return [];
  const required = new Set(
    Array.isArray(resolved.required)
      ? resolved.required.filter((value): value is string => typeof value === 'string')
      : [],
  );
  const conditionallyRequired = conditionalRequiredPropertyNames(resolved);
  return Object.entries(properties as Record<string, JsonSchema>).map(([name, property]) => ({
    name,
    schema: property,
    required: required.has(name),
    conditionallyRequired: !required.has(name) && conditionallyRequired.has(name),
  }));
}

function conditionalRequiredPropertyNames(schema: JsonSchema): Set<string> {
  const names = new Set<string>();

  function visitBranch(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    const branch = value as JsonSchema;
    if (Array.isArray(branch.required)) {
      for (const name of branch.required) {
        if (typeof name === 'string') names.add(name);
      }
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'then', 'else'] as const) {
      const child = branch[keyword];
      if (Array.isArray(child)) {
        for (const entry of child) visitBranch(entry);
      } else {
        visitBranch(child);
      }
    }
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf', 'then', 'else'] as const) {
    const child = schema[keyword];
    if (Array.isArray(child)) {
      for (const entry of child) visitBranch(entry);
    } else {
      visitBranch(child);
    }
  }
  return names;
}

export function schemaVariants(schema: JsonSchema, definitions: Record<string, JsonSchema>) {
  const resolved = resolveSchema(schema, definitions).schema;
  const variants = Array.isArray(resolved.oneOf) ? resolved.oneOf : Array.isArray(resolved.anyOf) ? resolved.anyOf : [];
  return variants.filter((variant): variant is JsonSchema => typeof variant === 'object' && variant !== null);
}

export function variantLabel(schema: JsonSchema, definitions: Record<string, JsonSchema>, index: number) {
  const resolved = resolveSchema(schema, definitions);
  if (resolved.reference) return resolved.reference;
  const title = resolved.schema.title;
  if (typeof title === 'string') return title;
  const properties = resolved.schema.properties as Record<string, JsonSchema> | undefined;
  if (properties) {
    for (const property of Object.values(properties)) {
      if ('const' in property) return String(property.const);
    }
  }
  return `Variant ${index + 1}`;
}

export function variantLabels(variants: JsonSchema[], definitions: Record<string, JsonSchema>): string[] {
  const resolved = variants.map((variant) => resolveSchema(variant, definitions).schema);
  const constantProperties = resolved.map((schema) => {
    const properties = schema.properties as Record<string, JsonSchema> | undefined;
    return new Map(
      Object.entries(properties ?? {}).flatMap(([name, property]) =>
        Object.prototype.hasOwnProperty.call(property, 'const') ? [[name, property.const] as const] : [],
      ),
    );
  });
  const discriminatingConstant = [...(constantProperties[0]?.keys() ?? [])]
    .filter((name) => constantProperties.every((properties) => properties.has(name)))
    .map((name) => ({
      name,
      distinctValues: new Set(constantProperties.map((properties) => JSON.stringify(properties.get(name)))).size,
    }))
    .filter(({ distinctValues }) => distinctValues > 1)
    .sort((left, right) => right.distinctValues - left.distinctValues || left.name.localeCompare(right.name))[0]?.name;

  if (discriminatingConstant) {
    return constantProperties.map((properties) => formatVariantValue(properties.get(discriminatingConstant)));
  }

  const requiredFields = resolved.map((schema) =>
    Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === 'string') : [],
  );
  const requiredCounts = new Map<string, number>();
  for (const fields of requiredFields) {
    for (const field of fields) requiredCounts.set(field, (requiredCounts.get(field) ?? 0) + 1);
  }
  const distinguishingFields = requiredFields.map((fields) =>
    fields.find((field) => requiredCounts.get(field) !== variants.length),
  );

  if (
    distinguishingFields.every((field): field is string => field !== undefined) &&
    new Set(distinguishingFields).size === variants.length
  ) {
    return distinguishingFields;
  }

  const nestedLabels: string[] = resolved.map((schema, index): string => {
    const nestedVariants = schemaVariants(schema, definitions);
    if (nestedVariants.length > 0) return variantLabels(nestedVariants, definitions).join(' / ');
    return (
      distinguishingFields[index] ??
      (requiredFields[index].length > 0
        ? requiredFields[index].join(' + ')
        : variantLabel(variants[index], definitions, index))
    );
  });

  if (new Set(nestedLabels).size === variants.length) return nestedLabels;

  return variants.map((variant, index) => variantLabel(variant, definitions, index));
}

function formatVariantValue(value: unknown) {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
}
