import { CliError } from './errors';
import { isRecord } from './guards';
import {
  ensureValidArgs,
  expectNoPositionals,
  getBooleanOption,
  getNumberOption,
  getOptionalBooleanOption,
  getStringListOption,
  getStringOption,
  parseCommandArgs,
  resolveDocArg,
  type OptionSpec,
  type ParsedArgs,
} from './args';
import {
  CLI_OPERATION_COMMAND_KEYS,
  CLI_OPERATION_METADATA,
  CLI_OPERATION_OPTION_SPECS,
  getResponseSchema,
  toDocApiId,
  type CliOperationArgsById,
  type CliOperationConstraints,
  type CliOperationId,
  type CliOperationParamSpec,
  type CliTypeSpec,
} from '../cli';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { RESPONSE_ENVELOPE_KEY, RESPONSE_VALIDATION_KEY } from '../cli/operation-hints.js';

type ParseOperationArgsOptions = {
  commandName?: string;
  extraOptionSpecs?: OptionSpec[];
  allowExtraPositionals?: boolean;
  skipConstraints?: boolean;
};

type ParsedOperationArgs<TOperationId extends CliOperationId> = {
  parsed: ParsedArgs;
  args: CliOperationArgsById[TOperationId];
  help: boolean;
  positionals: string[];
  commandName: string;
};

const HELP_OPTION_SPEC: OptionSpec = { name: 'help', type: 'boolean', aliases: ['h'] };

function buildOptionSpecs(operationId: CliOperationId, extras: OptionSpec[] = []): OptionSpec[] {
  const seen = new Set<string>();
  const merged: OptionSpec[] = [];
  for (const spec of [...CLI_OPERATION_OPTION_SPECS[operationId], ...extras, HELP_OPTION_SPEC]) {
    if (seen.has(spec.name)) continue;
    seen.add(spec.name);
    merged.push(spec);
  }
  return merged;
}

function parseJsonFlagValue(commandName: string, flag: string, raw: string | undefined): unknown | undefined {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('JSON_PARSE_ERROR', `${commandName}: invalid --${flag} JSON payload.`, {
      message,
      flag,
    });
  }
}

function getParamLabel(param: CliOperationParamSpec): string {
  if (param.kind === 'doc') return `<${param.name}>`;
  return `--${param.flag}`;
}

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function validateValueAgainstTypeSpec(value: unknown, schema: CliTypeSpec, path: string): void {
  if ('const' in schema) {
    if (value !== schema.const) {
      throw new CliError('VALIDATION_ERROR', `${path} must equal ${JSON.stringify(schema.const)}.`);
    }
    return;
  }

  if ('oneOf' in schema) {
    const variants = schema.oneOf as CliTypeSpec[];
    const errors: string[] = [];
    for (const variant of variants) {
      try {
        validateValueAgainstTypeSpec(value, variant, path);
        return;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new CliError('VALIDATION_ERROR', `${path} must match one of the allowed schema variants.`, { errors });
  }

  if (schema.type === 'json') return;

  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new CliError('VALIDATION_ERROR', `${path} must be a string.`);
    return;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CliError('VALIDATION_ERROR', `${path} must be a finite number.`);
    }
    return;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new CliError('VALIDATION_ERROR', `${path} must be a boolean.`);
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new CliError('VALIDATION_ERROR', `${path} must be an array.`);
    for (let index = 0; index < value.length; index += 1) {
      validateValueAgainstTypeSpec(value[index], schema.items, `${path}[${index}]`);
    }
    return;
  }

  if (schema.type === 'object') {
    if (!isRecord(value)) throw new CliError('VALIDATION_ERROR', `${path} must be an object.`);

    const required = schema.required ?? [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new CliError('VALIDATION_ERROR', `${path}.${key} is required.`);
      }
    }

    const knownKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(value)) {
      if (!knownKeys.has(key)) {
        throw new CliError('VALIDATION_ERROR', `${path}.${key} is not allowed by schema.`);
      }
    }

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      validateValueAgainstTypeSpec(value[key], propSchema, `${path}.${key}`);
    }
    return;
  }

  throw new CliError('VALIDATION_ERROR', `${path} uses an unsupported schema type.`);
}

