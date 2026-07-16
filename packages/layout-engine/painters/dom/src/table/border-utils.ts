import type {
  BorderSpec,
  BorderStyle,
  CellBorders,
  TableBorderValue,
  TableBorders,
  TableFragment,
} from '@superdoc/contracts';
import { getBorderBandWidthPx } from '@superdoc/contracts';
import { getTableCellGridBounds, type TableCellGridPosition } from './grid-geometry.js';

const ALLOWED_BORDER_STYLES = new Set<BorderStyle>([
  'none',
  'single',
  'double',
  'dashed',
  'dashSmallGap',
  'dotted',
  'thick',
  'triple',
  'dotDash',
  'dotDotDash',
  'thinThickSmallGap',
  'thickThinSmallGap',
  'thinThickThinSmallGap',
  'thinThickMediumGap',
  'thickThinMediumGap',
  'thinThickThinMediumGap',
  'thinThickLargeGap',
  'thickThinLargeGap',
  'thinThickThinLargeGap',
  'wave',
  'doubleWave',
  'dashDotStroked',
  'threeDEmboss',
  'threeDEngrave',
  'outset',
  'inset',
]);

const borderStyleToCSS = (style?: BorderStyle): string => {
  if (!style || style === 'none') return 'none';

  // SECURITY: Validate style is in allowed set
  if (!ALLOWED_BORDER_STYLES.has(style)) {
    console.warn(`Invalid border style: ${style}, using 'solid' fallback`);
    return 'solid';
  }

  // Compound styles (triple, thinThick*) map to 'solid' so the CSS border carries
  // the full band width for layout; their visible rules are painted by the
  // nested-rectangle compound path, which makes this CSS paint transparent. (SD-3308)
  const styleMap: Record<BorderStyle, string> = {
    none: 'none',
    single: 'solid',
    double: 'double',
    dashed: 'dashed',
    dashSmallGap: 'dashed',
    dotted: 'dotted',
    thick: 'solid',
    triple: 'solid',
    dotDash: 'dashed',
    dotDotDash: 'dashed',
    thinThickSmallGap: 'solid',
    thickThinSmallGap: 'solid',
    thinThickThinSmallGap: 'solid',
    thinThickMediumGap: 'solid',
    thickThinMediumGap: 'solid',
    thinThickThinMediumGap: 'solid',
    thinThickLargeGap: 'solid',
    thickThinLargeGap: 'solid',
    thinThickThinLargeGap: 'solid',
    wave: 'solid',
    doubleWave: 'solid',
    // dashDotStroked: CSS cannot alternate dash and dot, so approximate as dashed
    // (consistent with dotDash/dotDotDash). threeDEmboss/threeDEngrave map to CSS's
    // native 3D bevels (ridge = raised, groove = engraved) as a close approximation. (SD-3028)
    dashDotStroked: 'dashed',
    threeDEmboss: 'ridge',
    threeDEngrave: 'groove',
    // In the collapsed model Word paints outset/inset as plain solid lines at the
    // authored width and color (300dpi probes, SD-3028); the bevel only exists in
    // separate-borders mode where bevelToneSpec retones the sides.
    outset: 'solid',
    inset: 'solid',
  };

  return styleMap[style];
};

