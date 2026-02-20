import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields, assertNonNegativeInteger } from '../validation-primitives.js';

export interface DeleteInput {
  target?: TextAddress;
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
}

const DELETE_INPUT_ALLOWED_KEYS = new Set(['target', 'blockId', 'start', 'end']);

/**
 * Validates DeleteInput and throws DocumentApiValidationError on violations.
 *
 * Validation order:
 * 0. Input shape guard
 * 1. Unknown field rejection
 * 2. Type checks (target shape, blockId type)
 * 3. At least one locator mode required
 * 4. Mode exclusivity (target vs blockId+start+end)
 * 5. Range completeness (blockId requires start+end)
 * 6. Orphaned start/end without blockId
 * 7. Numeric bounds (start/end >= 0, integer, start <= end)
 */
function validateDeleteInput(input: unknown): asserts input is DeleteInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Delete input must be a non-null object.');
  }

  assertNoUnknownFields(input, DELETE_INPUT_ALLOWED_KEYS, 'delete');

  const { target, blockId, start, end } = input;
  const hasTarget = target !== undefined;
  const hasBlockId = blockId !== undefined;
  const hasStart = start !== undefined;
  const hasEnd = end !== undefined;

  // Type checks
  if (hasTarget && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  if (hasBlockId && typeof blockId !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `blockId must be a string, got ${typeof blockId}.`, {
      field: 'blockId',
      value: blockId,
    });
  }

  // At least one locator mode required (delete has no default target)
  if (!hasTarget && !hasBlockId && !hasStart && !hasEnd) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'Delete requires a target. Provide either target or blockId + start + end.',
    );
  }

  // Mode exclusivity — target vs blockId/start/end
  if (hasTarget && (hasBlockId || hasStart || hasEnd)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'Cannot combine target with blockId/start/end. Use exactly one locator mode.',
      {
        fields: [
          'target',
          ...(hasBlockId ? ['blockId'] : []),
          ...(hasStart ? ['start'] : []),
          ...(hasEnd ? ['end'] : []),
        ],
      },
    );
  }

  // Orphaned start/end without blockId
  if (!hasBlockId && (hasStart || hasEnd)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'start/end require blockId.', {
      fields: ['blockId', ...(hasStart ? ['start'] : []), ...(hasEnd ? ['end'] : [])],
    });
  }

  // Range completeness — blockId requires start+end
  if (hasBlockId && !hasTarget) {
    if (!hasStart || !hasEnd) {
      throw new DocumentApiValidationError('INVALID_TARGET', 'blockId requires both start and end for delete.', {
        fields: ['blockId', 'start', 'end'],
      });
    }
  }

  // Numeric bounds
  if (hasStart) {
    assertNonNegativeInteger(start, 'start');
  }
  if (hasEnd) {
    assertNonNegativeInteger(end, 'end');
  }
  if (hasStart && hasEnd && (start as number) > (end as number)) {
    throw new DocumentApiValidationError('INVALID_TARGET', `start must be <= end, got start=${start}, end=${end}.`, {
      fields: ['start', 'end'],
      start,
      end,
    });
  }
}

export function executeDelete(
  adapter: WriteAdapter,
  input: DeleteInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateDeleteInput(input);

  const { target, blockId, start, end } = input;

  // Pass friendly locator fields through to the adapter for normalization.
  if (blockId !== undefined) {
    return executeWrite(adapter, { kind: 'delete', blockId, start, end, text: '' }, options);
  }

  // Canonical target path
  return executeWrite(adapter, { kind: 'delete', target: target!, text: '' }, options);
}
