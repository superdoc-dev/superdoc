/**
 * Border & Shading Normalization Module
 *
 * Functions for converting OOXML border and shading specifications
 * to layout engine formats.
 */

import type {
  BorderSpec,
  BorderStyle,
  BoxSpacing,
  CellBorders,
  ParagraphAttrs,
  ParagraphBorder,
  TableBorders,
  TableBorderValue,
} from '@superdoc/contracts';
import type { OoxmlBorder } from '../types.js';
import { normalizeColor, pickNumber, isFiniteNumber, normalizeCellPaddingTopBottom } from '../utilities.js';
import { PX_PER_PT } from '../constants.js';

const EIGHTHS_PER_POINT = 8;
const MIN_BORDER_SIZE_PX = 0.5; // Minimum visible border
const MAX_BORDER_SIZE_PX = 100; // Reasonable maximum

/**
 * Convert an OOXML border size (stored in eighths of a point) to pixels.
 *
 * OOXML defines border size in eights of a point (ST_EighthPointMeasure),
 * so always convert using size/8 pt → px. This avoids misinterpreting small
 * values (e.g., size=4 means 0.5pt, not 4px).
 *
 * Clamps results to reasonable bounds to prevent edge cases.
 */
const borderSizeToPx = (size?: number): number | undefined => {
  if (!isFiniteNumber(size)) return undefined;
  if (size <= 0) return 0;

  const points = size / EIGHTHS_PER_POINT;
  const pixelValue = points * PX_PER_PT;

  // Clamp to reasonable bounds
  return Math.min(MAX_BORDER_SIZE_PX, Math.max(MIN_BORDER_SIZE_PX, pixelValue));
};

/**
 * Normalizes a border/shading color with a default fallback.
 *
 * @param color - Color string (with or without # prefix), or 'auto'
 * @returns Normalized color with # prefix, or '#000000' if auto/missing
 */
const normalizeColorWithDefault = (color?: string): string => {
  if (!color || color === 'auto') return '#000000';
  return color.startsWith('#') ? color : `#${color}`;
};

/**
 * Converts an OOXML border specification to layout engine BorderSpec format.
 *
 * Border sizes are assumed to be in eighths of a point (OOXML standard) if >= 8,
 * otherwise treated as already-converted pixel values. Nil/none borders return
 * a special BorderSpec with style 'none' and width 0.
 *
 * @param ooxmlBorder - Raw OOXML border object with optional val, size, and color properties
 * @returns BorderSpec with style, width (in pixels), and color, or undefined if invalid
 *
 * @example
 * ```typescript
 * convertBorderSpec({ val: 'single', size: 16, color: 'FF0000' });
 * // { style: 'single', width: 2.67, color: '#FF0000' }
 *
 * convertBorderSpec({ val: 'nil' });
 * // { style: 'none', width: 0 }
 *
 * convertBorderSpec(null);
 * // undefined
 * ```
 */
export function convertBorderSpec(ooxmlBorder: unknown): BorderSpec | undefined {
  if (!ooxmlBorder || typeof ooxmlBorder !== 'object' || ooxmlBorder === null) {
    return undefined;
  }

  // Validate object has expected structure before casting
  const border = ooxmlBorder as Record<string, unknown>;
  const hasValidStructure = Object.keys(border).length > 0;
  if (!hasValidStructure) return undefined;

  const { val, size, color } = border;

  // Early validation of types
  if (size !== undefined && typeof size !== 'number') return undefined;
  if (color !== undefined && typeof color !== 'string') return undefined;
  if (val !== undefined && typeof val !== 'string') return undefined;

  const sizeNumber = typeof size === 'number' ? size : undefined;
  const colorString = typeof color === 'string' ? color : undefined;

  // Skip nil/none borders or zero-width borders
  if (val === 'nil' || val === 'none' || sizeNumber === 0) {
    return { style: 'none' as BorderStyle, width: 0 };
  }

  const width = borderSizeToPx(sizeNumber);
  if (width == null) return undefined;

  // Ensure color has # prefix
  const normalizedColor = normalizeColorWithDefault(colorString);

  return {
    style: (val as BorderStyle) || 'single',
    width,
    color: normalizedColor,
  };
}

