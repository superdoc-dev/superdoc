/**
 * Format helper methods for the Node SDK.
 *
 * These are hand-written convenience wrappers that call the canonical
 * `format.apply` operation with pre-filled inline directives. They are NOT generated
 * from the contract and will not be overwritten by `pnpm run generate:all`.
 *
 * Usage:
 * ```ts
 * import { createSuperDocClient } from 'superdoc';
 * import { formatBold, unformatBold, clearBold } from 'superdoc/helpers/format';
 *
 * const client = createSuperDocClient();
 * await client.connect();
 * const doc = await client.open({ doc: './file.docx' });
 *
 * // Apply bold ON:
 * await formatBold(doc.format.apply, { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } });
 *
 * // Apply explicit bold OFF (override style inheritance):
 * await unformatBold(doc.format.apply, { blockId: 'p1', start: 0, end: 5 });
 *
 * // Clear direct bold formatting (inherit from style cascade):
 * await clearBold(doc.format.apply, { blockId: 'p1', start: 0, end: 5 });
 * ```
 */

import type { InvokeOptions } from '../runtime/transport-common.js';

export interface FormatHelperParams {
  target?: { kind: 'text'; blockId: string; range: { start: number; end: number } };
  /** Flat-flag shorthand for target.blockId (normalized before dispatch). */
  blockId?: string;
  /** Flat-flag shorthand for target.range.start (normalized before dispatch). */
  start?: number;
  /** Flat-flag shorthand for target.range.end (normalized before dispatch). */
  end?: number;
  dryRun?: boolean;
  changeMode?: 'direct' | 'tracked';
  expectedRevision?: string;
}

/**
 * Bound format.apply method from a document handle.
 * Signature matches `doc.format.apply(params, options)`.
 */
type FormatApplyFn = (params?: Record<string, unknown>, options?: InvokeOptions) => Promise<unknown>;

/**
 * Normalizes flat-flag shorthand params (blockId, start, end) into a
 * canonical `target` object. If `target` is already provided, flat flags
 * are left untouched (the caller provided the canonical form directly).
 */
function normalizeFormatParams(params: FormatHelperParams): Record<string, unknown> {
  const { blockId, start, end, target, ...rest } = params;
  if (blockId !== undefined && target === undefined) {
    return {
      ...rest,
      target: { kind: 'text', blockId, range: { start: start ?? 0, end: end ?? 0 } },
    };
  }
  return params as Record<string, unknown>;
}

function mergeInlineStyles(params: FormatHelperParams, inline: Record<string, string>): Record<string, unknown> {
  return { ...normalizeFormatParams(params), inline };
}

// ---------------------------------------------------------------------------
// format* helpers — apply ON directive
// ---------------------------------------------------------------------------

/** Apply bold ON. Equivalent to `format.apply` with `inline: { bold: 'on' }`. */
export function formatBold(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { bold: 'on' }), options);
}

/** Apply italic ON. Equivalent to `format.apply` with `inline: { italic: 'on' }`. */
export function formatItalic(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { italic: 'on' }), options);
}

/** Apply underline ON. Equivalent to `format.apply` with `inline: { underline: 'on' }`. */
export function formatUnderline(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { underline: 'on' }), options);
}

/** Apply strikethrough ON. Equivalent to `format.apply` with `inline: { strike: 'on' }`. */
export function formatStrikethrough(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { strike: 'on' }), options);
}

// ---------------------------------------------------------------------------
// unformat* helpers — apply explicit OFF directive (style override)
// ---------------------------------------------------------------------------

/** Apply bold OFF. Equivalent to `format.apply` with `inline: { bold: 'off' }`. */
export function unformatBold(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { bold: 'off' }), options);
}

/** Apply italic OFF. Equivalent to `format.apply` with `inline: { italic: 'off' }`. */
export function unformatItalic(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { italic: 'off' }), options);
}

/** Apply underline OFF. Equivalent to `format.apply` with `inline: { underline: 'off' }`. */
export function unformatUnderline(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { underline: 'off' }), options);
}

/** Apply strikethrough OFF. Equivalent to `format.apply` with `inline: { strike: 'off' }`. */
export function unformatStrikethrough(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { strike: 'off' }), options);
}

// ---------------------------------------------------------------------------
// clear* helpers — remove direct formatting (inherit from style cascade)
// ---------------------------------------------------------------------------

/** Clear bold formatting. Equivalent to `format.apply` with `inline: { bold: 'clear' }`. */
export function clearBold(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { bold: 'clear' }), options);
}

/** Clear italic formatting. Equivalent to `format.apply` with `inline: { italic: 'clear' }`. */
export function clearItalic(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { italic: 'clear' }), options);
}

/** Clear underline formatting. Equivalent to `format.apply` with `inline: { underline: 'clear' }`. */
export function clearUnderline(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { underline: 'clear' }), options);
}

/** Clear strikethrough formatting. Equivalent to `format.apply` with `inline: { strike: 'clear' }`. */
export function clearStrikethrough(apply: FormatApplyFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return apply(mergeInlineStyles(params, { strike: 'clear' }), options);
}
