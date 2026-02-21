import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields, assertNonNegativeInteger } from '../validation-primitives.js';

export interface ReplaceInput {
  target?: TextAddress;
  text: string;
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
}

const REPLACE_INPUT_ALLOWED_KEYS = new Set(['text', 'target', 'blockId', 'start', 'end']);

/**
 * Validates ReplaceInput and throws DocumentApiValidationError on violations.
 *
 * Validation order:
 * 0. Input shape guard
 * 1. Unknown field rejection
 * 2. Type checks (target shape, text, blockId types)
 * 3. At least one locator mode required
 * 4. Mode exclusivity (target vs blockId+start+end)
 * 5. Range completeness (blockId requires start+end)
 * 6. Orphaned start/end without blockId
 * 7. Numeric bounds (start/end >= 0, integer, start <= end)
 */
function validateReplaceInput(input: unknown): asserts input is ReplaceInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Replace input must be a non-null object.');
  }

  assertNoUnknownFields(input, REPLACE_INPUT_ALLOWED_KEYS, 'replace');

  const { target, text, blockId, start, end } = input;
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

  // At least one locator mode required (replace has no default target)
  if (!hasTarget && !hasBlockId && !hasStart && !hasEnd) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'Replace requires a target. Provide either target or blockId + start + end.',
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
      throw new DocumentApiValidationError('INVALID_TARGET', 'blockId requires both start and end for replace.', {
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

export function executeReplace(
  adapter: WriteAdapter,
  input: ReplaceInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateReplaceInput(input);

  const { target, blockId, start, end, text } = input;

  // Pass friendly locator fields through to the adapter for normalization.
  if (blockId !== undefined) {
    return executeWrite(adapter, { kind: 'replace', blockId, start, end, text }, options);
  }

  // Canonical target path
  return executeWrite(adapter, { kind: 'replace', target: target!, text }, options);
}
