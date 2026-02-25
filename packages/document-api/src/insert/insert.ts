import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';

export interface InsertInput {
  target?: TextAddress;
  text: string;
}

/**
 * Strict top-level allowlist for InsertInput fields.
 * Any key not in this list is rejected as an unknown field.
 */
const INSERT_INPUT_ALLOWED_KEYS = new Set(['text', 'target']);

/**
 * Validates InsertInput and throws DocumentApiValidationError on violations.
 *
 * Validation order:
 * 0. Input shape guard (must be non-null plain object)
 * 1. Unknown field rejection (strict allowlist)
 * 2. Target type check (target shape)
 * 3. Text type check
 */
function validateInsertInput(input: unknown): asserts input is InsertInput {
  // Step 0: Input shape guard
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Insert input must be a non-null object.');
  }

  // Step 1: Unknown field rejection (strict allowlist)
  assertNoUnknownFields(input, INSERT_INPUT_ALLOWED_KEYS, 'insert');

  const { target, text } = input;

  // Step 2: Target type check
  if (target !== undefined && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  // Step 3: Text type check
  if (typeof text !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `text must be a string, got ${typeof text}.`, {
      field: 'text',
      value: text,
    });
  }
}

export function executeInsert(
  adapter: WriteAdapter,
  input: InsertInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateInsertInput(input);

  const { target, text } = input;

  // Canonical target or no-target (default insertion point)
  const request = target ? { kind: 'insert' as const, target, text } : { kind: 'insert' as const, text };

  return executeWrite(adapter, request, options);
}
