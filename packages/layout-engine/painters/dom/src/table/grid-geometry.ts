/**
 * Grid position for a rendered table cell.
 *
 * The position describes the cell's occupied rectangle in table grid coordinates,
 * not just the anchor column where the physical cell starts.
 */
export type TableCellGridPosition = {
  /** Zero-based absolute row index where the cell starts. */
  rowIndex: number;
  /** Number of rows occupied by the cell. Defaults to 1 when omitted or invalid. */
  rowSpan?: number;
  /** Zero-based absolute grid column where the cell starts. */
  gridColumnStart: number;
  /** Number of columns occupied by the cell. Defaults to 1 when omitted or invalid. */
  colSpan?: number;
  /** Total row count in the table. */
  totalRows: number;
  /** Total column count in the table grid. */
  totalCols: number;
};

/**
 * Normalized grid bounds for a rendered table cell.
 *
 * The exclusive end indexes make edge checks straightforward:
 * - `endColExclusive === totalCols` means the cell touches the right table edge
 * - `endRowExclusive === totalRows` means the cell touches the bottom table edge
 */
export type TableCellGridBounds = {
  /** Inclusive starting row index. */
  startRow: number;
  /** Exclusive ending row index. */
  endRowExclusive: number;
  /** Inclusive starting column index. */
  startCol: number;
  /** Exclusive ending column index. */
  endColExclusive: number;
  /** Whether the cell touches the table's top outer edge. */
  touchesTopEdge: boolean;
  /** Whether the cell touches the table's bottom outer edge. */
  touchesBottomEdge: boolean;
  /** Whether the cell touches the table's left outer edge. */
  touchesLeftEdge: boolean;
  /** Whether the cell touches the table's right outer edge. */
  touchesRightEdge: boolean;
};

const normalizeSpan = (span?: number): number => {
  if (typeof span !== 'number' || !Number.isFinite(span) || span < 1) {
    return 1;
  }

  return Math.floor(span);
};

const clampStartIndex = (index: number, totalCount: number): number => {
  if (totalCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(0, index), totalCount - 1);
};

const getExclusiveEndIndex = (startIndex: number, span: number, totalCount: number): number => {
  if (totalCount <= 0) {
    return 0;
  }

  return Math.min(startIndex + span, totalCount);
};

/**
 * Computes the normalized grid bounds for a table cell.
 *
 * The DOM table painter uses these bounds to decide whether a cell owns
 * the table's outer borders under the single-owner collapsed-border model.
 *
 * @param position - Cell position and span within the table grid
 * @returns Normalized bounds plus edge-contact flags
 *
 * @example
 * ```typescript
 * const bounds = getTableCellGridBounds({
 *   rowIndex: 0,
 *   rowSpan: 1,
 *   gridColumnStart: 0,
 *   colSpan: 2,
 *   totalRows: 5,
 *   totalCols: 2,
 * });
 *
 * bounds.touchesRightEdge; // true
 * ```
 */
export const getTableCellGridBounds = (position: TableCellGridPosition): TableCellGridBounds => {
  const normalizedRowSpan = normalizeSpan(position.rowSpan);
  const normalizedColSpan = normalizeSpan(position.colSpan);

  const startRow = clampStartIndex(position.rowIndex, position.totalRows);
  const startCol = clampStartIndex(position.gridColumnStart, position.totalCols);

  const endRowExclusive = getExclusiveEndIndex(startRow, normalizedRowSpan, position.totalRows);
  const endColExclusive = getExclusiveEndIndex(startCol, normalizedColSpan, position.totalCols);

  const hasRows = position.totalRows > 0;
  const hasCols = position.totalCols > 0;

  return {
    startRow,
    endRowExclusive,
    startCol,
    endColExclusive,
    touchesTopEdge: hasRows && startRow === 0,
    touchesBottomEdge: hasRows && endRowExclusive === position.totalRows,
    touchesLeftEdge: hasCols && startCol === 0,
    touchesRightEdge: hasCols && endColExclusive === position.totalCols,
  };
};
