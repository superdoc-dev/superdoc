import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';

export interface DeleteInput {
  target: TextAddress;
}

const DELETE_INPUT_ALLOWED_KEYS = new Set(['target']);

/**
 * Validates DeleteInput and throws DocumentApiValidationError on violations.
 *
 * Validation order:
 * 0. Input shape guard
 * 1. Unknown field rejection
 * 2. Target is required
 * 3. Target type check
 */
function validateDeleteInput(input: unknown): asserts input is DeleteInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Delete input must be a non-null object.');
  }

  assertNoUnknownFields(input, DELETE_INPUT_ALLOWED_KEYS, 'delete');

  const { target } = input;

  // Target is required
  if (target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Delete requires a target.');
  }

  // Type check
  if (!isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }
}

export function executeDelete(
  adapter: WriteAdapter,
  input: DeleteInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateDeleteInput(input);

  return executeWrite(adapter, { kind: 'delete', target: input.target, text: '' }, options);
}