const isValidHexColor = (color: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(color);

/**
 * Applies a border specification to one side of an HTML element.
 *
 * Converts BorderSpec format to CSS border properties and applies them to the specified
 * side of the element. Handles style conversion (e.g., 'single' → 'solid'), color validation,
 * and special cases like 'thick' borders which use doubled width.
 *
 * @param element - The HTML element to apply the border to
 * @param side - Which side of the element to apply the border ('Top', 'Right', 'Bottom', or 'Left')
 * @param border - The border specification to apply, or undefined to skip
 *
 * @example
 * ```typescript
 * const cell = document.createElement('td');
 * applyBorder(cell, 'Top', { style: 'single', width: 2, color: '#FF0000' });
 * // Sets cell.style.borderTop = '2px solid #FF0000'
 * ```
 */
export const applyBorder = (
  element: HTMLElement,
  side: 'Top' | 'Right' | 'Bottom' | 'Left',
  border?: BorderSpec,
  widthOverridePx?: number,
): void => {
  if (!border) return;
  if (border.style === 'none' || border.width === 0) {
    element.style[`border${side}`] = 'none';
    return;
  }

  const style = borderStyleToCSS(border.style);
  const color = border.color ?? '#000000';
  const safeColor = isValidHexColor(color) ? color : '#000000';
  // Band width comes from the shared contracts helper so the painted width and the
  // measuring engine's row-height reservation can never disagree. Word semantics:
  // thick = authored w:sz width (SD-3028: no 2x; min 1px); double = 3x the per-rule
  // w:sz (min 3px so CSS renders both rules); everything else = authored width.
  // `widthOverridePx` carries the
  // straddled half-band for interior compound edges (Word centers those bands on
  // the gridline, half in each adjacent cell). (SD-3308)
  const actualWidth = widthOverridePx ?? getBorderBandWidthPx(border);
  element.style[`border${side}`] = `${actualWidth}px ${style} ${safeColor}`;
};

/**
 * Applies border specifications to all four sides of a table cell element.
 *
 * Convenience function that applies borders to top, right, bottom, and left sides
 * of an element using applyBorder(). Only applies borders for sides that are defined
 * in the CellBorders object.
 *
 * @param element - The HTML element (typically a table cell) to apply borders to
 * @param borders - Cell border specifications for each side, or undefined to skip
 *
 * @example
 * ```typescript
 * const cell = document.createElement('td');
 * applyCellBorders(cell, {
 *   top: { style: 'single', width: 1, color: '#000000' },
 *   left: { style: 'double', width: 2, color: '#FF0000' }
 * });
 * ```
 */
export const applyCellBorders = (
  element: HTMLElement,
  borders?: CellBorders,
  widthOverridesPx?: { left?: number; right?: number },
): void => {
  if (!borders) return;
  applyBorder(element, 'Top', borders.top);
  applyBorder(element, 'Right', borders.right, widthOverridesPx?.right);
  applyBorder(element, 'Bottom', borders.bottom);
  applyBorder(element, 'Left', borders.left, widthOverridesPx?.left);
};

/** The two tones Word uses for outset/inset bevel sides (300dpi probes, SD-3028). */
const BEVEL_LIGHT_AUTO = '#F0F0F0';
const BEVEL_DARK_AUTO = '#A0A0A0';

const bevelDarkColor = (color?: string): string => {
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color) || color.toLowerCase() === '#000000') return BEVEL_DARK_AUTO;
  const half = (i: number) => Math.floor(parseInt(color.slice(i, i + 2), 16) / 2);
  return `#${[1, 3, 5].map((i) => half(i).toString(16).padStart(2, '0')).join('')}`;
};

const bevelLightColor = (color?: string): string => {
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color) || color.toLowerCase() === '#000000') return BEVEL_LIGHT_AUTO;
  return color;
};

/**
 * Word's separate-borders bevel model for `outset`/`inset` (measured from 300dpi
 * probes, SD-3028): the legacy HTML table look. With `outset` the TABLE frame is
 * raised (visual top/left light, bottom/right dark) and each CELL is sunken (the
 * inverse); `inset` mirrors both. Tones derive from the authored color: auto/black
 * uses #F0F0F0 / #A0A0A0, an explicit color uses the color itself (light) and the
 * color at half intensity (dark). All other styles pass through unchanged. Only
 * separate-borders mode calls this; in the collapsed model Word paints these
 * styles as plain solid lines.
 */
export const bevelToneSpec = (
  spec: BorderSpec | undefined,
  visualSide: 'top' | 'right' | 'bottom' | 'left',
  owner: 'table' | 'cell',
): BorderSpec | undefined => {
  if (!spec || (spec.style !== 'outset' && spec.style !== 'inset')) return spec;
  const raisedSide = visualSide === 'top' || visualSide === 'left';
  const raisedOwner = (spec.style === 'outset') === (owner === 'table');
  const light = raisedOwner === raisedSide;
  return {
    ...spec,
    style: 'single',
    color: light ? bevelLightColor(spec.color) : bevelDarkColor(spec.color),
  };
};

/**
 * Converts a TableBorderValue to a BorderSpec for rendering.
 *
 * Handles conversion of table-level border values (which may include {none: true} markers)
 * to BorderSpec format used by the DOM renderer. Supports both 'width' and legacy 'size'
 * properties.
 *
 * @param value - Table border value to convert, or null/undefined
 * @returns BorderSpec for rendering, or undefined if value is null/undefined
 *
 * @example
 * ```typescript
 * const spec = borderValueToSpec({ style: 'single', width: 2, color: '#FF0000' });
 * // Returns: { style: 'single', width: 2, color: '#FF0000' }
 *
 * const none = borderValueToSpec({ none: true });
 * // Returns: { style: 'none', width: 0 }
 * ```
 */
