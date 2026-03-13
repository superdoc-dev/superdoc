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
import type { SDAddress } from './types/sd-envelope.js';
import { TABLE_NESTING_POLICY_VALUES } from './types/placement.js';
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

const SD_ADDRESS_KINDS: ReadonlySet<string> = new Set(['content', 'inline', 'annotation', 'section']);
const SD_ADDRESS_STABILITIES: ReadonlySet<string> = new Set(['stable', 'ephemeral']);

/** Type guard for SDAddress. Checks shape, not semantic validity. */
export function isSDAddress(value: unknown): value is SDAddress {
  if (!isRecord(value)) return false;
  if (typeof value.kind !== 'string' || !SD_ADDRESS_KINDS.has(value.kind)) return false;
  if (typeof value.stability !== 'string' || !SD_ADDRESS_STABILITIES.has(value.stability)) return false;
  return true;
}

/** Returns true when value is a valid target (either TextAddress or SDAddress). */
export function isValidTarget(value: unknown): value is TextAddress | SDAddress {
  return isTextAddress(value) || isSDAddress(value);
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

const NESTING_POLICY_ALLOWED_KEYS: ReadonlySet<string> = new Set(['tables']);

/**
 * Validates a nestingPolicy value: must be an object with only known keys,
 * and the `tables` field (if present) must be a valid TableNestingPolicy value.
 *
 * Used by both insert and replace structural validators.
 */
export function validateNestingPolicyValue(value: unknown): void {
  if (value === undefined) return;

  if (!isRecord(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `nestingPolicy must be an object, got ${typeof value}.`, {
      field: 'nestingPolicy',
      value,
    });
  }

  for (const key of Object.keys(value)) {
    if (!NESTING_POLICY_ALLOWED_KEYS.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown field "${key}" on nestingPolicy. Allowed fields: ${[...NESTING_POLICY_ALLOWED_KEYS].join(', ')}.`,
        { field: `nestingPolicy.${key}` },
      );
    }
  }

  if (
    value.tables !== undefined &&
    (typeof value.tables !== 'string' || !TABLE_NESTING_POLICY_VALUES.has(value.tables))
  ) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `nestingPolicy.tables must be one of: forbid, allow. Got "${String(value.tables)}".`,
      { field: 'nestingPolicy.tables', value: value.tables },
    );
  }
}
