// @ts-check
import { twipsToPixels, pixelsToTwips } from '@core/super-converter/helpers.js';
import { DEFAULT_COLUMN_WIDTH_PX, getSchemaDefaultColumnWidthPx } from '../v3/handlers/w/tblGrid/tblGrid-helpers.js';

export const DEFAULT_PAGE_WIDTH_TWIPS = 12240; // 8.5"
export const DEFAULT_PAGE_MARGIN_TWIPS = 1440; // 1" on each side
export const DEFAULT_CONTENT_WIDTH_TWIPS = DEFAULT_PAGE_WIDTH_TWIPS - 2 * DEFAULT_PAGE_MARGIN_TWIPS;

export const MIN_COLUMN_WIDTH_TWIPS = pixelsToTwips(10);

// Word stores percentages in fiftieths (e.g., 5000 => 100%). Convert to standard percent units.
export const pctToPercent = (value) => {
  if (value == null) return null;
  return value / 50;
};

export const resolveContentWidthTwips = () => DEFAULT_CONTENT_WIDTH_TWIPS;

export const resolveMeasurementWidthPx = (measurement) => {
  if (!measurement || typeof measurement.value !== 'number' || measurement.value <= 0) return null;
  const { value, type } = measurement;

  if (!type || type === 'auto') return null;
  if (type === 'dxa') return twipsToPixels(value);
  if (type === 'pct') {
    const percent = pctToPercent(value);
    if (percent == null || percent <= 0) return null;
    const widthTwips = (resolveContentWidthTwips() * percent) / 100;
    return twipsToPixels(widthTwips);
  }
  return null;
};

export const countColumnsInRow = (row) => {
  if (!row?.elements?.length) return 0;
  return row.elements.reduce((count, element) => {
    if (element.name !== 'w:tc') return count;
    const tcPr = element.elements?.find((el) => el.name === 'w:tcPr');
    const gridSpan = tcPr?.elements?.find((el) => el.name === 'w:gridSpan');
    const spanValue = parseInt(gridSpan?.attributes?.['w:val'] || '1', 10);
    return count + (Number.isFinite(spanValue) && spanValue > 0 ? spanValue : 1);
  }, 0);
};

const clampColumnWidthTwips = (value) => Math.max(Math.round(value), MIN_COLUMN_WIDTH_TWIPS);

const createFallbackGrid = (columnCount, columnWidthTwips) =>
  Array.from({ length: columnCount }, () => ({ col: clampColumnWidthTwips(columnWidthTwips) }));

/**
 * Build fallback grid and column widths when grid columns are missing.
 * @param {object} params
 * @param {Partial<import('@translator').SCDecoderConfig>} params.params
 * @param {Array} params.rows
 * @param {{ width?: number|null }} [params.tableWidth]
 * @param {{ value?: number, type?: string }} [params.tableWidthMeasurement]
 * @returns {{ grid: Array<{ col: number }>, columnWidths: number[] } | null}
 */
export const buildFallbackGridForTable = ({ params, rows, tableWidth, tableWidthMeasurement }) => {
  const firstRow = rows.find((row) => row.elements?.some((el) => el.name === 'w:tc'));
  const columnCount = countColumnsInRow(firstRow);
  if (!columnCount) return null;

  const schemaDefaultPx = getSchemaDefaultColumnWidthPx(/** @type {any} */ (params));
  const minimumColumnWidthPx =
    Number.isFinite(schemaDefaultPx) && schemaDefaultPx > 0 ? schemaDefaultPx : DEFAULT_COLUMN_WIDTH_PX;

  let totalWidthPx;

  if (tableWidthMeasurement) {
    const resolved = resolveMeasurementWidthPx(tableWidthMeasurement);
    if (resolved != null) totalWidthPx = resolved;
  }

  if (totalWidthPx == null && tableWidth?.width && tableWidth.width > 0) {
    totalWidthPx = tableWidth.width;
  }

  if (totalWidthPx == null) {
    // No explicit width available — default to full page content width.
    // This matches Word's autofit behavior for tables without w:tblGrid.
    totalWidthPx = twipsToPixels(DEFAULT_CONTENT_WIDTH_TWIPS);
  }

  const rawColumnWidthPx = Math.max(totalWidthPx / columnCount, minimumColumnWidthPx);
  const columnWidthTwips = clampColumnWidthTwips(pixelsToTwips(rawColumnWidthPx));
  const fallbackColumnWidthPx = twipsToPixels(columnWidthTwips);

  return {
    grid: createFallbackGrid(columnCount, columnWidthTwips),
    columnWidths: Array(columnCount).fill(fallbackColumnWidthPx),
  };
};
