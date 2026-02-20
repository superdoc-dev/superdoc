/**
 * Low-level type-guard primitives shared across operation validators.
 *
 * This module contains ONLY primitive type checks and generic assertions.
 * Operation-specific truth tables, mode-exclusivity logic, and allowlists
 * stay local to each operation file.
 *
 * Internal — not exported from the package root.
 */

import type { TextAddress } from './types/index.js';
import { DocumentApiValidationError } from './errors.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function isTextAddress(value: unknown): value is TextAddress {
  if (!isRecord(value)) return false;
  if (value.kind !== 'text') return false;
  if (typeof value.blockId !== 'string') return false;

  const range = value.range;
  if (!isRecord(range)) return false;
  if (!isInteger(range.start) || !isInteger(range.end)) return false;
  return range.start <= range.end;
}

/**
 * Throws INVALID_TARGET if any key on the input object is not in the allowlist.
 */
export function assertNoUnknownFields(
  input: Record<string, unknown>,
  allowlist: ReadonlySet<string>,
  operationName: string,
): void {
  for (const key of Object.keys(input)) {
    if (!allowlist.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        `Unknown field "${key}" on ${operationName} input. Allowed fields: ${[...allowlist].join(', ')}.`,
        { field: key },
      );
    }
  }
}

/**
 * Throws INVALID_TARGET if the value is not a non-negative integer.
 */
export function assertNonNegativeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${fieldName} must be a non-negative integer, got ${JSON.stringify(value)}.`,
      { field: fieldName, value },
    );
  }
}
