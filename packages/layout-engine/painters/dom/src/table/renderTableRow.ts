import type {
  CellBorders,
  DrawingBlock,
  Line,
  ParagraphBlock,
  PartialRowInfo,
  SdtMetadata,
  TableBlock,
  TableBorders,
  TableMeasure,
} from '@superdoc/contracts';
import { renderTableCell } from './renderTableCell.js';
import {
  resolveTableCellBorders,
  borderValueToSpec,
  resolveTableBorderValue,
  hasExplicitCellBorders,
} from './border-utils.js';
import { getTableCellGridBounds, type TableCellGridPosition } from './grid-geometry.js';
import type { FragmentRenderContext } from '../renderer.js';

type TableRowMeasure = TableMeasure['rows'][number];
type TableRow = TableBlock['rows'][number];

type CellBorderResolutionArgs = {
  cellBorders?: CellBorders;
  hasBordersAttribute: boolean;
  tableBorders?: TableBorders;
  cellPosition: TableCellGridPosition;
  cellSpacingPx: number;
  continuesFromPrev: boolean;
  continuesOnNext: boolean;
};

const hasAnyResolvedBorder = (borders: CellBorders): boolean =>
  Boolean(borders.top || borders.right || borders.bottom || borders.left);

/**
 * Resolves the borders that a rendered cell fragment should paint.
 *
 * The DOM table painter uses a single-owner border model, so merged cells must
 * determine edge ownership from their full occupied grid bounds, not just their
 * starting column or row.
 */
const resolveRenderedCellBorders = ({
  cellBorders,
  hasBordersAttribute,
  tableBorders,
  cellPosition,
  cellSpacingPx,
  continuesFromPrev,
  continuesOnNext,
}: CellBorderResolutionArgs): CellBorders | undefined => {
  const hasExplicitBorders = hasExplicitCellBorders(cellBorders);

  if (hasBordersAttribute && !hasExplicitBorders) {
    return undefined;
  }

  if (!tableBorders) {
    return hasExplicitBorders
      ? {
          top: cellBorders.top,
          right: cellBorders.right,
          bottom: cellBorders.bottom,
          left: cellBorders.left,
        }
      : undefined;
  }

  const cellBounds = getTableCellGridBounds(cellPosition);
  const touchesTopBoundary = cellBounds.touchesTopEdge || continuesFromPrev;
  const touchesBottomBoundary = cellBounds.touchesBottomEdge || continuesOnNext;

  if (hasExplicitBorders) {
    return {
      top: resolveTableBorderValue(cellBorders.top, touchesTopBoundary ? tableBorders.top : tableBorders.insideH),
      right: resolveTableBorderValue(cellBorders.right, cellBounds.touchesRightEdge ? tableBorders.right : undefined),
      bottom: resolveTableBorderValue(cellBorders.bottom, touchesBottomBoundary ? tableBorders.bottom : undefined),
      left: resolveTableBorderValue(
        cellBorders.left,
        cellBounds.touchesLeftEdge ? tableBorders.left : tableBorders.insideV,
      ),
    };
  }

  if (cellSpacingPx > 0) {
    const interiorBorders: CellBorders = {
      top: touchesTopBoundary ? undefined : borderValueToSpec(tableBorders.insideH),
      right: cellBounds.touchesRightEdge ? undefined : borderValueToSpec(tableBorders.insideV),
      bottom: touchesBottomBoundary ? undefined : borderValueToSpec(tableBorders.insideH),
      left: cellBounds.touchesLeftEdge ? undefined : borderValueToSpec(tableBorders.insideV),
    };

    return hasAnyResolvedBorder(interiorBorders) ? interiorBorders : undefined;
  }

  const baseBorders = resolveTableCellBorders(tableBorders, cellPosition);

  return {
    top: touchesTopBoundary ? borderValueToSpec(tableBorders.top) : baseBorders.top,
    right: baseBorders.right,
    bottom: touchesBottomBoundary ? borderValueToSpec(tableBorders.bottom) : baseBorders.bottom,
    left: baseBorders.left,
  };
};

/**
 * Dependencies required for rendering a table row.
 *
 * Contains all information needed to render cells in a table row, including
 * positioning, measurements, border resolution, and rendering functions.
 */
