import type { ResolvedInlineBoxStyle } from './index.js';

export type InlineBoxLogicalSides = number | { start: number; end: number };

export type ResolvedInlineBoxLogicalSides = { start: number; end: number };

/** True for finite, non-negative integer CSS pixel values. */
export const isFiniteNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;

/**
 * Expands a scalar logical value into explicit start/end values.
 *
 * Undefined resolves to zero. Invalid or non-integer input fails closed.
 */
export const normalizeInlineBoxLogicalSides = (
  value: InlineBoxLogicalSides | undefined,
): ResolvedInlineBoxLogicalSides | null => {
  if (value === undefined) return { start: 0, end: 0 };
  if (isFiniteNonNegativeInteger(value)) return { start: value, end: value };
  if (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNonNegativeInteger(value.start) &&
    isFiniteNonNegativeInteger(value.end)
  ) {
    return { start: value.start, end: value.end };
  }
  return null;
};

/** Stable signature for every metric and appearance value consumed by paint. */
export const inlineBoxStyleSignature = (style: ResolvedInlineBoxStyle): string =>
  JSON.stringify([
    style.paddingInlineStart,
    style.paddingInlineEnd,
    style.paddingBlockStart,
    style.paddingBlockEnd,
    style.gapBefore,
    style.gapAfter,
    style.borderWidth,
    style.backgroundColor ?? '',
    style.borderColor ?? '',
    style.borderStyle ?? '',
    style.borderRadius ?? '',
    style.color ?? '',
  ]);