/**
 * Converts an OOXML border specification to table border value format.
 *
 * Similar to convertBorderSpec but returns TableBorderValue which includes
 * a `none` flag for nil/none borders instead of returning a style enum.
 *
 * @param ooxmlBorder - Raw OOXML border object with optional val, size, and color properties
 * @returns TableBorderValue with style, width, and color, or { none: true } for nil borders, or undefined if invalid
 *
 * @example
 * ```typescript
 * convertTableBorderValue({ val: 'single', size: 16, color: 'FF0000' });
 * // { style: 'single', width: 2.67, color: '#FF0000' }
 *
 * convertTableBorderValue({ val: 'nil' });
 * // { none: true }
 * ```
 */
export function convertTableBorderValue(ooxmlBorder: unknown): TableBorderValue | undefined {
  if (!ooxmlBorder || typeof ooxmlBorder !== 'object') return undefined;

  const border = ooxmlBorder as OoxmlBorder;
  if (Object.keys(border).length === 0) {
    return undefined;
  }

  const { val, size, color } = border;
  if (val === 'nil' || val === 'none' || size === 0) {
    return { none: true };
  }

  const width = borderSizeToPx(size);
  if (width == null) return undefined;

  const normalizedColor = normalizeColorWithDefault(color);

  return {
    style: (val as BorderStyle) || 'single',
    width,
    color: normalizedColor,
  };
}

const BORDER_STYLES = new Set<BorderStyle>([
  'none',
  'single',
  'double',
  'dashed',
  'dotted',
  'thick',
  'triple',
  'dotDash',
  'dotDotDash',
  'wave',
  'doubleWave',
]);

function isBorderStyle(value: unknown): value is BorderStyle {
  return typeof value === 'string' && BORDER_STYLES.has(value as BorderStyle);
}

function isTableBorderValue(value: unknown): value is TableBorderValue {
  if (value === null) return true;
  if (typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  if (obj.none === true) return true;

  // OOXML borders have 'val' and 'size' properties, not 'style' and 'width'
  // Reject OOXML borders so they get converted
  if ('val' in obj || 'size' in obj) return false;

  // BorderSpec must have at least one valid key (style, width, color, or space)
  const hasValidKey = 'style' in obj || 'width' in obj || 'color' in obj || 'space' in obj;

  // If style is present, validate it
  return hasValidKey && (!('style' in obj) || obj.style == null || isBorderStyle(obj.style));
}

/**
 * Extracts and normalizes table border definitions.
 *
 * Accepts either:
 * - A normalized border object (TableBorders-like)
 * - A raw OOXML-like border object where each side may contain { size, val, ... }
 *
 * @param bordersInput - Record of border definitions for sides (top, left, right, etc.)
 * @returns TableBorders | undefined
 */
export function extractTableBorders(bordersInput: Record<string, unknown> | undefined): TableBorders | undefined {
  if (!bordersInput || typeof bordersInput !== 'object') {
    return undefined;
  }

  const sides = ['top', 'right', 'bottom', 'left', 'insideH', 'insideV'] as const;
  const borders: TableBorders = {};

  for (const side of sides) {
    const raw = bordersInput[side];
    if (raw == null) continue;

    // Already valid? Use as-is
    if (isTableBorderValue(raw)) {
      borders[side] = raw;
    } else {
      // Convert from OOXML
      const converted = convertTableBorderValue(raw);
      if (converted !== undefined) {
        borders[side] = converted;
      }
    }
  }

  return Object.keys(borders).length > 0 ? borders : undefined;
}

/**
 * Extracts cell-level borders from ProseMirror table cell node attributes.
 *
 * Converts OOXML border specifications from the cell's `borders` attribute
 * to layout engine BorderSpec format. Only processes the four standard box sides.
 *
 * @param cellAttrs - ProseMirror table cell node attributes object
 * @returns CellBorders object with BorderSpec for each side (top, right, bottom, left), or undefined if no borders
 *
 * @example
 * ```typescript
 * extractCellBorders({
 *   borders: {
 *     top: { val: 'single', size: 8, color: '000000' },
 *     bottom: { val: 'double', size: 16 }
 *   }
 * });
 * // { top: { style: 'single', width: 1.33, ... }, bottom: { style: 'double', width: 2.67, ... } }
 * ```
 */
export function extractCellBorders(cellAttrs: Record<string, unknown>): CellBorders | undefined {
  if (!cellAttrs?.borders) return undefined;

  const bordersData = cellAttrs.borders as Record<string, unknown>;
  const borders: CellBorders = {};

  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const spec = convertBorderSpec(bordersData[side]);
    if (spec) {
      borders[side] = spec;
    }
  }

  return Object.keys(borders).length > 0 ? borders : undefined;
}