export const borderValueToSpec = (value?: TableBorderValue | null): BorderSpec | undefined => {
  if (!value) return undefined;
  if (typeof value === 'object' && 'none' in value && value.none) {
    return { style: 'none', width: 0 };
  }
  if (typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const width = typeof raw.width === 'number' ? raw.width : typeof raw.size === 'number' ? raw.size : undefined;
    const color = typeof raw.color === 'string' ? raw.color : undefined;
    const space = typeof raw.space === 'number' ? raw.space : undefined;
    const style = (raw.style as BorderStyle | undefined) ?? 'single';
    const spec: BorderSpec = { style };
    if (width != null) spec.width = width;
    if (color) spec.color = color;
    if (space != null) spec.space = space;
    return spec;
  }
  return undefined;
};

/**
 * Resolves a table border value with fallback support.
 *
 * Attempts to use the explicit border value first, falling back to the fallback value
 * if the explicit value is undefined or null. This is used when cell borders can come
 * from either cell-specific definitions or table-level definitions.
 *
 * @param explicit - Primary border value to use (e.g., from cell attributes)
 * @param fallback - Fallback border value (e.g., from table borders)
 * @returns Resolved BorderSpec, or undefined if both values are undefined/null
 *
 * @example
 * ```typescript
 * const cellBorder = { style: 'double', width: 3, color: '#FF0000' };
 * const tableBorder = { style: 'single', width: 1, color: '#000000' };
 * const result = resolveTableBorderValue(cellBorder, tableBorder);
 * // Returns BorderSpec from cellBorder (explicit wins)
 * ```
 */
export const resolveTableBorderValue = (
  explicit: TableBorderValue | undefined | null,
  fallback?: TableBorderValue | undefined | null,
): BorderSpec | undefined => {
  const explicitSpec = borderValueToSpec(explicit);
  if (explicitSpec) {
    return explicitSpec;
  }
  return borderValueToSpec(fallback);
};

// Border "number" per ECMA-376 §17.4.66 (only the realistic styles; unknown → 1).
const BORDER_STYLE_NUMBER: Partial<Record<BorderStyle, number>> = {
  single: 1,
  thick: 2,
  double: 3,
  dotted: 4,
  dashed: 5,
  dotDash: 6,
  dotDotDash: 7,
  triple: 8,
  thinThickSmallGap: 9,
  thickThinSmallGap: 10,
  thinThickThinSmallGap: 11,
  thinThickMediumGap: 12,
  thickThinMediumGap: 13,
  thinThickThinMediumGap: 14,
  thinThickLargeGap: 15,
  thickThinLargeGap: 16,
  thinThickThinLargeGap: 17,
  wave: 18,
  doubleWave: 19,
  dashSmallGap: 20,
  dashDotStroked: 21,
  threeDEmboss: 22,
  threeDEngrave: 23,
  outset: 24,
  inset: 25,
};
// Number of drawn lines per style (single=1, double=2, triple=3, …).
const BORDER_STYLE_LINES: Partial<Record<BorderStyle, number>> = {
  single: 1,
  thick: 1,
  double: 2,
  dotted: 1,
  dashed: 1,
  dotDash: 1,
  dotDotDash: 1,
  triple: 3,
  thinThickSmallGap: 2,
  thickThinSmallGap: 2,
  thinThickThinSmallGap: 3,
  thinThickMediumGap: 2,
  thickThinMediumGap: 2,
  thinThickThinMediumGap: 3,
  thinThickLargeGap: 2,
  thickThinLargeGap: 2,
  thinThickThinLargeGap: 3,
  wave: 1,
  doubleWave: 2,
  dashSmallGap: 1,
  dashDotStroked: 1,
  threeDEmboss: 1,
  threeDEngrave: 1,
};

export const isPresentBorder = (b?: BorderSpec): b is BorderSpec =>
  !!b && b.style !== undefined && b.style !== 'none' && (b.width === undefined || b.width > 0);

