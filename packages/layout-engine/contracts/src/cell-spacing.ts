import type { CellSpacing } from './index.js';

/** 15 twips per pixel (1440 twips/inch ÷ 96 px/inch). */
const TWIPS_PER_PX = 15;

/**
 * Resolves table cell spacing to pixels (for border-spacing).
 *
 * Handles number (px) or `{ type, value }`. The editor/DOCX decoder often stores
 * value already in pixels, so we use value as px. If value is in twips (raw OOXML),
 * type is `'dxa'` and we convert; otherwise value is treated as px.
 *
 * @param cellSpacing - Cell spacing value from block attrs
 * @returns Cell spacing in pixels (always >= 0)
 */
export function getCellSpacingPx(cellSpacing: CellSpacing | number | null | undefined): number {
  if (cellSpacing == null) return 0;
  if (typeof cellSpacing === 'number') return Math.max(0, cellSpacing);
  const v = cellSpacing.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  const t = (cellSpacing.type ?? '').toLowerCase();
  // Editor/store often has value already in px; raw OOXML has twips (dxa). Only convert when value looks like twips (large).
  const asPx = t === 'dxa' && v >= 20 ? v / TWIPS_PER_PX : v;
  return Math.max(0, asPx);
}
