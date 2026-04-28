// @ts-check
import { parseSizeUnit } from '@core/utilities/parseSizeUnit.js';
import { halfPointToPixels } from '@core/super-converter/helpers.js';

/**
 * Parse CSS length-like value into pixels.
 * Supports pt and px (or unitless numbers interpreted as px).
 *
 * @param {unknown} length
 * @returns {number | undefined}
 */
const parseLengthPx = (length) => {
  if (length == null) return undefined;

  if (typeof length === 'string') {
    const trimmed = length.trim().toLowerCase();
    if (!trimmed || trimmed === 'auto') return undefined;
  }

  const [value, unit] = parseSizeUnit(String(length));
  const numericValue = Number(value);

  const calculatedLength = unit === 'pt' ? halfPointToPixels(numericValue) : numericValue;
  return calculatedLength;
};

/**
 * Parse row height from explicit row-level style/attributes.
 *
 * @param {HTMLElement} element
 * @returns {number | undefined}
 */
const parseExplicitRowHeight = (element) => {
  const fromHeightStyle = parseLengthPx(element?.style?.height);
  if (fromHeightStyle != null) return fromHeightStyle;

  const fromMinHeightStyle = parseLengthPx(element?.style?.minHeight);
  if (fromMinHeightStyle != null) return fromMinHeightStyle;

  if (element?.hasAttribute?.('height')) {
    const fromHeightAttr = parseLengthPx(element.getAttribute('height'));
    if (fromHeightAttr != null) return fromHeightAttr;
  }

  return undefined;
};

/**
 * Parse row height by promoting the tallest explicit td/th height.
 *
 * @param {HTMLElement} element
 * @returns {number | undefined}
 */
const parseTallestCellHeight = (element) => {
  const cells = element?.querySelectorAll?.('td,th');
  if (!cells?.length) return undefined;

  let maxCellHeight;
  for (const cellNode of Array.from(cells)) {
    const cell = /** @type {HTMLElement} */ (cellNode);
    const fromCellHeight = parseLengthPx(cell?.style?.height);
    const fromCellMinHeight = parseLengthPx(cell?.style?.minHeight);
    const fromCellHeightAttr = cell?.hasAttribute?.('height') ? parseLengthPx(cell.getAttribute('height')) : undefined;

    const candidate = fromCellHeight ?? fromCellMinHeight ?? fromCellHeightAttr;
    if (candidate == null) continue;
    if (maxCellHeight == null || candidate > maxCellHeight) maxCellHeight = candidate;
  }

  return maxCellHeight;
};

/**
 * Parse row height from a <tr> element.
 * Priority: row height/min-height/height attr, then tallest td/th height.
 *
 * @param {HTMLElement} element
 * @returns {number | undefined}
 */
export const parseRowHeight = (element) => {
  return parseExplicitRowHeight(element) ?? parseTallestCellHeight(element);
};