type TableRowRenderDependencies = {
  /** Document object for creating DOM elements */
  doc: Document;
  /** Container element to append cell elements to */
  container: HTMLElement;
  /** Zero-based index of this row */
  rowIndex: number;
  /** Vertical position (top edge) in pixels */
  y: number;
  /** Measurement data for this row (height, cell measurements) */
  rowMeasure: TableRowMeasure;
  /** Row data (cells, attributes), or undefined for empty rows */
  row?: TableRow;
  /** Total number of rows in the table (for border resolution) */
  totalRows: number;
  /** Table-level borders (for resolving cell borders) */
  tableBorders?: TableBorders;
  /** Column widths array for calculating x positions from gridColumnStart */
  columnWidths: number[];
  /** All row heights for calculating rowspan cell heights */
  allRowHeights: number[];
  /** Table indent in pixels (applied to table fragment positioning) */
  tableIndent?: number;
  /** Rendering context */
  context: FragmentRenderContext;
  /** Function to render a line of paragraph content */
  renderLine: (
    block: ParagraphBlock,
    line: Line,
    context: FragmentRenderContext,
    lineIndex: number,
    isLastLine: boolean,
  ) => HTMLElement;
  /** Optional callback invoked after a table line's final styles/markers are applied. */
  captureLineSnapshot?: (
    lineEl: HTMLElement,
    context: FragmentRenderContext,
    options?: { inTableParagraph?: boolean; wrapperEl?: HTMLElement },
  ) => void;
  /** Function to render drawing content (images, shapes, shape groups) */
  renderDrawingContent?: (block: DrawingBlock) => HTMLElement;
  /** Function to apply SDT metadata as data attributes */
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  /** Table-level SDT metadata for suppressing duplicate container styling in cells */
  tableSdt?: SdtMetadata | null;
  /**
   * If true, this row is the first body row of a continuation fragment.
   * MS Word draws borders at split points to visually close the table on each page,
   * so we do NOT suppress borders - both fragments draw their edge borders.
   */
  continuesFromPrev?: boolean;
  /**
   * If true, this row is the last body row before a page break continuation.
   * MS Word draws borders at split points to visually close the table on each page,
   * so we do NOT suppress borders - both fragments draw their edge borders.
   */
  continuesOnNext?: boolean;
  /**
   * Partial row information for mid-row splits.
   * Contains per-cell line ranges (fromLineByCell, toLineByCell) for rendering
   * only a portion of the row's content.
   */
  partialRow?: PartialRowInfo;

  /**
   * Cell spacing in pixels (border-spacing between cells).
   * Applied to cell x positions and row y advancement.
   */
  cellSpacingPx?: number;
};

/**
 * Renders all cells in a table row.
 *
 * Iterates through cells in the row, resolving borders based on cell position,
 * and rendering each cell with its content. Cells are positioned horizontally
 * by accumulating their widths.
 *
 * Border resolution logic:
 * - Cells with explicit borders use those borders
 * - Otherwise, cells use position-based borders from table borders:
 *   - Edge cells use outer table borders
 *   - Interior cells use inside borders (insideH, insideV)
 * - If no table borders exist, default borders are applied
 *
 * @param deps - All dependencies required for rendering
 *
 * @example
 * ```typescript
 * renderTableRow({
 *   doc: document,
 *   container: tableContainer,
 *   rowIndex: 0,
 *   y: 0,
 *   rowMeasure,
 *   row,
 *   totalRows: 3,
 *   tableBorders,
 *   context,
 *   renderLine,
 *   applySdtDataset
 * });
 * // Appends all cell elements to container
 * ```
 */
