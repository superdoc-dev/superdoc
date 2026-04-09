// @ts-check
import { parseSizeUnit } from '@core/utilities/parseSizeUnit.js';
import { halfPointToPixels } from '@core/super-converter/helpers.js';

/**
 * Cell margins configuration in pixels.
 * @typedef {Object} CellMargins
 * @property {number} [top] - Top margin in pixels
 * @property {number} [right] - Right margin in pixels
 * @property {number} [bottom] - Bottom margin in pixels
 * @property {number} [left] - Left margin in pixels
 */

/**
 * Parse one CSS padding side into pixels.
 *
 * @param {string} sideValue
 * @returns {number | undefined}
 */
const parseSide = (sideValue) => {
  if (!sideValue) return undefined;
  const [rawValue, unit] = parseSizeUnit(sideValue);
  const numericValue = Number(rawValue);
  const calculatedValue = unit === 'pt' ? halfPointToPixels(numericValue) : numericValue;
  return calculatedValue;
};

/**
 * Parse cell margins from inline TD/TH padding styles.
 *
 * @param {HTMLElement} element
 * @returns {CellMargins | null}
 */
export const parseCellMargins = (element) => {
  const { style } = element;

  const top = parseSide(style?.paddingTop);
  const right = parseSide(style?.paddingRight);
  const bottom = parseSide(style?.paddingBottom);
  const left = parseSide(style?.paddingLeft);

  if (top == null && right == null && bottom == null && left == null) {
    return null;
  }

  return {
    ...(top != null ? { top } : {}),
    ...(right != null ? { right } : {}),
    ...(bottom != null ? { bottom } : {}),
    ...(left != null ? { left } : {}),
  };
};