/**
 * Loose structural validation — checks required fields and types of known
 * properties but does NOT reject additional properties.  This matches JSON
 * Schema's default `additionalProperties: true` and is appropriate for
 * response validation where the doc-api output may include extra fields
 * beyond what the schema explicitly enumerates.
 */
function validateResponseValueAgainstTypeSpec(value: unknown, schema: CliTypeSpec, path: string): void {
  if ('const' in schema) {
    if (value !== schema.const) {
      throw new CliError('VALIDATION_ERROR', `${path} must be ${JSON.stringify(schema.const)}.`);
    }
    return;
  }

  if ('oneOf' in schema) {
    const errors: string[] = [];
    for (const variant of schema.oneOf) {
      try {
        validateResponseValueAgainstTypeSpec(value, variant, path);
        return;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new CliError('VALIDATION_ERROR', `${path} must match one of the allowed schema variants.`, { errors });
  }

  if (schema.type === 'json') return;
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new CliError('VALIDATION_ERROR', `${path} must be a string.`);
    return;
  }
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CliError('VALIDATION_ERROR', `${path} must be a finite number.`);
    }
    return;
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new CliError('VALIDATION_ERROR', `${path} must be a boolean.`);
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new CliError('VALIDATION_ERROR', `${path} must be an array.`);
    for (let index = 0; index < value.length; index += 1) {
      validateResponseValueAgainstTypeSpec(value[index], schema.items, `${path}[${index}]`);
    }
    return;
  }
  if (schema.type === 'object') {
    if (!isRecord(value)) throw new CliError('VALIDATION_ERROR', `${path} must be an object.`);

    const required = schema.required ?? [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new CliError('VALIDATION_ERROR', `${path}.${key} is required.`);
      }
    }

    // Validate known properties but allow additional properties (JSON Schema default).
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      validateResponseValueAgainstTypeSpec(value[key], propSchema, `${path}.${key}`);
    }
    return;
  }
}

/**
 * Resolves the envelope key for a doc-backed CLI operation.
 *
 * Derived from the single source of truth in `operation-hints.ts` (RESPONSE_ENVELOPE_KEY).
 * Returns `undefined` for CLI-only operations that aren't doc-backed.
 */
function resolveResponsePayloadKey(operationId: CliOperationId): string | null | undefined {
  const docApiId = toDocApiId(operationId);
  if (!docApiId) return undefined;
  const envelopeKey = RESPONSE_ENVELOPE_KEY[docApiId as CliExposedOperationId];
  // For operations with null envelope key (result spread across top-level), fall
  // back to RESPONSE_VALIDATION_KEY so schema validation still runs on the receipt.
  return envelopeKey ?? RESPONSE_VALIDATION_KEY[docApiId as CliExposedOperationId] ?? null;
}

export function validateOperationResponseData(operationId: CliOperationId, value: unknown, commandName: string): void {
  const schema = getResponseSchema(operationId);
  if (!schema) return;

  // CLI-only operations use permissive { type: 'json' } schemas.
  if ('type' in schema && schema.type === 'json') return;

  // Resolve the envelope key from the single source of truth.
  const payloadKey = resolveResponsePayloadKey(operationId);

  // Null entries are intentionally exempt (e.g. doc.info which splits output
  // across multiple keys).
  if (payloadKey === null || payloadKey === undefined) return;

  if (!isRecord(value)) {
    throw new CliError('VALIDATION_ERROR', `${commandName}:response must be an object.`);
  }

  // Dry-run responses use a different envelope shape (proposed instead of
  // receipt/result), so skip the key-presence check when dryRun is set.
  if (!(payloadKey in value)) {
    if (value.dryRun === true) return;
    throw new CliError(
      'VALIDATION_ERROR',
      `${commandName}:response.${payloadKey} is required by ${operationId} response schema.`,
    );
  }

  // Validate the payload field against the doc-api output schema.  Uses loose
  // validation (allows extra properties) to match JSON Schema defaults.
  validateResponseValueAgainstTypeSpec(value[payloadKey], schema, `${commandName}:response.${payloadKey}`);
}

