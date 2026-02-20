import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields, assertNonNegativeInteger } from '../validation-primitives.js';

export interface InsertInput {
  target?: TextAddress;
  text: string;
  /** Block ID for block-relative targeting. When provided without `offset`, offset defaults to 0. */
  blockId?: string;
  /** Character offset within the block identified by `blockId`. Requires `blockId`. Must be a non-negative integer. */
  offset?: number;
}

/**
 * Strict top-level allowlist for InsertInput fields.
 * Any key not in this list is rejected as an unknown field.
 * PR B adds 'pos' to this list.
 */
const INSERT_INPUT_ALLOWED_KEYS = new Set(['text', 'target', 'blockId', 'offset']);

/**
 * Validates InsertInput and throws DocumentApiValidationError on violations.
 *
 * Validation order:
 * 0. Input shape guard (must be non-null plain object)
 * 1. `pos` runtime rejection (PR A: not yet supported)
 * 2. Unknown field rejection (strict allowlist)
 * 3. Target/type checks (target shape, text and blockId types)
 * 4. Mode exclusivity (at most one locator mode)
 * 5. Required-pair checks (offset requires blockId)
 * 6. Numeric bounds (offset >= 0, integer)
 */
function validateInsertInput(input: unknown): asserts input is InsertInput {
  // Step 0: Input shape guard
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Insert input must be a non-null object.');
  }

  // Step 1: pos runtime rejection (PR A — pos is not yet supported)
  if ('pos' in input) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'pos locator is not yet supported.', {
      field: 'pos',
    });
  }

  // Step 2: Unknown field rejection (strict allowlist)
  assertNoUnknownFields(input, INSERT_INPUT_ALLOWED_KEYS, 'insert');

  const { target, text, blockId, offset } = input;
  const hasTarget = target !== undefined;
  const hasBlockId = blockId !== undefined;
  const hasOffset = offset !== undefined;

  // Step 3: Target/type checks
  if (hasTarget && !isTextAddress(target)) {
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

  if (hasBlockId && typeof blockId !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `blockId must be a string, got ${typeof blockId}.`, {
      field: 'blockId',
      value: blockId,
    });
  }

  // Step 4: Mode exclusivity — at most one locator mode
  if (hasTarget && hasBlockId) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'Cannot combine target with blockId. Use exactly one locator mode.',
      { fields: ['target', 'blockId'] },
    );
  }
  if (hasTarget && hasOffset) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'Cannot combine target with offset. Use exactly one locator mode.',
      { fields: ['target', 'offset'] },
    );
  }

  // Step 5: Required-pair checks — offset requires blockId
  if (hasOffset && !hasBlockId) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'offset requires blockId.', {
      fields: ['offset', 'blockId'],
    });
  }

  // Step 6: Numeric bounds — offset must be a non-negative integer
  if (hasOffset) {
    assertNonNegativeInteger(offset, 'offset');
  }
}

export function executeInsert(
  adapter: WriteAdapter,
  input: InsertInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateInsertInput(input);

  const { target, blockId, offset, text } = input;

  // Pass friendly locator fields through to the adapter for normalization.
  // The adapter is responsible for converting blockId + offset into a canonical TextAddress.
  if (blockId !== undefined) {
    return executeWrite(adapter, { kind: 'insert', blockId, offset, text }, options);
  }

  // Canonical target or no-target (default insertion point)
  const request = target ? { kind: 'insert' as const, target, text } : { kind: 'insert' as const, text };

  return executeWrite(adapter, request, options);
}
