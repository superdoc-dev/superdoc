import { normalizeMutationOptions, type MutationOptions } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';

/**
 * Input payload for `format.bold`.
 */
export interface FormatBoldInput {
  target: TextAddress;
}

/**
 * Input payload for `format.italic`.
 */
export interface FormatItalicInput {
  target: TextAddress;
}

/**
 * Input payload for `format.underline`.
 */
export interface FormatUnderlineInput {
  target: TextAddress;
}

/**
 * Input payload for `format.strikethrough`.
 */
export interface FormatStrikethroughInput {
  target: TextAddress;
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
  return adapter.strikethrough(input, normalizeMutationOptions(options));
}