function validateValueAgainstParamType(value: unknown, param: CliOperationParamSpec, path: string): void {
  if (param.type === 'json') return;

  if (param.type === 'string') {
    if (typeof value !== 'string') {
      throw new CliError('VALIDATION_ERROR', `${path} must be a string.`);
    }
    return;
  }

  if (param.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CliError('VALIDATION_ERROR', `${path} must be a finite number.`);
    }
    return;
  }

  if (param.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new CliError('VALIDATION_ERROR', `${path} must be a boolean.`);
    }
    return;
  }

  if (param.type === 'string[]') {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      throw new CliError('VALIDATION_ERROR', `${path} must be an array of strings.`);
    }
    return;
  }
}

function resolveFlagParamValue(parsed: ParsedArgs, commandName: string, param: CliOperationParamSpec): unknown {
  if (param.kind === 'doc') return undefined;
  const flag = param.flag ?? param.name;
  switch (param.type) {
    case 'string':
      return getStringOption(parsed, flag);
    case 'number':
      return getNumberOption(parsed, flag);
    case 'boolean':
      return getOptionalBooleanOption(parsed, flag);
    case 'string[]':
      return getStringListOption(parsed, flag);
    case 'json':
      return parseJsonFlagValue(commandName, flag, getStringOption(parsed, flag));
    default:
      return undefined;
  }
}

function applyConstraints(operationId: CliOperationId, commandName: string, args: Record<string, unknown>): void {
  const constraints = CLI_OPERATION_METADATA[operationId].constraints;
  if (!constraints) return;

  const typedConstraints = constraints as CliOperationConstraints;
  const mutuallyExclusive: string[][] = Array.isArray(typedConstraints.mutuallyExclusive)
    ? typedConstraints.mutuallyExclusive.map((group) => [...group])
    : [];
  const requiresOneOf: string[][] = Array.isArray(typedConstraints.requiresOneOf)
    ? typedConstraints.requiresOneOf.map((group) => [...group])
    : [];
  const requiredWhen: Array<{
    param: string;
    whenParam: string;
    equals?: unknown;
    present?: boolean;
  }> = Array.isArray(typedConstraints.requiredWhen) ? typedConstraints.requiredWhen.map((rule) => ({ ...rule })) : [];

  for (const group of mutuallyExclusive) {
    const present = group.filter((name) => isPresent(args[name]));
    if (present.length > 1) {
      throw new CliError(
        'INVALID_ARGUMENT',
        `${commandName}: options are mutually exclusive: ${group.map((name) => `--${name}`).join(', ')}`,
      );
    }
  }

  for (const group of requiresOneOf) {
    const hasAny = group.some((name: string) => isPresent(args[name]));
    if (!hasAny) {
      throw new CliError(
        'MISSING_REQUIRED',
        `${commandName}: one of ${group.map((name: string) => `--${name}`).join(', ')} is required.`,
      );
    }
  }

  for (const rule of requiredWhen) {
    const whenValue = args[rule.whenParam];
    let shouldRequire = false;
    if (Object.prototype.hasOwnProperty.call(rule, 'equals')) {
      shouldRequire = whenValue === rule.equals;
    } else if (Object.prototype.hasOwnProperty.call(rule, 'present')) {
      shouldRequire = rule.present ? isPresent(whenValue) : !isPresent(whenValue);
    } else {
      shouldRequire = isPresent(whenValue);
    }

    if (shouldRequire && !isPresent(args[rule.param])) {
      throw new CliError('MISSING_REQUIRED', `${commandName}: --${rule.param} is required by argument constraints.`, {
        param: rule.param,
        whenParam: rule.whenParam,
      });
    }
  }
}

