// @ts-check
import { twipsToPixels, pixelsToTwips } from '@converter/helpers.js';

export const DEFAULT_COLUMN_WIDTH_PX = 100;

/**
 * Normalize a width value expressed in twips (string or number).
 * Returns null when the value is not a positive number.
 * @param {number|string|null|undefined} value
 * @returns {number|null}
 */
export const normalizeTwipWidth = (value) => {
  if (value == null) return null;
  const numericValue = typeof value === 'string' ? parseInt(value, 10) : value;
  if (!Number.isFinite(numericValue) || Number.isNaN(numericValue) || numericValue <= 0) {
    return null;
  }
  return numericValue;
};

/**
 * Pull the editor schema default column width when available.
 * Falls back to DEFAULT_COLUMN_WIDTH_PX when not present or invalid.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {number}
 */
export const getSchemaDefaultColumnWidthPx = (params) => {
  const defaultValue = params?.editor?.schema?.nodes?.tableCell?.spec?.attrs?.colwidth?.default;
  if (Array.isArray(defaultValue)) {
    const numericWidth = defaultValue.find((width) => typeof width === 'number' && Number.isFinite(width) && width > 0);
    if (numericWidth != null) return numericWidth;
  } else if (typeof defaultValue === 'number' && Number.isFinite(defaultValue) && defaultValue > 0) {
    return defaultValue;
  }
  return DEFAULT_COLUMN_WIDTH_PX;
};

/**
 * Inspect the table node for a configured table width.
 * Supports direct attrs.tableWidth.width (pixels) or tableProperties.tableWidth (twips) values.
 * Only 'auto' and 'dxa' types are translated from twips to pixels.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {number|null}
 */
export const getTableWidthPx = (params) => {
  const explicitWidth = params?.node?.attrs?.tableWidth?.width;
  if (typeof explicitWidth === 'number' && explicitWidth > 0) return explicitWidth;

  const tableWidth = params?.node?.attrs?.tableProperties?.tableWidth;
  if (tableWidth?.value != null && typeof tableWidth.value === 'number' && tableWidth.value > 0) {
    const { value, type } = tableWidth;
    if (!type || type === 'auto' || type === 'dxa') {
      return twipsToPixels(value);
    }
  }
  return null;
};

/**
 * Determine a fallback column width in twips using schema defaults or table width.
 * @param {import('@translator').SCDecoderConfig} params
 * @param {number} totalColumns
 * @param {number} cellMinWidthTwips
 * @returns {number}
 */
export const resolveFallbackColumnWidthTwips = (params, totalColumns, cellMinWidthTwips) => {
  const columnCount = Math.max(totalColumns, 1);
  const defaultColumnWidthPx = getSchemaDefaultColumnWidthPx(params);
  const tableWidthPx = getTableWidthPx(params);

  const safeDefaultPx =
    Number.isFinite(defaultColumnWidthPx) && defaultColumnWidthPx > 0 ? defaultColumnWidthPx : DEFAULT_COLUMN_WIDTH_PX;

  let fallbackWidthPx = safeDefaultPx;
  if (typeof tableWidthPx === 'number' && tableWidthPx > 0) {
    fallbackWidthPx = tableWidthPx / columnCount;
  }

  const fallbackWidthTwips = pixelsToTwips(fallbackWidthPx);
  if (!Number.isFinite(fallbackWidthTwips) || Number.isNaN(fallbackWidthTwips) || fallbackWidthTwips <= 0) {
    const safeDefault = Math.max(pixelsToTwips(safeDefaultPx), cellMinWidthTwips);
    return safeDefault;
  }
  return Math.max(fallbackWidthTwips, cellMinWidthTwips);
};