/**
 * Extracts cell padding from ProseMirror table cell node attributes.
 *
 * Cell margins in OOXML are converted to padding in the layout engine.
 * Values are assumed to already be converted to pixels from their original
 * OOXML twips format.
 *
 * @param cellAttrs - ProseMirror table cell node attributes object
 * @returns BoxSpacing object with padding values for each side, or undefined if no padding
 *
 * @example
 * ```typescript
 * extractCellPadding({
 *   cellMargins: { top: 8, left: 12, right: 12, bottom: 8 }
 * });
 * // { top: 8, left: 12, right: 12, bottom: 8 }
 * ```
 */
export function extractCellPadding(cellAttrs: Record<string, unknown>): BoxSpacing | undefined {
  const cellMargins = cellAttrs?.cellMargins;
  if (!cellMargins || typeof cellMargins !== 'object') return undefined;

  // Cell margins from OOXML are typically in twips and need conversion
  // For now, we'll use them as-is assuming they're already converted to pixels
  const padding: BoxSpacing = {};
  const margins = cellMargins as Record<string, unknown>;

  if (typeof margins.top === 'number') padding.top = margins.top;
  if (typeof margins.right === 'number') padding.right = margins.right;
  if (typeof margins.bottom === 'number') padding.bottom = margins.bottom;
  if (typeof margins.left === 'number') padding.left = margins.left;

  if (Object.keys(padding).length === 0) return undefined;
  return normalizeCellPaddingTopBottom(padding);
}

/**
 * Normalizes paragraph borders from raw OOXML attributes.
 *
 * Processes border specifications for all four sides (top, right, bottom, left)
 * and converts them to the layout engine's paragraph border format.
 *
 * @param value - Raw OOXML borders object with properties for each side
 * @returns Normalized paragraph borders object, or undefined if no valid borders
 *
 * @example
 * ```typescript
 * normalizeParagraphBorders({
 *   top: { val: 'single', size: 12, color: '000000', space: 1 },
 *   bottom: { val: 'double', size: 24 }
 * });
 * // { top: { style: 'solid', width: 2, color: '#000000', space: 1 }, bottom: { style: 'double', width: 4, ... } }
 * ```
 */
export const normalizeParagraphBorders = (value: unknown): ParagraphAttrs['borders'] | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const sides: Array<'top' | 'right' | 'bottom' | 'left' | 'between'> = ['top', 'right', 'bottom', 'left', 'between'];
  const borders: ParagraphAttrs['borders'] = {};

  sides.forEach((side) => {
    const normalized = normalizeBorderSide(source[side]);
    if (normalized) {
      borders[side] = normalized;
    }
  });

  return Object.keys(borders).length > 0 ? borders : undefined;
};

/**
 * Normalizes a single border side specification from OOXML format.
 *
 * Extracts and converts border properties including style, width (in pixels),
 * color, and spacing. Negative values for width and space are clamped to zero.
 *
 * @param value - Raw OOXML border specification for a single side
 * @returns ParagraphBorder with normalized properties, or undefined if no valid border properties or if style is 'none'
 *
 * @example
 * ```typescript
 * normalizeBorderSide({ val: 'single', size: 12, color: 'FF0000', space: 2 });
 * // { style: 'solid', width: 2, color: '#FF0000', space: 2 }
 *
 * normalizeBorderSide({ val: 'nil' });
 * // undefined
 * ```
 */
export const normalizeBorderSide = (value: unknown): ParagraphBorder | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const style = mapBorderStyle(raw.val);

  // If style is 'none' (from val='nil' or val='none'), return undefined
  // so this side is not included in the borders object at all
  if (style === 'none') return undefined;

  const width = pickNumber(raw.size);
  const widthPx = borderSizeToPx(width);
  const color = normalizeColor(raw.color);
  const space = pickNumber(raw.space);

  if (!style && widthPx == null && space == null && !color) {
    return undefined;
  }

  const border: ParagraphBorder = {};
  // Assign style if present. We already filtered out 'none' with early return above,
  // so at runtime this is safe, but TypeScript can't prove it through control flow
  if (style) {
    border.style = style as Exclude<ParagraphBorder['style'], 'none'>;
  }
  if (widthPx != null) border.width = Math.max(0, widthPx);
  if (color) border.color = color;
  if (space != null) border.space = Math.max(0, space);
  return border;
};

