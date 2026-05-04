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

/**
 * Read the raw row skip metadata that matters for fallback logical-grid construction.
 *
 * This helper intentionally works from the original OOXML row node because
 * `buildFallbackGridForTable` runs before `trTranslator` inserts any placeholder
 * cells for `gridBefore` / `gridAfter`.
 *
 * @param {object} row
 * @returns {{
 *   gridBefore: number,
 *   gridAfter: number,
 *   wBefore: { value?: number, type?: string } | null,
 *   wAfter: { value?: number, type?: string } | null,
 * }}
 */
export const getRawRowGridMetadata = (row) => {
  const trPr = row?.elements?.find((element) => element.name === 'w:trPr');
  const getChild = (name) => trPr?.elements?.find((element) => element.name === name);
  const parseCount = (name) => {
    const rawValue = getChild(name)?.attributes?.['w:val'];
    const value = typeof rawValue === 'number' ? rawValue : Number.parseInt(rawValue || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const parseMeasurement = (name) => {
    const node = getChild(name);
    if (!node?.attributes) return null;
    const rawValue = node.attributes['w:w'];
    const value = typeof rawValue === 'number' ? rawValue : Number.parseInt(rawValue || '', 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
      value,
      type: node.attributes['w:type'] || 'dxa',
    };
  };

  return {
    gridBefore: parseCount('w:gridBefore'),
    gridAfter: parseCount('w:gridAfter'),
    wBefore: parseMeasurement('w:wBefore'),
    wAfter: parseMeasurement('w:wAfter'),
  };
};

export const countColumnsInRow = (row) => {
  if (!row?.elements?.length) return 0;
  const { gridBefore, gridAfter } = getRawRowGridMetadata(row);
  const cellSpanCount = row.elements.reduce((count, element) => {
    if (element.name !== 'w:tc') return count;
    const tcPr = element.elements?.find((el) => el.name === 'w:tcPr');
    const gridSpan = tcPr?.elements?.find((el) => el.name === 'w:gridSpan');
    const spanValue = parseInt(gridSpan?.attributes?.['w:val'] || '1', 10);
    return count + (Number.isFinite(spanValue) && spanValue > 0 ? spanValue : 1);
  }, 0);
  return gridBefore + cellSpanCount + gridAfter;
};

const clampColumnWidthTwips = (value) => Math.max(Math.round(value), MIN_COLUMN_WIDTH_TWIPS);

/**
 * Resolve a row skip width into equal per-column fallback seeds.
 *
 * `wBefore` / `wAfter` describe the preferred width of the skipped span as a
 * whole, so the fallback grid distributes that width evenly across the skipped
 * logical columns. These remain only a starting preference vector; later
 * AutoFit logic can still override them.
 *
 * @param {{ value?: number, type?: string } | null} measurement
 * @param {number} span
 * @returns {number[]}
 */
const resolveSkippedColumnSeedWidthsTwips = (measurement, span) => {
  if (!measurement || !Number.isFinite(span) || span <= 0) return [];
  const resolvedPx = resolveMeasurementWidthPx(measurement);
  if (resolvedPx == null || resolvedPx <= 0) return [];
  const totalTwips = clampColumnWidthTwips(pixelsToTwips(resolvedPx));
  const baseWidth = Math.floor(totalTwips / span);
  const remainder = totalTwips - baseWidth * span;
  return Array.from({ length: span }, (_, index) => clampColumnWidthTwips(baseWidth + (index < remainder ? 1 : 0)));
};

/**
 * Build the fallback per-column width vector for a missing-grid table.
 *
 * The fallback grid preserves skipped logical columns from `gridBefore` /
 * `gridAfter` even when they have no cells, and carries any `wBefore` /
 * `wAfter` preferred widths forward as seeded skipped-column widths.
 *
 * @param {object} params
 * @param {number} params.columnCount
 * @param {number} params.totalWidthTwips
 * @param {Array} params.rows
 * @returns {number[]}
 */
const buildFallbackColumnWidthTwips = ({ columnCount, totalWidthTwips, rows }) => {
  const seededWidths = new Array(columnCount).fill(null);

  for (const row of rows) {
    const { gridBefore, gridAfter, wBefore, wAfter } = getRawRowGridMetadata(row);

    if (gridBefore > 0) {
      const beforeWidths = resolveSkippedColumnSeedWidthsTwips(wBefore, gridBefore);
      beforeWidths.forEach((widthTwips, index) => {
        if (index < columnCount) {
          // Multiple rows can describe the same skipped logical columns; keep the
          // widest preferred seed so later rows cannot narrow the fallback grid.
          seededWidths[index] = Math.max(seededWidths[index] ?? 0, widthTwips);
        }
      });
    }

    if (gridAfter > 0) {
      const afterWidths = resolveSkippedColumnSeedWidthsTwips(wAfter, gridAfter);
      afterWidths.forEach((widthTwips, index) => {
        const targetIndex = columnCount - gridAfter + index;
        if (targetIndex >= 0 && targetIndex < columnCount) {
          // Multiple rows can describe the same skipped logical columns; keep the
          // widest preferred seed so later rows cannot narrow the fallback grid.
          seededWidths[targetIndex] = Math.max(seededWidths[targetIndex] ?? 0, widthTwips);
        }
      });
    }
  }

  const seededTotalTwips = seededWidths.reduce((sum, widthTwips) => sum + (widthTwips ?? 0), 0);
  const remainingColumns = seededWidths.filter((widthTwips) => widthTwips == null).length;
  const minimumRemainingTwips = remainingColumns * MIN_COLUMN_WIDTH_TWIPS;
  const effectiveTotalTwips = Math.max(totalWidthTwips, seededTotalTwips + minimumRemainingTwips);
  const defaultRemainingTwips =
    remainingColumns > 0 ? clampColumnWidthTwips((effectiveTotalTwips - seededTotalTwips) / remainingColumns) : 0;

  return seededWidths.map((widthTwips) => clampColumnWidthTwips(widthTwips ?? defaultRemainingTwips));
};

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
  const columnCount = rows.reduce((max, row) => Math.max(max, countColumnsInRow(row)), 0);
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

  const minimumColumnWidthTwips = clampColumnWidthTwips(pixelsToTwips(minimumColumnWidthPx));
  const baseTotalWidthTwips = Math.max(
    clampColumnWidthTwips(pixelsToTwips(totalWidthPx)),
    minimumColumnWidthTwips * columnCount,
  );
  const fallbackColumnWidthTwips = buildFallbackColumnWidthTwips({
    columnCount,
    totalWidthTwips: baseTotalWidthTwips,
    rows,
  });

  return {
    grid: fallbackColumnWidthTwips.map((columnWidthTwips) => ({ col: clampColumnWidthTwips(columnWidthTwips) })),
    columnWidths: fallbackColumnWidthTwips.map((columnWidthTwips) => twipsToPixels(columnWidthTwips)),
  };
};
