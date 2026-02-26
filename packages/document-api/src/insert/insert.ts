import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';

/** Content format for the insert operation payload. */
export type InsertContentType = 'text' | 'markdown' | 'html';

/** Input payload for the `doc.insert` operation. */
export interface InsertInput {
  /** Optional insertion target. When omitted, adapters resolve a default insertion point. */
  target?: TextAddress;
  /** The content to insert. Interpreted according to {@link InsertInput.type}. */
  value: string;
  /** Content format. Defaults to `'text'` when omitted. */
  type?: InsertContentType;
}

/**
 * Strict top-level allowlist for InsertInput fields.
 * Any key not in this list is rejected as an unknown field.
 */
const INSERT_INPUT_ALLOWED_KEYS = new Set(['value', 'type', 'target']);

const VALID_INSERT_TYPES: ReadonlySet<string> = new Set(['text', 'markdown', 'html']);

/**
 * Validates InsertInput and throws DocumentApiValidationError on violations.
 *
 * Validation order:
 * 0. Input shape guard (must be non-null plain object)
 * 1. Unknown field rejection (strict allowlist)
 * 2. Target type check (target shape)
 * 3. Value type check (must be non-empty string)
 * 4. Type enum check (must be valid content type)
 */
function validateInsertInput(input: unknown): asserts input is InsertInput {
  // Step 0: Input shape guard
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Insert input must be a non-null object.');
  }

  // Step 1: Unknown field rejection (strict allowlist)
  assertNoUnknownFields(input, INSERT_INPUT_ALLOWED_KEYS, 'insert');

  const { target, value, type } = input;

  // Step 2: Target type check
  if (target !== undefined && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  // Step 3: Value type check
  if (typeof value !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `value must be a string, got ${typeof value}.`, {
      field: 'value',
      value,
    });
  }

  // Step 4: Type enum check
  if (type !== undefined && (typeof type !== 'string' || !VALID_INSERT_TYPES.has(type))) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `type must be one of: text, markdown, html. Got "${type}".`,
      {
        field: 'type',
        value: type,
      },
    );
  }
}

export function executeInsert(
  adapter: WriteAdapter,
  input: InsertInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateInsertInput(input);

  const { target, value } = input;
  const contentType = input.type ?? 'text';

  // For non-text content types, delegate to the adapter's structured insert path.
  // The adapter (plan-wrappers) handles markdown/html conversion and block insertion.
  if (contentType !== 'text') {
    return adapter.insertStructured(input, options);
  }

  // Text path: use the existing write pipeline
  const request = target ? { kind: 'insert' as const, target, text: value } : { kind: 'insert' as const, text: value };

  return executeWrite(adapter, request, options);
}