/**
 * True when a border is EXPLICITLY set to none/nil (`w:val="nil"`/`"none"`), as opposed to
 * simply unset/absent. The distinction matters for shared interior edges (§17.4.66): an
 * explicit none on BOTH adjacent cells suppresses the divider, while an unset side inherits
 * the table's insideH/insideV. Accepts either a CellBorders BorderSpec (`{style:'none'}`) or
 * a TableBorderValue (`{none:true}`).
 */
export const isExplicitNoneBorder = (b?: unknown): boolean => {
  if (!b || typeof b !== 'object') return false;
  const r = b as Record<string, unknown>;
  return r.style === 'none' || r.none === true;
};

const borderWeight = (b: BorderSpec): number =>
  (BORDER_STYLE_LINES[b.style as BorderStyle] ?? 1) * (BORDER_STYLE_NUMBER[b.style as BorderStyle] ?? 1);

const colorBrightness = (color: string | undefined, formula: (r: number, g: number, bl: number) => number): number => {
  const hex = (color ?? '#000000').replace('#', '');
  if (hex.length < 6) return 0;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const bl = parseInt(hex.slice(4, 6), 16);
  return formula(r, g, bl);
};

/**
 * OOXML cell-border conflict resolution (ECMA-376 §17.4.66).
 *
 * With zero cell spacing, two cells sharing an edge each specify a border; the spec
 * collapses them to a SINGLE displayed border:
 *  1. If either side is nil/none/absent, the opposing (present) border is displayed.
 *  2. Otherwise the border with greater weight wins, where
 *     weight = (#lines in the style) × (style number).
 *  3. Equal weight → the style higher on the precedence list (single first) wins.
 *  4. Identical style → the color with the smaller brightness (R+B+2G, then B+2G, then
 *     G) wins; finally the first border (reading order) wins.
 *
 * @param a - One side's border (the owning cell's, e.g. the lower/right cell)
 * @param b - The opposing side's border (e.g. the upper/left neighbor)
 * @returns The single BorderSpec to display, or undefined if neither is present.
 */
export const resolveBorderConflict = (a?: BorderSpec, b?: BorderSpec): BorderSpec | undefined => {
  const pa = isPresentBorder(a);
  const pb = isPresentBorder(b);
  if (!pa && !pb) return undefined;
  if (!pa) return b;
  if (!pb) return a;
  const wa = borderWeight(a);
  const wb = borderWeight(b);
  if (wa !== wb) return wa > wb ? a : b;
  const na = BORDER_STYLE_NUMBER[a.style as BorderStyle] ?? 99;
  const nb = BORDER_STYLE_NUMBER[b.style as BorderStyle] ?? 99;
  if (na !== nb) return na < nb ? a : b;
  const formulas: Array<(r: number, g: number, bl: number) => number> = [
    (r, g, bl) => r + bl + 2 * g,
    (_r, g, bl) => bl + 2 * g,
    (_r, g) => g,
  ];
  for (const f of formulas) {
    const ba = colorBrightness(a.color, f);
    const bb = colorBrightness(b.color, f);
    if (ba !== bb) return ba < bb ? a : b;
  }
  return a;
};

/**
 * Creates a border overlay element for a table fragment.
 *
 * Generates an absolutely-positioned div that renders table-level borders (top, right,
 * bottom, left) on top of the table content. This is used to apply outer table borders
 * without affecting the table's internal layout.
 *
 * @param doc - Document object for creating the overlay element
 * @param fragment - Table fragment containing dimensions for the overlay
 * @param tableBorders - Table border specifications
 * @returns HTMLElement overlay with borders applied, or null if no borders are defined
 *
 * @example
 * ```typescript
 * const overlay = createTableBorderOverlay(document, fragment, {
 *   top: { style: 'single', width: 2, color: '#000000' },
 *   bottom: { style: 'single', width: 2, color: '#000000' }
 * });
 * if (overlay) container.appendChild(overlay);
 * ```
 */
export const createTableBorderOverlay = (
  doc: Document,
  fragment: TableFragment,
  tableBorders: TableBorders,
): HTMLElement | null => {
  const top = borderValueToSpec(tableBorders.top ?? null);
  const right = borderValueToSpec(tableBorders.right ?? null);
  const bottom = borderValueToSpec(tableBorders.bottom ?? null);
  const left = borderValueToSpec(tableBorders.left ?? null);

  if (!top && !right && !bottom && !left) {
    return null;
  }

  const overlay = doc.createElement('div');
  overlay.classList.add('superdoc-table-border');
  overlay.style.position = 'absolute';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.width = `${fragment.width}px`;
  overlay.style.height = `${fragment.height}px`;
  overlay.style.boxSizing = 'border-box';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '1';

  applyBorder(overlay, 'Top', top);
  applyBorder(overlay, 'Right', right);
  applyBorder(overlay, 'Bottom', bottom);
  applyBorder(overlay, 'Left', left);

  return overlay;
};

