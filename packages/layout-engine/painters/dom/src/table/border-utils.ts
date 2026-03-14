import type {
  BorderSpec,
  BorderStyle,
  CellBorders,
  TableBorderValue,
  TableBorders,
  TableFragment,
} from '@superdoc/contracts';
import { getTableCellGridBounds, type TableCellGridPosition } from './grid-geometry.js';

const ALLOWED_BORDER_STYLES = new Set<BorderStyle>([
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

const borderStyleToCSS = (style?: BorderStyle): string => {
  if (!style || style === 'none') return 'none';

  // SECURITY: Validate style is in allowed set
  if (!ALLOWED_BORDER_STYLES.has(style)) {
    console.warn(`Invalid border style: ${style}, using 'solid' fallback`);
    return 'solid';
  }

  const styleMap: Record<BorderStyle, string> = {
    none: 'none',
    single: 'solid',
    double: 'double',
    dashed: 'dashed',
    dotted: 'dotted',
    thick: 'solid',
    triple: 'solid',
    dotDash: 'dashed',
    dotDotDash: 'dashed',
    wave: 'solid',
    doubleWave: 'solid',
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
): void => {
  if (!border) return;
  if (border.style === 'none' || border.width === 0) {
    element.style[`border${side}`] = 'none';
    return;
  }

  const style = borderStyleToCSS(border.style);
  const width = border.width ?? 1;
  const color = border.color ?? '#000000';
  const safeColor = isValidHexColor(color) ? color : '#000000';
  const actualWidth = border.style === 'thick' ? Math.max(width * 2, 3) : width;
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
export const applyCellBorders = (element: HTMLElement, borders?: CellBorders): void => {
  if (!borders) return;
  applyBorder(element, 'Top', borders.top);
  applyBorder(element, 'Right', borders.right);
  applyBorder(element, 'Bottom', borders.bottom);
  applyBorder(element, 'Left', borders.left);
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
