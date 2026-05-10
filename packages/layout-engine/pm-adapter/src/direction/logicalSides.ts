/**
 * Logical-to-physical side helpers for direction-aware layout values.
 *
 * OOXML uses "logical" sides (start, end) that flip based on paragraph
 * inline direction. CSS uses "physical" sides (left, right). These
 * helpers do the mapping using a ParagraphDirectionContext as the
 * single source of truth.
 *
 * Consumers use these instead of asking "is the paragraph RTL?" and
 * mapping inline. That keeps the direction question in one place.
 */

import type { BaseDirection, ParagraphDirectionContext } from '@superdoc/contracts';

/**
 * Map a logical justification value to a physical one.
 *
 * `start` and `end` are direction-aware aliases for `left` and `right`.
 * `both` is full-justify; the others (left, right, center, distribute, kashida...)
 * pass through unchanged.
 */
export const resolveLogicalAlignment = (
  justification: string | undefined,
  context: ParagraphDirectionContext,
): string | undefined => {
  if (!justification) return justification;
  const isRtl = context.inlineDirection === 'rtl';
  if (justification === 'start') return isRtl ? 'right' : 'left';
  if (justification === 'end') return isRtl ? 'left' : 'right';
  return justification;
};

/**
 * Logical indent fields can include `start`/`end` aliases. Map them to
 * physical `left`/`right` based on direction. If the indent already has
 * physical sides, those win (no clobbering).
 */
export const resolveLogicalIndent = <T extends Record<string, unknown>>(
  indent: T | undefined,
  context: ParagraphDirectionContext,
): T | undefined => {
  if (!indent) return undefined;
  const isRtl = context.inlineDirection === 'rtl';
  const result = { ...indent } as Record<string, unknown>;
  const start = (indent as { start?: unknown }).start;
  const end = (indent as { end?: unknown }).end;
  if (start !== undefined) {
    const physical = isRtl ? 'right' : 'left';
    if (result[physical] === undefined) result[physical] = start;
    delete result.start;
  }
  if (end !== undefined) {
    const physical = isRtl ? 'left' : 'right';
    if (result[physical] === undefined) result[physical] = end;
    delete result.end;
  }
  return result as T;
};

/**
 * Direction-aware physical side resolver: returns the physical side a
 * caller should write to, given a logical side and the paragraph context.
 */
export const physicalSide = (logical: 'start' | 'end', context: ParagraphDirectionContext): 'left' | 'right' => {
  const isRtl = context.inlineDirection === 'rtl';
  if (logical === 'start') return isRtl ? 'right' : 'left';
  return isRtl ? 'left' : 'right';
};

/** Convenience: is the paragraph context RTL? */
export const isRtl = (context: ParagraphDirectionContext | undefined): boolean => context?.inlineDirection === 'rtl';

/** Convenience: extract a BaseDirection or undefined. */
export const toBaseDirection = (context: ParagraphDirectionContext | undefined): BaseDirection | undefined =>
  context?.inlineDirection;
