import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

/**
 * Type guard that checks whether a value is a plain object (not null, not an array).
 *
 * @param value - The value to check
 * @returns `true` if value is a non-null, non-array object
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the value as a `Record<string, unknown>` if it is a plain object, or `null` otherwise.
 *
 * @param value - The value to check
 * @returns The value typed as a record, or `null`
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return value;
}

/**
 * Checks whether a filesystem path exists.
 *
 * @param path - Absolute path to check
 * @returns `true` if the path exists and is accessible
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