export const renderTableRow = (deps: TableRowRenderDependencies): void => {
  const {
    doc,
    container,
    rowIndex,
    y,
    rowMeasure,
    row,
    totalRows,
    tableBorders,
    columnWidths,
    allRowHeights,
    tableIndent,
    context,
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applySdtDataset,
    tableSdt,
    continuesFromPrev,
    continuesOnNext,
    partialRow,
    cellSpacingPx = 0,
  } = deps;

  const totalCols = columnWidths.length;

  /**
   * Calculates the horizontal position (x-coordinate) for a cell based on its grid column index.
   *
   * Sums the widths of all columns preceding the given column index plus spacing between
   * columns (border-spacing). When cellSpacingPx > 0, each column after the first is
   * offset by one spacing unit, so x = sum(columnWidths[0..gridColumnStart-1]) + gridColumnStart * cellSpacingPx.
   *
   * **Bounds Safety:**
   * Loop terminates at the minimum of `gridColumnStart` and `columnWidths.length`
   * to prevent out-of-bounds array access.
   *
   * @param gridColumnStart - Zero-based column index in the table grid
   * @returns Horizontal position in pixels from the left edge of the table
   *
   * @example
   * ```typescript
   * // columnWidths = [100, 150, 200], cellSpacingPx = 4
   * calculateXPosition(0) // Returns: cellSpacingPx (space before first column)
   * calculateXPosition(1) // Returns: cellSpacingPx + columnWidths[0] + cellSpacingPx
   * ```
   */
  const calculateXPosition = (gridColumnStart: number): number => {
    let x = cellSpacingPx; // space before first column
    for (let i = 0; i < gridColumnStart && i < columnWidths.length; i++) {
      x += columnWidths[i] + cellSpacingPx;
    }
    return x;
  };

  /**
   * Calculates the total height for a cell that spans multiple rows (rowspan).
   *
   * Sums the heights of consecutive rows starting from `startRowIndex` up to
   * the number of rows specified by `rowSpan`. This determines the vertical
   * size needed to render a cell that merges multiple rows.
   *
   * **Bounds Safety:**
   * Loop checks both rowSpan count and array bounds to prevent accessing
   * non-existent rows.
   *
   * @param startRowIndex - Zero-based index of the first row in the span
   * @param rowSpan - Number of rows the cell spans (typically >= 1)
   * @returns Total height in pixels for the cell
   *
   * @example
   * ```typescript
   * // allRowHeights = [50, 60, 70, 80]
   * calculateRowspanHeight(0, 1) // Returns: 50 (single row)
   * calculateRowspanHeight(0, 2) // Returns: 110 (rows 0 and 1)
   * calculateRowspanHeight(1, 3) // Returns: 210 (rows 1, 2, and 3)
   * calculateRowspanHeight(3, 5) // Returns: 80 (safe - only row 3 exists)
   * ```
   */
  const calculateRowspanHeight = (startRowIndex: number, rowSpan: number): number => {
    let totalHeight = 0;
    for (let i = 0; i < rowSpan && startRowIndex + i < allRowHeights.length; i++) {
      totalHeight += allRowHeights[startRowIndex + i];
    }
    return totalHeight;
  };

  const calculateColspanWidth = (gridColumnStart: number, colSpan: number): number => {
    let width = 0;
    for (let i = gridColumnStart; i < gridColumnStart + colSpan && i < columnWidths.length; i++) {
      width += columnWidths[i];
    }
    return width;
  };

  for (let cellIndex = 0; cellIndex < rowMeasure.cells.length; cellIndex += 1) {
    const cellMeasure = rowMeasure.cells[cellIndex];
    const cell = row?.cells?.[cellIndex];
    const gridColumnStart = cellMeasure.gridColumnStart ?? cellIndex;
    const rowSpan = cellMeasure.rowSpan ?? 1;
    const colSpan = cellMeasure.colSpan ?? 1;

    // Calculate x position from gridColumnStart if available, otherwise fallback
    const x = calculateXPosition(gridColumnStart);

    // Check if cell has any border attribute at all (even if empty - empty means "no borders")
    const cellBordersAttr = cell?.attrs?.borders;
    const hasBordersAttribute = cellBordersAttr !== undefined;
    const cellPosition: TableCellGridPosition = {
      rowIndex,
      rowSpan,
      gridColumnStart,
      colSpan,
      totalRows,
      totalCols,
    };
    const resolvedBorders = resolveRenderedCellBorders({
      cellBorders: cellBordersAttr,
      hasBordersAttribute,
      tableBorders,
      cellPosition,
      cellSpacingPx,
      continuesFromPrev: continuesFromPrev === true,
      continuesOnNext: continuesOnNext === true,
    });

    // Calculate cell height - use rowspan height if cell spans multiple rows
    // For partial rows, use the partial height instead
    let cellHeight: number;
    if (partialRow) {
      // Use partial row height for mid-row splits
      cellHeight = partialRow.partialHeight;
    } else if (rowSpan > 1) {
      cellHeight = calculateRowspanHeight(rowIndex, rowSpan);
    } else {
      cellHeight = rowMeasure.height;
    }

    // Get per-cell line range for partial row rendering
    const fromLine = partialRow?.fromLineByCell?.[cellIndex];
    const toLine = partialRow?.toLineByCell?.[cellIndex];

    // Compute cell width from rescaled columnWidths (SD-1859: mixed-orientation docs
    // where cellMeasure.width may reflect landscape measurement but the fragment renders
    // in portrait). The columnWidths array is already rescaled by the layout engine.
    const computedCellWidth = calculateColspanWidth(gridColumnStart, colSpan);

    // Never use default borders - cells are either explicitly styled or borderless
    // This prevents gray borders on cells with borders={} (intentionally borderless)
    const { cellElement } = renderTableCell({
      doc,
      x,
      y,
      rowHeight: cellHeight,
      cellMeasure,
      cell,
      borders: resolvedBorders,
      useDefaultBorder: false,
      renderLine,
      captureLineSnapshot,
      renderDrawingContent,
      context,
      applySdtDataset,
      tableSdt,
      fromLine,
      toLine,
      tableIndent,
      cellWidth: computedCellWidth > 0 ? computedCellWidth : undefined,
    });

    container.appendChild(cellElement);
  }
};
