/**
 * Format helper methods for the Node SDK.
 *
 * These are hand-written convenience wrappers that call the canonical
 * `format.apply` operation with pre-filled inline styles. They are NOT generated
 * from the contract and will not be overwritten by `pnpm run generate:all`.
 *
 * Usage:
 * ```ts
 * import { createSuperDocClient } from 'superdoc';
 * import { formatBold, formatItalic } from 'superdoc/helpers/format';
 *
 * const client = createSuperDocClient();
 * await client.connect();
 *
 * // Canonical form:
 * await formatBold(client.doc, { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } });
 *
 * // Flat-flag shorthand (normalized before dispatch):
 * await formatBold(client.doc, { blockId: 'p1', start: 0, end: 5 });
 * ```
 */

import type { InvokeOptions, OperationSpec } from '../runtime/transport-common.js';

/**
 * Minimal operation spec for `format.apply`. Used to invoke the canonical
 * operation through the runtime without depending on generated code.
 *
 * Only canonical params are listed here. Flat-flag shortcuts (blockId,
 * start, end) are accepted via FormatHelperParams and normalized into
 * a `target` object before invoke.
 */
const FORMAT_APPLY_SPEC: OperationSpec = {
  operationId: 'doc.format.apply',
  commandTokens: ['format', 'apply'],
  params: [
    { name: 'doc', kind: 'doc', type: 'string' },
    { name: 'sessionId', kind: 'doc', flag: 'session', type: 'string' },
    { name: 'target', kind: 'jsonFlag', type: 'json' },
    { name: 'inline', kind: 'jsonFlag', type: 'json' },
    { name: 'dryRun', kind: 'flag', type: 'boolean' },
    { name: 'changeMode', kind: 'flag', type: 'string' },
    { name: 'expectedRevision', kind: 'flag', type: 'string' },
  ],
};

export interface FormatHelperParams {
  doc?: string;
  sessionId?: string;
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
 * Generic invoke function that works with the SuperDocRuntime.
 * The doc API proxy created by `createDocApi(runtime)` exposes generated methods,
 * but helpers call the runtime directly for forward-compatibility.
 */
type RuntimeInvokeFn = <T = unknown>(
  operation: OperationSpec,
  params?: Record<string, unknown>,
  options?: InvokeOptions,
) => Promise<T>;

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

function mergeInlineStyles(params: FormatHelperParams, inline: Record<string, boolean>): Record<string, unknown> {
  return { ...normalizeFormatParams(params), inline };
}

/**
 * Apply bold formatting to a text range.
 *
 * Equivalent to `format.apply` with `inline: { bold: true }`.
 */
export function formatBold(invoke: RuntimeInvokeFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return invoke(FORMAT_APPLY_SPEC, mergeInlineStyles(params, { bold: true }), options);
}

/**
 * Apply italic formatting to a text range.
 *
 * Equivalent to `format.apply` with `inline: { italic: true }`.
 */
export function formatItalic(invoke: RuntimeInvokeFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return invoke(FORMAT_APPLY_SPEC, mergeInlineStyles(params, { italic: true }), options);
}

/**
 * Apply underline formatting to a text range.
 *
 * Equivalent to `format.apply` with `inline: { underline: true }`.
 */
export function formatUnderline(invoke: RuntimeInvokeFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return invoke(FORMAT_APPLY_SPEC, mergeInlineStyles(params, { underline: true }), options);
}

/**
 * Apply strikethrough formatting to a text range.
 *
 * Equivalent to `format.apply` with `inline: { strike: true }`.
 */
export function formatStrikethrough(invoke: RuntimeInvokeFn, params: FormatHelperParams = {}, options?: InvokeOptions) {
  return invoke(FORMAT_APPLY_SPEC, mergeInlineStyles(params, { strike: true }), options);
}
