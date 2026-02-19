import type {
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
import { resolveTableCellBorders, borderValueToSpec } from './border-utils.js';
import type { FragmentRenderContext } from '../renderer.js';

type TableRowMeasure = TableMeasure['rows'][number];
type TableRow = TableBlock['rows'][number];

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
  } = deps;

  /**
   * Calculates the horizontal position (x-coordinate) for a cell based on its grid column index.
   *
   * Sums the widths of all columns preceding the given column index to determine
   * the left edge position of a cell. This handles both normal cells and cells
   * offset by rowspans from previous rows.
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
   * // columnWidths = [100, 150, 200]
   * calculateXPosition(0) // Returns: 0 (first column)
   * calculateXPosition(1) // Returns: 100 (after first column)
   * calculateXPosition(2) // Returns: 250 (after first two columns)
   * calculateXPosition(10) // Returns: 450 (safe - stops at array length)
   * ```
   */
  const calculateXPosition = (gridColumnStart: number): number => {
    let x = 0;
    for (let i = 0; i < gridColumnStart && i < columnWidths.length; i++) {
      x += columnWidths[i];
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

  for (let cellIndex = 0; cellIndex < rowMeasure.cells.length; cellIndex += 1) {
    const cellMeasure = rowMeasure.cells[cellIndex];
    const cell = row?.cells?.[cellIndex];

    // Calculate x position from gridColumnStart if available, otherwise fallback
    const x =
      cellMeasure.gridColumnStart != null
        ? calculateXPosition(cellMeasure.gridColumnStart)
        : cellIndex === 0
          ? 0
          : calculateXPosition(cellIndex);

    // Check if cell has any border attribute at all (even if empty - empty means "no borders")
    const cellBordersAttr = cell?.attrs?.borders;
    const hasBordersAttribute = cellBordersAttr !== undefined;

    // Check if cell has meaningful explicit borders (with at least one side defined)
    const hasExplicitBorders =
      hasBordersAttribute &&
      cellBordersAttr &&
      (cellBordersAttr.top !== undefined ||
        cellBordersAttr.right !== undefined ||
        cellBordersAttr.bottom !== undefined ||
        cellBordersAttr.left !== undefined);

    // Use gridColumnStart for border resolution (not cellIndex) since cells may be offset
    // by rowspans from previous rows. Similarly, use grid column count, not cell count.
    const gridColIndex = cellMeasure.gridColumnStart ?? cellIndex;
    const totalCols = columnWidths.length;

    // Border resolution with single-owner model:
    // DOCX files often use right/bottom ownership (each cell stores right and bottom).
    // We need to ensure edge cells get table's outer borders for missing top/left.
    //
    // Priority:
    // 1. Cell has borders attribute but empty → no borders (intentionally borderless)
    // 2. Cell has explicit borders → use those, but merge with table borders for edges
    // 3. Table has borders → resolve from table borders (single-owner: top/left + edge bottom/right)
    // 4. Neither → no borders
    //
    // CONTINUATION HANDLING (MS Word behavior):
    // MS Word draws borders at page breaks to visually "close" the table on each page.
    // - If continuesFromPrev=true: draw TOP border (table's top border) to close the top
    // - If continuesOnNext=true: draw BOTTOM border (table's bottom border) to close the bottom
    // This means both fragments at a split have their edge borders drawn.
    let resolvedBorders;
    if (hasBordersAttribute && !hasExplicitBorders) {
      // Cell explicitly has borders={} meaning "no borders"
      resolvedBorders = undefined;
    } else if (hasExplicitBorders && tableBorders) {
      // Merge cell's explicit borders with table's outer borders for edge cells
      // This handles DOCX files that use right/bottom ownership model
      const isFirstRow = rowIndex === 0;
      const isLastRow = rowIndex === totalRows - 1;
      const isFirstCol = gridColIndex === 0;
      const isLastCol = gridColIndex === totalCols - 1;

      // For continuation handling: treat split boundaries as table edges
      const treatAsFirstRow = isFirstRow || continuesFromPrev;
      const treatAsLastRow = isLastRow || continuesOnNext;

      resolvedBorders = {
        // For top: use cell's if defined, otherwise use table's top border for first row OR continuation
        top: cellBordersAttr.top ?? borderValueToSpec(treatAsFirstRow ? tableBorders.top : tableBorders.insideH),
        // For bottom: use cell's if defined, otherwise use table's bottom border for last row OR before continuation
        bottom: cellBordersAttr.bottom ?? borderValueToSpec(treatAsLastRow ? tableBorders.bottom : undefined),
        // For left: use cell's if defined, otherwise use table's left for first col
        left: cellBordersAttr.left ?? borderValueToSpec(isFirstCol ? tableBorders.left : tableBorders.insideV),
        // For right: use cell's if defined, otherwise use table's right for last col only
        right: cellBordersAttr.right ?? borderValueToSpec(isLastCol ? tableBorders.right : undefined),
      };
    } else if (hasExplicitBorders) {
      // Cell has explicit borders but no table borders to merge with
      // Use cell borders as-is (no table borders to add for continuations)
      resolvedBorders = {
        top: cellBordersAttr.top,
        bottom: cellBordersAttr.bottom,
        left: cellBordersAttr.left,
        right: cellBordersAttr.right,
      };
    } else if (tableBorders) {
      // For continuation handling: treat split boundaries as table edges
      const isFirstRow = rowIndex === 0;
      const isLastRow = rowIndex === totalRows - 1;
      const treatAsFirstRow = isFirstRow || continuesFromPrev;
      const treatAsLastRow = isLastRow || continuesOnNext;

      // Get base borders, then override for continuations
      const baseBorders = resolveTableCellBorders(tableBorders, rowIndex, gridColIndex, totalRows, totalCols);

      if (baseBorders) {
        resolvedBorders = {
          // If this is a continuation (continuesFromPrev), use table's top border
          top: treatAsFirstRow ? borderValueToSpec(tableBorders.top) : baseBorders.top,
          // If this continues on next (continuesOnNext), use table's bottom border
          bottom: treatAsLastRow ? borderValueToSpec(tableBorders.bottom) : baseBorders.bottom,
          left: baseBorders.left,
          right: baseBorders.right,
        };
      } else {
        resolvedBorders = undefined;
      }
    } else {
      resolvedBorders = undefined;
    }

    // Calculate cell height - use rowspan height if cell spans multiple rows
    // For partial rows, use the partial height instead
    const rowSpan = cellMeasure.rowSpan ?? 1;
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
    const colSpan = cellMeasure.colSpan ?? 1;
    const gridStart = cellMeasure.gridColumnStart ?? cellIndex;
    let computedCellWidth = 0;
    for (let i = gridStart; i < gridStart + colSpan && i < columnWidths.length; i++) {
      computedCellWidth += columnWidths[i];
    }

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
