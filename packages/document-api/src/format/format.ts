import { normalizeMutationOptions, type MutationOptions } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields, assertNonNegativeInteger } from '../validation-primitives.js';

/**
 * Input payload for `format.bold`.
 */
export interface FormatBoldInput {
  target?: TextAddress;
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
}

/**
 * Input payload for `format.italic`.
 */
export interface FormatItalicInput {
  target?: TextAddress;
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
}

/**
 * Input payload for `format.underline`.
 */
export interface FormatUnderlineInput {
  target?: TextAddress;
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
}

/**
 * Input payload for `format.strikethrough`.
 */
export interface FormatStrikethroughInput {
  target?: TextAddress;
  /** Block ID for block-relative range targeting. Requires `start` and `end`. */
  blockId?: string;
  /** Start offset within the block. Requires `blockId` and `end`. Non-negative integer. */
  start?: number;
  /** End offset within the block. Requires `blockId` and `start`. Non-negative integer, >= start. */
  end?: number;
}

const FORMAT_INPUT_ALLOWED_KEYS = new Set(['target', 'blockId', 'start', 'end']);

/**
 * Validates a format operation input and throws DocumentApiValidationError on violations.
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
function validateFormatInput(input: unknown, operationName: string): asserts input is FormatBoldInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} input must be a non-null object.`);
  }

  assertNoUnknownFields(input, FORMAT_INPUT_ALLOWED_KEYS, operationName);

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

  // At least one locator mode required
  if (!hasTarget && !hasBlockId && !hasStart && !hasEnd) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} requires a target. Provide either target or blockId + start + end.`,
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
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        `blockId requires both start and end for ${operationName}.`,
        { fields: ['blockId', 'start', 'end'] },
      );
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

export interface FormatAdapter {
  /** Apply or toggle bold formatting on the target text range. */
  bold(input: FormatBoldInput, options?: MutationOptions): TextMutationReceipt;
  /** Apply or toggle italic formatting on the target text range. */
  italic(input: FormatItalicInput, options?: MutationOptions): TextMutationReceipt;
  /** Apply or toggle underline formatting on the target text range. */
  underline(input: FormatUnderlineInput, options?: MutationOptions): TextMutationReceipt;
  /** Apply or toggle strikethrough formatting on the target text range. */
  strikethrough(input: FormatStrikethroughInput, options?: MutationOptions): TextMutationReceipt;
}

export type FormatApi = FormatAdapter;

/**
 * Executes `format.bold` using the provided adapter.
 *
 * @param adapter - Adapter implementation that performs format mutations.
 * @param input - Text target payload for the bold mutation.
 * @param options - Optional mutation execution options.
 * @returns The mutation receipt produced by the adapter.
 * @throws {Error} Propagates adapter errors when the target or capabilities are invalid.
 *
 * @example
 * ```ts
 * const receipt = executeFormatBold(adapter, {
 *   target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
 * });
 * ```
 */
export function executeFormatBold(
  adapter: FormatAdapter,
  input: FormatBoldInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateFormatInput(input, 'format.bold');
  return adapter.bold(input, normalizeMutationOptions(options));
}

/**
 * Executes `format.italic` using the provided adapter.
 *
 * @param adapter - Adapter implementation that performs format mutations.
 * @param input - Text target payload for the italic mutation.
 * @param options - Optional mutation execution options.
 * @returns The mutation receipt produced by the adapter.
 * @throws {Error} Propagates adapter errors when the target or capabilities are invalid.
 *
 * @example
 * ```ts
 * const receipt = executeFormatItalic(adapter, {
 *   target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
 * });
 * ```
 */
export function executeFormatItalic(
  adapter: FormatAdapter,
  input: FormatItalicInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateFormatInput(input, 'format.italic');
  return adapter.italic(input, normalizeMutationOptions(options));
}

/**
 * Executes `format.underline` using the provided adapter.
 *
 * @param adapter - Adapter implementation that performs format mutations.
 * @param input - Text target payload for the underline mutation.
 * @param options - Optional mutation execution options.
 * @returns The mutation receipt produced by the adapter.
 * @throws {Error} Propagates adapter errors when the target or capabilities are invalid.
 *
 * @example
 * ```ts
 * const receipt = executeFormatUnderline(adapter, {
 *   target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
 * });
 * ```
 */
export function executeFormatUnderline(
  adapter: FormatAdapter,
  input: FormatUnderlineInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateFormatInput(input, 'format.underline');
  return adapter.underline(input, normalizeMutationOptions(options));
}

/**
 * Executes `format.strikethrough` using the provided adapter.
 *
 * @param adapter - Adapter implementation that performs format mutations.
 * @param input - Text target payload for the strikethrough mutation.
 * @param options - Optional mutation execution options.
 * @returns The mutation receipt produced by the adapter.
 * @throws {Error} Propagates adapter errors when the target or capabilities are invalid.
 *
 * @example
 * ```ts
 * const receipt = executeFormatStrikethrough(adapter, {
 *   target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
 * });
 * ```
 */
export function executeFormatStrikethrough(
  adapter: FormatAdapter,
  input: FormatStrikethroughInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateFormatInput(input, 'format.strikethrough');
  return adapter.strikethrough(input, normalizeMutationOptions(options));
}