export function validateOperationInputData(operationId: CliOperationId, input: unknown, commandName = 'call'): void {
  if (!isRecord(input)) {
    throw new CliError('VALIDATION_ERROR', `${commandName}: input must be a JSON object.`);
  }

  const metadata = CLI_OPERATION_METADATA[operationId];
  const paramNames = new Set<string>(metadata.params.map((param) => param.name as string));
  for (const key of Object.keys(input)) {
    if (!paramNames.has(key)) {
      throw new CliError('VALIDATION_ERROR', `${commandName}: input.${key} is not allowed for ${operationId}.`);
    }
  }

  const argsRecord: Record<string, unknown> = {};
  for (const param of metadata.params) {
    const value = input[param.name];
    argsRecord[param.name] = value;
    if (!isPresent(value)) continue;

    if ('schema' in param && param.schema) {
      validateValueAgainstTypeSpec(value, param.schema, `${commandName}:input.${param.name}`);
      continue;
    }

    validateValueAgainstParamType(value, param, `${commandName}:input.${param.name}`);
  }

  for (const param of metadata.params) {
    const isRequired = 'required' in param && Boolean(param.required);
    if (!isRequired) continue;
    if (isPresent(argsRecord[param.name])) continue;
    const requiredLabel = param.kind === 'doc' ? `<${param.name}>` : `input.${param.name}`;
    throw new CliError('MISSING_REQUIRED', `${commandName}: missing required ${requiredLabel}.`);
  }

  applyConstraints(operationId, commandName, argsRecord);
}

export function parseOperationArgs<TOperationId extends CliOperationId>(
  operationId: TOperationId,
  tokens: string[],
  options: ParseOperationArgsOptions = {},
): ParsedOperationArgs<TOperationId> {
  const commandName = options.commandName ?? CLI_OPERATION_COMMAND_KEYS[operationId];
  const parsed = parseCommandArgs(tokens, buildOptionSpecs(operationId, options.extraOptionSpecs ?? []));
  ensureValidArgs(parsed);

  const help = getBooleanOption(parsed, 'help');
  const metadata = CLI_OPERATION_METADATA[operationId];
  const argsRecord: Record<string, unknown> = {};
  let remainingPositionals = [...parsed.positionals];

  const positionalParamNames = [...metadata.positionalParams];
  if (positionalParamNames[0] === 'doc') {
    const resolved = resolveDocArg(parsed, commandName);
    if (resolved.doc != null) {
      argsRecord.doc = resolved.doc;
    }
    remainingPositionals = [...resolved.positionals];
    positionalParamNames.shift();
  }

  for (const positionalName of positionalParamNames) {
    const value = remainingPositionals.shift();
    if (value != null) {
      argsRecord[positionalName] = value;
    }
  }

  if (!options.allowExtraPositionals) {
    expectNoPositionals(parsed, remainingPositionals, commandName);
  }

  for (const param of metadata.params) {
    if (param.kind === 'doc') continue;
    argsRecord[param.name] = resolveFlagParamValue(parsed, commandName, param);
  }

  for (const param of metadata.params) {
    if (!('schema' in param) || !param.schema) continue;
    const value = argsRecord[param.name];
    if (!isPresent(value)) continue;
    validateValueAgainstTypeSpec(value, param.schema, `${commandName}:${param.name}`);
  }

  if (!help && !options.skipConstraints) {
    for (const param of metadata.params) {
      const isRequired = 'required' in param && Boolean(param.required);
      if (!isRequired) continue;
      const value = argsRecord[param.name];
      if (!isPresent(value)) {
        throw new CliError('MISSING_REQUIRED', `${commandName}: missing required ${getParamLabel(param)}.`);
      }
    }
    applyConstraints(operationId, commandName, argsRecord);
  }

  return {
    parsed,
    args: argsRecord as CliOperationArgsById[TOperationId],
    help,
    positionals: remainingPositionals,
    commandName,
  };
}
