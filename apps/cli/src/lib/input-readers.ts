import { CliError } from './errors';

/**
 * Checks whether a value is a non-empty string.
 *
 * @param value - The value to check
 * @returns `true` if the value is a string with length > 0
 */
export function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Reads a required non-empty string field from an input record.
 *
 * @param input - The input record to read from
 * @param field - The field name to read
 * @param operation - The operation name for error messages
 * @returns The string value
 * @throws {CliError} MISSING_REQUIRED if the field is missing or empty
 */
export function readRequiredString(input: Record<string, unknown>, field: string, operation: string): string {
  const value = input[field];
  if (hasNonEmptyString(value)) return value;
  throw new CliError('MISSING_REQUIRED', `${operation}: missing required input.${field}.`);
}

/**
 * Reads an optional string field from an input record.
 *
 * @param input - The input record to read from
 * @param field - The field name to read
 * @returns The string value, or `undefined` if missing or empty
 */
export function readOptionalString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  return hasNonEmptyString(value) ? value : undefined;
}

/**
 * Reads an optional finite number field from an input record.
 *
 * @param input - The input record to read from
 * @param field - The field name to read
 * @returns The number value, or `undefined` if missing or not a finite number
 */
export function readOptionalNumber(input: Record<string, unknown>, field: string): number | undefined {
  const value = input[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads a boolean field from an input record, defaulting to `false`.
 *
 * @param input - The input record to read from
 * @param field - The field name to read
 * @returns `true` only if the field is strictly `true`
 */
export function readBoolean(input: Record<string, unknown>, field: string): boolean {
  return input[field] === true;
}

/**
 * Reads the change mode from an input record.
 *
 * @param input - The input record to read from
 * @returns `'tracked'` if explicitly set, otherwise `'direct'`
 */
export function readChangeMode(input: Record<string, unknown>): 'direct' | 'tracked' {
  return input.changeMode === 'tracked' ? 'tracked' : 'direct';
}

/**
 * JSON round-trip normalizes a value to ensure it is serializable.
 *
 * @param value - The value to normalize
 * @param commandName - The command name for error messages
 * @returns The normalized value
 * @throws {CliError} VALIDATION_ERROR if the value is not JSON-serializable
 */
export function normalizeJsonValue(value: unknown, commandName: string): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (serialized == null) {
      throw new CliError('VALIDATION_ERROR', `${commandName}: response payload must be JSON-serializable.`);
    }
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('VALIDATION_ERROR', `${commandName}: response payload must be JSON-serializable.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
