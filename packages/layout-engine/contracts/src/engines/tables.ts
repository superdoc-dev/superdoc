/**
 * @superdoc/engines-tables contract (placeholder)
 *
 * Column width resolution and row measurement for tables.
 * This is a placeholder for future Phase 2 work (tables pod).
 */

/**
 * OOXML percentage divisor constant.
 * OOXML stores percentages as 1/50ths of a percent:
 * - 5000 = 100%
 * - 2500 = 50%
 * - 1000 = 20%
 */
export const OOXML_PCT_DIVISOR = 5000;

/**
 * Table width attribute from OOXML format.
 * Represents table width specification with different types.
 *
 * @property width - Width value (alternative to value property)
 * @property value - Width value (alternative to width property)
 * @property type - Width type: 'pct' for percentage, 'px' or 'pixel' for pixels
 *
 * @example
 * // Percentage width (50%)
 * { value: 2500, type: 'pct' }
 *
 * @example
 * // Pixel width
 * { width: 600, type: 'px' }
 */
export interface TableWidthAttr {
  width?: number;
  value?: number;
  type?: 'pct' | 'px' | 'pixel' | string;
}

/**
 * Extract a validated numeric width from a table width attribute object.
 *
 * Supports either `width` or `value` fields and rejects non-finite or non-positive
 * values so callers can safely use the result in layout calculations.
 */
export function resolveTableWidthAttr(value: unknown): { width: number; type?: TableWidthAttr['type'] } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const measurement = value as TableWidthAttr;
  const width = measurement.width ?? measurement.value;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    return null;
  }

  return {
    width,
    type: measurement.type,
  };
}

export interface TableColumnSpec {
  type: 'auto' | 'fixed' | 'pct';
  width?: number; // pt or percentage (0-100)
  minWidth?: number; // pt
  maxWidth?: number; // pt
}

/**
 * Resolve final column widths for a table.
 *
 * Implements Word's table width algorithm:
 * - Fixed columns use their specified width
 * - Percentage columns share proportionally
 * - Auto columns distribute remaining space based on content
 *
 * @param columns - Column specifications from table grid
 * @param availableWidth - Content area width in pt
 * @returns Array of final column widths in pt
 *
 * @example
 * resolveColumnWidths(
 *   [
 *     { type: 'fixed', width: 100 },
 *     { type: 'auto' },
 *     { type: 'pct', width: 50 }
 *   ],
 *   400
 * ) // → [100, 150, 200] (fixed + auto + 50% of remaining)
 */
export function resolveColumnWidths(columns: TableColumnSpec[], availableWidth: number): number[] {
  // Placeholder implementation - returns equal widths
  const columnCount = columns.length;
  const width = availableWidth / columnCount;

  return columns.map(() => width);
}

/**
 * Measure row heights for a table given column widths.
 *
 * Future implementation will:
 * - Measure cell content at the specified column width
 * - Handle vertical alignment (top/middle/bottom)
 * - Account for cell padding and borders
 * - Support min/max row heights
 *
 * @param cells - 2D array of cell content (by row, then column)
 * @param columnWidths - Resolved column widths in pt
 * @returns Array of row heights in pt
 */
export function measureRowHeights(
  cells: unknown[][], // Placeholder - will be CellContent[][] in real implementation
  _columnWidths: number[],
): number[] {
  // Placeholder implementation - returns fixed height per row
  return cells.map(() => 20); // 20pt default row height
}
