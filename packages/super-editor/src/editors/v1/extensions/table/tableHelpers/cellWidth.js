// @ts-check

/** Twips per CSS pixel at 96 DPI (1440 twips/inch / 96 px/inch). */
export const TWIPS_PER_PX = 15;

/**
 * Build the OOXML `w:tcW` cell-width value (in twips) for a pixel column width.
 *
 * Word writes `w:tcW` on every cell it inserts. The concrete cell width marks the
 * grid as a real layout cache, so the measuring pass preserves the requested column
 * widths instead of content-sizing the table as pure-auto. Both `createTable` and the
 * `insertTableAt` command emit this so inserted tables behave identically. (SD-3308/SD-3309)
 *
 * @param {number} widthPx - Column width in CSS pixels.
 * @returns {{ value: number, type: 'dxa' }} The `tcW` dxa measurement.
 */
export function cellWidthDxa(widthPx) {
  return { value: widthPx * TWIPS_PER_PX, type: 'dxa' };
}