/**
 * Maps OOXML border style values to paragraph border style format.
 *
 * Converts OOXML border style strings (case-insensitive) to normalized
 * paragraph border styles. Unknown styles default to 'solid'.
 *
 * @param value - OOXML border style string (e.g., 'single', 'double', 'dashed')
 * @returns Normalized border style ('solid', 'double', 'dashed', 'dotted', 'none'), or undefined if not a string
 *
 * @example
 * ```typescript
 * mapBorderStyle('single'); // 'solid'
 * mapBorderStyle('DOUBLE'); // 'double'
 * mapBorderStyle('dashSmallGap'); // 'dashed'
 * mapBorderStyle('nil'); // 'none'
 * mapBorderStyle('unknown'); // 'solid' (default)
 * ```
 */
export const mapBorderStyle = (value: unknown): ParagraphBorder['style'] => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'nil' || normalized === 'none') {
    return 'none';
  }
  if (normalized === 'double') {
    return 'double';
  }
  if (normalized === 'dashed' || normalized === 'dashsmallgap' || normalized === 'dashlargegap') {
    return 'dashed';
  }
  if (normalized === 'dotted' || normalized === 'dot') {
    return 'dotted';
  }
  return 'solid';
};

/**
 * Normalizes paragraph shading from raw OOXML attributes.
 *
 * Extracts and normalizes shading properties including fill color, foreground color,
 * pattern value, and theme-related properties. Auto colors are filtered out.
 *
 * @param value - Raw OOXML shading object with properties like fill, color, val, themeColor, etc.
 * @returns Normalized paragraph shading object with valid properties, or undefined if no valid shading
 *
 * @example
 * ```typescript
 * normalizeParagraphShading({
 *   fill: 'FFFF00',
 *   color: '000000',
 *   val: 'clear'
 * });
 * // { fill: '#FFFF00', color: '#000000', val: 'clear' }
 *
 * normalizeParagraphShading({ fill: 'auto' });
 * // undefined (auto colors are filtered)
 * ```
 */
export const normalizeParagraphShading = (value: unknown): ParagraphAttrs['shading'] | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const shading: ParagraphAttrs['shading'] = {};

  const fill = normalizeShadingColor(source.fill);
  if (fill) shading.fill = fill;

  const color = normalizeShadingColor(source.color);
  if (color) shading.color = color;

  const val = normalizeString(source.val);
  if (val) shading.val = val;

  const themeColor = normalizeString(source.themeColor);
  if (themeColor) shading.themeColor = themeColor;

  const themeFill = normalizeString(source.themeFill);
  if (themeFill) shading.themeFill = themeFill;

  const themeFillShade = normalizeString(source.themeFillShade);
  if (themeFillShade) shading.themeFillShade = themeFillShade;

  const themeFillTint = normalizeString(source.themeFillTint);
  if (themeFillTint) shading.themeFillTint = themeFillTint;

  const themeShade = normalizeString(source.themeShade);
  if (themeShade) shading.themeShade = themeShade;

  const themeTint = normalizeString(source.themeTint);
  if (themeTint) shading.themeTint = themeTint;

  return Object.keys(shading).length > 0 ? shading : undefined;
};

/**
 * Normalizes shading color values, filtering out 'auto' colors.
 *
 * Applies color normalization (adding # prefix) and removes auto colors
 * which should not be rendered. Case-insensitive auto detection.
 *
 * @param value - Raw color value (string with or without # prefix, or 'auto')
 * @returns Normalized color with # prefix, or undefined if auto or invalid
 *
 * @example
 * ```typescript
 * normalizeShadingColor('FF0000'); // '#FF0000'
 * normalizeShadingColor('#00FF00'); // '#00FF00'
 * normalizeShadingColor('auto'); // undefined
 * normalizeShadingColor('AUTO'); // undefined
 * ```
 */
export const normalizeShadingColor = (value: unknown): string | undefined => {
  const normalized = normalizeColor(value);
  if (!normalized) return undefined;
  // Check for 'auto' case-insensitively (normalized may be '#auto' or '#AUTO')
  if (normalized.toLowerCase() === '#auto') {
    return undefined;
  }
  return normalized;
};

/**
 * Normalize string values, trimming whitespace.
 */
const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};
