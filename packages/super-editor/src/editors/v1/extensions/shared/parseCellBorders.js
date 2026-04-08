// @ts-check
import { parseSizeUnit } from '@core/utilities/parseSizeUnit.js';
import { cssColorToHex } from '@core/utilities/cssColorToHex.js';
import { halfPointToPixels } from '@core/super-converter/helpers.js';

/**
 * Parsed cell border shape used by table cell / header parseDOM.
 * @typedef {Object} ParsedCellBorder
 * @property {'none' | 'single' | 'dashed' | 'dotted'} val
 * @property {number} size
 * @property {string} color
 * @property {string} style
 */

/**
 * Parsed borders object for each side.
 * @typedef {Object} ParsedCellBorders
 * @property {ParsedCellBorder} [top]
 * @property {ParsedCellBorder} [right]
 * @property {ParsedCellBorder} [bottom]
 * @property {ParsedCellBorder} [left]
 */

const STYLE_TOKEN_SET = new Set([
  'none',
  'hidden',
  'dotted',
  'dashed',
  'solid',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
]);

const STYLE_TOKEN_PATTERN = Array.from(STYLE_TOKEN_SET).join('|');

/**
 * Parse border width token into pixel number.
 *
 * @param {string} value
 * @returns {number | null}
 */
const parseBorderWidth = (value) => {
  const widthMatch = value.match(/(?:^|\s)(-?\d*\.?\d+(?:px|pt))(?=\s|$)/i);
  if (!widthMatch?.[1]) return null;

  const [widthValue, widthUnit] = parseSizeUnit(widthMatch[1]);

  const numericWidth = Number(widthValue);
  const size = widthUnit === 'pt' ? halfPointToPixels(numericWidth) : numericWidth;
  return size;
};

/**
 * Parse border style token.
 *
 * @param {string} value
 * @returns {string | null}
 */
const parseBorderStyle = (value) => {
  const styleMatch = value.match(new RegExp(`(?:^|\\s)(${STYLE_TOKEN_PATTERN})(?=\\s|$)`, 'i'));
  return styleMatch?.[1] ? styleMatch[1].toLowerCase() : null;
};

/**
 * Parse border color token.
 *
 * @param {string} value
 * @returns {string | null}
 */
const parseBorderColor = (value) => {
  const directColorMatch = value.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}|var\([^)]+\))/i);
  if (directColorMatch?.[1]) return directColorMatch[1];

  const tokenColorMatch = value
    .split(/\s+/)
    .find((part) => /^[a-z]+$/i.test(part) && !STYLE_TOKEN_SET.has(part.toLowerCase()));
  return tokenColorMatch || null;
};

/**
 * Parse a single CSS border declaration.
 *
 * @param {string | undefined | null} rawValue
 * @returns {ParsedCellBorder | null}
 */
const parseBorderValue = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const value = rawValue.trim();
  if (!value) return null;

  if (value === 'none') {
    return { val: 'none', size: 0, color: 'auto', style: 'none' };
  }

  const size = parseBorderWidth(value);
  const style = parseBorderStyle(value);
  const color = parseBorderColor(value);

  const hexColor = cssColorToHex(color);
  if (style === 'none') {
    return { val: 'none', size: 0, color: 'auto', style: 'none' };
  }

  if (size == null && !hexColor && !style) return null;

  return {
    val: style === 'dashed' || style === 'dotted' ? style : 'single',
    size: size ?? 1,
    color: hexColor || 'auto',
    style: style || 'solid',
  };
};

/**
 * Parse cell borders from inline TD/TH styles.
 *
 * @param {HTMLElement} element
 * @returns {ParsedCellBorders | null}
 */
export const parseCellBorders = (element) => {
  const { style } = element;

  const top = parseBorderValue(style?.borderTop || style?.border);
  const right = parseBorderValue(style?.borderRight || style?.border);
  const bottom = parseBorderValue(style?.borderBottom || style?.border);
  const left = parseBorderValue(style?.borderLeft || style?.border);

  if (!top && !right && !bottom && !left) return null;

  return {
    ...(top ? { top } : {}),
    ...(right ? { right } : {}),
    ...(bottom ? { bottom } : {}),
    ...(left ? { left } : {}),
  };
};