/**
 * Resolves cell-specific borders based on cell position within a table.
 *
 * Implements a **single-owner border model** to prevent double borders when
 * rendering tables with absolutely-positioned divs (which don't support CSS
 * border-collapse). Each shared border is owned by exactly one cell:
 *
 * - TOP border: Cell owns its own top (first row uses table.top, others use insideH)
 * - LEFT border: Cell owns its own left (first col uses table.left, others use insideV)
 * - BOTTOM border: Only last row renders it (using table.bottom)
 * - RIGHT border: Only last column renders it (using table.right)
 *
 * This ensures each border line is rendered exactly once, eliminating the
 * double-border issue that occurs when adjacent cells both render their
 * shared edge.
 *
 * @param tableBorders - Table-level border definitions
 * @param cellPosition - Cell position and span within the table grid
 * @returns CellBorders object with resolved borders for all four sides
 *
 * @example
 * ```typescript
 * // For a 3x3 table:
 * // Cell (0,0): top=table.top, left=table.left, bottom=undefined, right=undefined
 * // Cell (1,1): top=insideH, left=insideV, bottom=undefined, right=undefined
 * // Cell (2,2): top=insideH, left=insideV, bottom=table.bottom, right=table.right
 * ```
 */
/**
 * Checks whether a CellBorders object has at least one explicitly defined side.
 *
 * Returns false when borders is undefined/null or when all four sides are undefined.
 * Used to distinguish "no borders attribute" from "borders attribute present but empty"
 * (intentionally borderless).
 *
 * @param cellBorders - Cell border definitions to check
 * @returns True if at least one side (top, right, bottom, left) is defined
 */
export const hasExplicitCellBorders = (cellBorders?: CellBorders): cellBorders is CellBorders =>
  Boolean(
    cellBorders &&
      (cellBorders.top !== undefined ||
        cellBorders.right !== undefined ||
        cellBorders.bottom !== undefined ||
        cellBorders.left !== undefined),
  );

export const resolveTableCellBorders = (
  tableBorders: {
    top?: TableBorderValue;
    bottom?: TableBorderValue;
    left?: TableBorderValue;
    right?: TableBorderValue;
    insideH?: TableBorderValue;
    insideV?: TableBorderValue;
  },
  cellPosition: TableCellGridPosition,
): CellBorders => {
  const cellBounds = getTableCellGridBounds(cellPosition);

  // Single-owner model: each cell owns TOP and LEFT, only edge cells own BOTTOM and RIGHT
  return {
    // Top: first row gets table.top, interior rows get insideH
    top: borderValueToSpec(cellBounds.touchesTopEdge ? tableBorders?.top : tableBorders?.insideH),
    // Bottom: ONLY last row gets table.bottom (interior cells don't render bottom - it comes from cell below's top)
    bottom: borderValueToSpec(cellBounds.touchesBottomEdge ? tableBorders?.bottom : null),
    // Left: first col gets table.left, interior cols get insideV
    left: borderValueToSpec(cellBounds.touchesLeftEdge ? tableBorders?.left : tableBorders?.insideV),
    // Right: ONLY last col gets table.right (interior cells don't render right - it comes from cell to right's left)
    right: borderValueToSpec(cellBounds.touchesRightEdge ? tableBorders?.right : null),
  };
};

/**
 * Swap left↔right on table borders for RTL tables (ECMA-376 Part 4 §14.3.2, §14.3.6).
 * insideH/insideV and top/bottom are not affected by direction.
 */
export const swapTableBordersLR = (borders: TableBorders | undefined): TableBorders | undefined => {
  if (!borders) return undefined;
  return {
    ...borders,
    left: borders.right,
    right: borders.left,
  };
};

/**
 * Swap left↔right on cell borders for RTL tables (ECMA-376 Part 4 §14.3.1, §14.3.5).
 */
export const swapCellBordersLR = (borders: CellBorders | undefined): CellBorders | undefined => {
  if (!borders) return undefined;
  return {
    ...borders,
    left: borders.right,
    right: borders.left,
  };
};
