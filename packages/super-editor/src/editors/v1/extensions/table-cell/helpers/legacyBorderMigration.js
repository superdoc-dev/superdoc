// @ts-check

/**
 * Helpers for migrating legacy `attrs.borders` (px-based schema defaults)
 * to `tableCellProperties.borders` (OOXML format, canonical source).
 *
 * Used by:
 * - table.js appendTransaction plugin (Path A: editing-mode normalization)
 * - translate-table-cell.js (Path B: exporter fallback for immediate export)
 */

const PX_PER_PT = 96 / 72;

/** Pixels to eighths-of-a-point (OOXML ST_EighthPointMeasure) */
const pxToEighthPoints = (px) => Math.round((px / PX_PER_PT) * 8);

const SIDES = ['top', 'right', 'bottom', 'left'];

/**
 * Detects the old `createCellBorders()` schema-default shape.
 * These borders have `{ size, color }` without a `val` property on every side.
 *
 * @param {Record<string, any> | null | undefined} borders
 * @returns {boolean}
 */
export function isLegacySchemaDefaultBorders(borders) {
  if (!borders || typeof borders !== 'object') return false;
  return SIDES.every((side) => {
    const b = borders[side];
    if (!b || typeof b !== 'object') return false;
    return !('val' in b) && b.size === 0.66665 && b.color === '#000000';
  });
}

/**
 * Converts old px-based `attrs.borders` to OOXML format for `tableCellProperties.borders`.
 *
 * @param {Record<string, any>} borders - Old-format borders `{ top: { size, color, val? }, ... }`
 * @returns {Record<string, any>} OOXML-format borders `{ top: { val, size, space, color }, ... }`
 */
export function convertBordersToOoxmlFormat(borders) {
  const result = {};
  for (const side of SIDES) {
    const b = borders[side];
    if (!b || typeof b !== 'object') continue;
    result[side] = {
      val: b.val || 'single',
      size: typeof b.size === 'number' ? pxToEighthPoints(b.size) : 4,
      space: b.space || 0,
      color: b.color === '#000000' ? 'auto' : b.color || 'auto',
    };
  }
  return result;
}
