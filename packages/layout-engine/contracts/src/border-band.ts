import type { TableBorderValue } from './index.js';

/**
 * Rendered border band width in pixels for a table or cell border value.
 *
 * This is the SINGLE source of truth for how wide a border paints, shared by the
 * DOM painter (CSS border width) and the measuring engine (row-height reservation)
 * so geometry and paint never disagree.
 *
 * Width semantics per ECMA-376 / Word rendering:
 * - `none`/nil (or explicit `{none:true}`) paint nothing: band 0.
 * - `thick` paints a heavier single rule: 2x the authored width, min 3px.
 * - `double` w:sz is the width of EACH rule; Word paints rule + gap + rule at ~3x
 *   that width (measured against Word output: sz12 = 1.5pt rules, ~4.5pt band).
 *   CSS `double` divides the border-width into thirds, so the band is 3x the
 *   authored width, floored at 3px so both rules always render (CSS collapses
 *   `double` below 3px into a single solid-looking line). (SD-3308)
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
  if (raw.style === 'thick') return Math.max(width * 2, 3);
  if (raw.style === 'double') return Math.max(width * 3, 3);
  return width;
}
