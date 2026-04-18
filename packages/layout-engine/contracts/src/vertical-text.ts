/**
 * Shared vertical-text helpers for superscript, subscript, and explicit baseline shifts.
 *
 * OOXML allows both semantic vertical alignment (`vertAlign`) and an explicit
 * position offset (`position`). During rendering, a zero offset is an identity
 * value and should behave the same as an absent offset.
 */

export type VerticalTextAlign = 'superscript' | 'subscript' | 'baseline';

type VerticalTextFormatting = {
  vertAlign?: VerticalTextAlign | null;
  baselineShift?: number | null;
};

/**
 * Font size scaling factor for default superscript/subscript rendering.
 * Matches Microsoft Word's default visual behavior closely enough for layout.
 */
export const SUBSCRIPT_SUPERSCRIPT_SCALE = 0.65;

const BASELINE_SHIFT_EPSILON = 1e-6;

/**
 * Normalizes explicit baseline shifts for rendering.
 *
 * A numeric shift of zero is a no-op and should not override semantic
 * superscript/subscript styling. This preserves the raw OOXML value for
 * round-tripping while giving the renderer a clean intent model.
 */
export function normalizeBaselineShift(baselineShift: number | null | undefined): number | undefined {
  if (!Number.isFinite(baselineShift)) {
    return undefined;
  }

  const normalizedShift = baselineShift as number;
  return Math.abs(normalizedShift) <= BASELINE_SHIFT_EPSILON ? undefined : normalizedShift;
}

export function hasExplicitBaselineShift(baselineShift: number | null | undefined): boolean {
  return normalizeBaselineShift(baselineShift) != null;
}

export function isSuperscriptOrSubscript(vertAlign: VerticalTextAlign | null | undefined): boolean {
  return vertAlign === 'superscript' || vertAlign === 'subscript';
}

/**
 * Returns true when the run should use the default superscript/subscript
 * presentation path: scaled font size plus the renderer's default raise/lower.
 */
export function usesDefaultScriptLayout(formatting: VerticalTextFormatting): boolean {
  return isSuperscriptOrSubscript(formatting.vertAlign) && !hasExplicitBaselineShift(formatting.baselineShift);
}

/**
 * Applies default superscript/subscript font scaling when the run uses the
 * default semantic layout path.
 */
export function scaleFontSizeForVerticalText(fontSize: number, formatting: VerticalTextFormatting): number {
  if (!Number.isFinite(fontSize)) {
    return fontSize;
  }

  return usesDefaultScriptLayout(formatting) ? fontSize * SUBSCRIPT_SUPERSCRIPT_SCALE : fontSize;
}

/**
 * Returns the original base font size for runs that already carry scaled
 * superscript/subscript text metrics.
 */
export function resolveBaseFontSizeForVerticalText(fontSize: number, formatting: VerticalTextFormatting): number {
  if (!Number.isFinite(fontSize)) {
    return fontSize;
  }

  return usesDefaultScriptLayout(formatting) ? fontSize / SUBSCRIPT_SUPERSCRIPT_SCALE : fontSize;
}
