/**
 * Proportionally rescales table column widths when the measured total width
 * exceeds the available fragment width.
 *
 * Returns `undefined` when no rescaling is needed (total fits within fragment).
 * Each column is guaranteed at least 1px; the last column absorbs rounding drift.
 *
 * @param measureColumnWidths - Measured widths per column (or undefined)
 * @param measureTotalWidth - Sum of measured widths plus borders/spacing
 * @param fragmentWidth - Available render width for the table
 * @returns Rescaled widths array, or undefined if no scaling needed
 */
export function rescaleColumnWidths(
  measureColumnWidths: number[] | undefined,
  measureTotalWidth: number,
  fragmentWidth: number,
): number[] | undefined {
  if (
    !measureColumnWidths ||
    measureColumnWidths.length === 0 ||
    measureTotalWidth <= fragmentWidth ||
    measureTotalWidth <= 0
  ) {
    return undefined;
  }
  const scale = fragmentWidth / measureTotalWidth;
  const scaled = measureColumnWidths.map((w) => Math.max(1, Math.round(w * scale)));
  const scaledSum = scaled.reduce((a, b) => a + b, 0);
  const target = Math.round(fragmentWidth);
  if (scaledSum !== target && scaled.length > 0) {
    scaled[scaled.length - 1] = Math.max(1, scaled[scaled.length - 1] + (target - scaledSum));
  }
  return scaled;
}
