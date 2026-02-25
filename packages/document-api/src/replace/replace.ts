import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';

export interface ReplaceInput {
  target: TextAddress;
  text: string;
}

const REPLACE_INPUT_ALLOWED_KEYS = new Set(['text', 'target']);

/**
 * Validates ReplaceInput and throws DocumentApiValidationError on violations.
 *
 * Validation order:
 * 0. Input shape guard
 * 1. Unknown field rejection
 * 2. Target is required
 * 3. Target type check
 * 4. Text type check
 */
function validateReplaceInput(input: unknown): asserts input is ReplaceInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Replace input must be a non-null object.');
  }

  assertNoUnknownFields(input, REPLACE_INPUT_ALLOWED_KEYS, 'replace');

  const { target, text } = input;

  // Target is required
  if (target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Replace requires a target.');
  }

  // Type checks
  if (!isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  if (typeof text !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `text must be a string, got ${typeof text}.`, {
      field: 'text',
      value: text,
    });
  }
}

export function executeReplace(
  adapter: WriteAdapter,
  input: ReplaceInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateReplaceInput(input);

  return executeWrite(adapter, { kind: 'replace', target: input.target, text: input.text }, options);
}
