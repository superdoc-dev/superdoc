import type { TableBorderValue } from './index.js';

/**
 * Composition of a compound (multi-rule) border band.
 *
 * `segments` alternate rule, gap, rule, ... starting at the band's OUTER face
 * (table boundary / neighbor-facing side) and ending at the inner face (cell
 * content side). 3 segments = 2 rules, 5 segments = 3 rules. `band` is the sum.
 */
export type BorderBandProfile = {
  segments: number[];
  band: number;
};

// Fixed rule/gap widths at CSS 96dpi: 0.75pt and 1.5pt.
const PT_075 = 1;
const PT_150 = 2;

/**
 * Per-style band composition as a function of the authored width `w` (px).
 * Every formula is MEASURED from Word renders (300dpi probe tables at
 * sz {4,12,24}); see the SD-3308 compound-borders plan for the raw data.
 * "thinThick" carries the sz-scaled rule on the OUTER face, "thickThin" on the
 * inner face; thinThickThin* scales the center rule except LargeGap, where the
 * gaps scale and the center is fixed at 1.5pt.
 */
const COMPOUND_PROFILES: Record<string, (w: number) => number[]> = {
  double: (w) => [w, w, w],
  triple: (w) => [w, w, w, w, w],
  thinThickSmallGap: (w) => [w, PT_075, PT_075],
  thickThinSmallGap: (w) => [PT_075, PT_075, w],
  thinThickMediumGap: (w) => [w, w / 2, w / 2],
  thickThinMediumGap: (w) => [w / 2, w / 2, w],
  thinThickLargeGap: (w) => [PT_150, w, PT_075],
  thickThinLargeGap: (w) => [PT_075, w, PT_150],
  thinThickThinSmallGap: (w) => [PT_075, PT_075, w, PT_075, PT_075],
  thinThickThinMediumGap: (w) => [w / 2, w / 2, w, w / 2, w / 2],
  thinThickThinLargeGap: (w) => [PT_075, w, PT_150, w, PT_075],
};

/**
 * Band composition for a compound border style, or null for single-rule styles
 * (callers keep their existing single-rule path). Rules and gaps are clamped to
 * >= 1px so hairline components stay visible, matching Word's measured minimums.
 */
export function getBorderBandProfile(value: TableBorderValue | null | undefined): BorderBandProfile | null {
  if (value == null || typeof value !== 'object') return null;
  if ('none' in value && value.none) return null;
  const raw = value as { style?: string; width?: number; size?: number };
  if (!raw.style) return null;
  const formula = COMPOUND_PROFILES[raw.style];
  if (!formula) return null;
  const w = typeof raw.width === 'number' ? raw.width : typeof raw.size === 'number' ? raw.size : 1;
  if (w <= 0) return null;
  const segments = formula(w).map((s) => Math.max(1, s));
  return { segments, band: segments.reduce((sum, s) => sum + s, 0) };
}

/**
 * Rendered border band width in pixels for a table or cell border value.
 *
 * This is the SINGLE source of truth for how wide a border paints, shared by the
 * DOM painter (CSS border width) and the measuring engine (row-height reservation)
 * so geometry and paint never disagree.
 *
 * Width semantics per ECMA-376 / Word rendering:
 * - `none`/nil (or explicit `{none:true}`) paint nothing: band 0.
 * - `thick` paints a single rule at the authored width (NOT doubled). Word renders
 *   ST_Border `thick` at the w:sz width, same weight as `single` for a given sz
 *   (150dpi Word probe of st-thick sz=12 = 3px@150 ≈ 1.5pt = authored). A 1px floor
 *   keeps a hairline visible. (SD-3028: prior 2x multiplier painted ~2x Word.)
 * - Compound styles (double, triple, thinThick*) paint a multi-rule band whose
 *   total width is the sum of the measured profile segments; see
 *   `getBorderBandProfile`. For `double` this preserves the original semantics:
 *   w:sz is the width of EACH rule, band = 3x the authored width, floored at 3px
 *   so both rules always render. (SD-3308)
 * - Every other style paints at the authored width.
 *
 * @param value - Border value from table attrs (`TableBorderValue`) or a cell-side
 *   `BorderSpec` (the `{none:true}` marker form is also accepted).
 * @returns Band width in pixels (always >= 0).
 */
export function getBorderBandWidthPx(value: TableBorderValue | null | undefined): number {
  if (value == null) return 0;
  if (typeof value !== 'object') return 0;
  if ('none' in value && value.none) return 0;
  const raw = value as { style?: string; width?: number; size?: number };
  if (raw.style === 'none') return 0;
  const w = typeof raw.width === 'number' ? raw.width : typeof raw.size === 'number' ? raw.size : 1;
  const width = Math.max(0, w);
  if (width === 0) return 0;
  if (raw.style === 'thick') return Math.max(width, 1);
  const profile = getBorderBandProfile(value);
  if (profile) return profile.band;
  return width;
}

/**
 * True when a band border renders correctly via the native CSS `border-style: double`
 * (two equal rules + gap) and must NOT be routed through the multi-rule nested-rectangle
 * overlay. `double` is the only ECMA-376 multi-rule style CSS expresses exactly (triple = 3
 * rules, thinThick* = unequal rules — CSS cannot, so those keep the overlay). Routing `double`
 * through the overlay forces its native CSS border transparent and repaints a single inner
 * rule, collapsing the double to one line. (SD-3028)
 *
 * @param style - A border style name (or undefined).
 * @returns true only for the `double` style.
 */
export function isNativeCssDoubleStyle(style: string | undefined): boolean {
  return style === 'double';
}
