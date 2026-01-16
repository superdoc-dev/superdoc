import { TableMap } from 'prosemirror-tables';
import type { CellSelection } from 'prosemirror-tables';
import type { FlowBlock, Layout, Measure, TableBlock, TableFragment, TableMeasure } from '@superdoc/contracts';

/**
 * Coordinate pair in overlay space (absolute positioning within the selection overlay container).
 */
type OverlayCoords = { x: number; y: number };

/**
 * Dependencies required to render cell selection overlays.
 *
 * @remarks
 * This type encapsulates all the state and helper functions needed to render visual highlights
 * for selected table cells. The separation of concerns allows the rendering logic to remain
 * pure and testable.
 */
export type RenderCellSelectionOverlayDeps = {
  /** ProseMirror CellSelection instance representing the selected cells */
  selection: CellSelection;
  /** Current layout state containing pages, fragments, and geometry information */
  layout: Layout;
  /** DOM element where selection highlight rectangles will be appended */
  localSelectionLayer: HTMLElement;
  /** Array of layout blocks (tables, paragraphs, etc.) */
  blocks: FlowBlock[];
  /** Array of measurement data corresponding to blocks (for row heights, column widths) */
  measures: Measure[];
  /** Optional table block ID hint to optimize table lookup */
  cellAnchorTableBlockId?: string | null;
  /** Function to convert page-local coordinates to overlay-absolute coordinates */
  convertPageLocalToOverlayCoords: (pageIndex: number, x: number, y: number) => OverlayCoords | null;
};

/**
 * Renders visual highlighting for CellSelection (multiple table cells selected).
 *
 * This function creates semi-transparent blue overlay rectangles for each selected cell in a table,
 * accurately positioning them based on layout measurements. It handles complex table structures
 * including merged cells (colspan/rowspan), multi-page tables, and column boundary calculations.
 *
 * @param deps - Dependencies object containing selection state, layout data, and helper functions
 *
 * @remarks
 * Implementation details:
 * - Uses ProseMirror's TableMap to get accurate row/column positions for selected cells
 * - Accounts for colspan when calculating cell widths (sums multiple column boundaries)
 * - Accounts for rowspan when calculating cell heights (sums multiple row heights)
 * - Handles tables split across multiple pages via table fragments
 * - Uses table measures for precise row heights and column boundaries
 * - Falls back to estimated heights if measure data is unavailable
 * - Skips rendering cells on virtualized (unmounted) pages gracefully
 *
 * This function never throws; errors are caught and rendering gracefully degrades.
 * Invalid inputs or missing data result in warnings and early returns.
 *
 * Cell highlight styling:
 * - Position: absolute within localSelectionLayer
 * - Background: rgba(51, 132, 255, 0.35) (blue with 35% opacity)
 * - Pointer events: none (allows clicks to pass through)
 * - Class: 'presentation-editor__cell-selection-rect'
 *
 * @example
 * ```typescript
 * // Called during selection rendering cycle
 * if (selection instanceof CellSelection) {
 *   renderCellSelectionOverlay({
 *     selection,
 *     layout,
 *     localSelectionLayer,
 *     blocks,
 *     measures,
 *     cellAnchorTableBlockId,
 *     convertPageLocalToOverlayCoords
 *   });
 * }
 * ```
 */
export function renderCellSelectionOverlay({
  selection,
  layout,
  localSelectionLayer,
  blocks,
  measures,
  cellAnchorTableBlockId,
  convertPageLocalToOverlayCoords,
}: RenderCellSelectionOverlayDeps): void {
  // Validate input parameters
  if (!selection || !layout || !layout.pages) {
    console.warn('[renderCellSelectionOverlay] Invalid input parameters');
    return;
  }

  // Find the table node by walking up from the anchor cell
  const $anchorCell = selection.$anchorCell;
  if (!$anchorCell) {
    console.warn('[renderCellSelectionOverlay] No anchor cell in selection');
    return;
  }

  let tableDepth = $anchorCell.depth;
  while (tableDepth > 0 && $anchorCell.node(tableDepth).type.name !== 'table') {
    tableDepth--;
  }

  // Validate we found a table node
  if (tableDepth === 0 && $anchorCell.node(0).type.name !== 'table') {
    console.warn('[renderCellSelectionOverlay] Could not find table node in selection hierarchy');
    return;
  }

  const tableNode = $anchorCell.node(tableDepth);
  const tableStart = $anchorCell.start(tableDepth) - 1;

  // Find the corresponding table block in layout state
  let tableBlock: TableBlock | undefined;
  if (cellAnchorTableBlockId) {
    tableBlock = blocks.find((block) => block.kind === 'table' && block.id === cellAnchorTableBlockId) as
      | TableBlock
      | undefined;
  }
  if (!tableBlock) {
    const expectedBlockId = `${tableStart}-table`;
    tableBlock = blocks.find((block) => block.kind === 'table' && block.id === expectedBlockId) as
      | TableBlock
      | undefined;
  }
  if (!tableBlock) {
    const tableBlocks = blocks.filter((block) => block.kind === 'table') as TableBlock[];
    if (tableBlocks.length === 1) {
      tableBlock = tableBlocks[0];
    }
  }
  if (!tableBlock) {
    return;
  }

  // Find table fragments on all pages
  const tableFragments: Array<{ fragment: TableFragment; pageIndex: number }> = [];
  layout.pages.forEach((page, pageIndex) => {
    page.fragments.forEach((fragment) => {
      if (fragment.kind === 'table' && fragment.blockId === tableBlock.id) {
        tableFragments.push({ fragment: fragment as TableFragment, pageIndex });
      }
    });
  });
  if (tableFragments.length === 0) {
    return;
  }

  // Use TableMap to get accurate row/column positions for selected cells
  // Wrap TableMap.get in try-catch as it may throw on invalid table structures
  let tableMap;
  try {
    tableMap = TableMap.get(tableNode);
  } catch (error: unknown) {
    console.error('[renderCellSelectionOverlay] TableMap.get failed:', error);
    return;
  }

  const selectedCells: Array<{ row: number; col: number; colspan: number; rowspan: number }> = [];

  selection.forEachCell((cellNode, cellPos) => {
    const cellOffset = cellPos - tableStart - 1;
    const mapIndex = tableMap.map.indexOf(cellOffset);
    if (mapIndex === -1) {
      return;
    }

    const row = Math.floor(mapIndex / tableMap.width);
    const col = mapIndex % tableMap.width;
    // Type guard: Validate colspan and rowspan are positive numbers
    const rawColspan = cellNode.attrs?.colspan;
    const rawRowspan = cellNode.attrs?.rowspan;
    const colspan = typeof rawColspan === 'number' && Number.isFinite(rawColspan) && rawColspan > 0 ? rawColspan : 1;
    const rowspan = typeof rawRowspan === 'number' && Number.isFinite(rawRowspan) && rawRowspan > 0 ? rawRowspan : 1;

    selectedCells.push({ row, col, colspan, rowspan });
  });

  // Get row heights from table measure (measures array corresponds to blocks array by index)
  const tableBlockIndex = blocks.indexOf(tableBlock as FlowBlock);
  const measureAtIndex = tableBlockIndex !== -1 ? measures[tableBlockIndex] : undefined;
  const tableMeasure = measureAtIndex?.kind === 'table' ? (measureAtIndex as TableMeasure) : undefined;

  // Compute row Y positions from measure data
  const rowPositions: Array<{ y: number; height: number }> = [];
  if (tableMeasure?.rows) {
    let currentY = 0;
    for (const rowMeasure of tableMeasure.rows) {
      rowPositions.push({ y: currentY, height: rowMeasure.height });
      currentY += rowMeasure.height;
    }
  }

  // Render selection rectangles for each selected cell
  for (const { fragment, pageIndex } of tableFragments) {
    const { columnBoundaries } = fragment.metadata ?? {};
    if (!columnBoundaries) {
      continue;
    }

    for (const { row, col, colspan, rowspan } of selectedCells) {
      // Skip cells outside this fragment's row range
      if (row < fragment.fromRow || row >= fragment.toRow) {
        continue;
      }

      // Find column boundary
      const colBoundary = columnBoundaries.find((cb) => cb.index === col);
      if (!colBoundary) {
        continue;
      }

      // Calculate cell width (accounting for colspan)
      let cellWidth = colBoundary.width;
      if (colspan > 1) {
        for (let c = 1; c < colspan; c++) {
          const nextColBoundary = columnBoundaries.find((cb) => cb.index === col + c);
          if (nextColBoundary) {
            cellWidth += nextColBoundary.width;
          }
        }
      }

      // Calculate row Y position and height
      let rowY: number;
      let rowHeight: number;

      // Bounds check: Ensure row index is within valid range
      if (row >= 0 && row < rowPositions.length && rowPositions[row]) {
        // Use measure data - compute Y relative to fragment's first row
        const fragmentStartY =
          fragment.fromRow > 0 && fragment.fromRow < rowPositions.length && rowPositions[fragment.fromRow]
            ? rowPositions[fragment.fromRow].y
            : 0;
        rowY = rowPositions[row].y - fragmentStartY;
        rowHeight = rowPositions[row].height;

        // Account for rowspan with bounds checking
        if (rowspan > 1) {
          for (let r = 1; r < rowspan && row + r < rowPositions.length && rowPositions[row + r]; r++) {
            rowHeight += rowPositions[row + r].height;
          }
        }
      } else {
        // Fallback: estimate from fragment height
        const rowCount = fragment.toRow - fragment.fromRow;
        const estimatedRowHeight = rowCount > 0 ? fragment.height / rowCount : 20;
        const fragmentRelativeRow = row - fragment.fromRow;
        rowY = fragmentRelativeRow * estimatedRowHeight;
        rowHeight = estimatedRowHeight * rowspan;
      }

      // Compute cell rectangle in page-local coordinates
      const cellX = fragment.x + colBoundary.x;
      const cellY = fragment.y + rowY;

      // Convert to overlay coordinates
      const coords = convertPageLocalToOverlayCoords(pageIndex, cellX, cellY);
      if (!coords) {
        continue;
      }

      // Create and append highlight element
      const highlight = localSelectionLayer.ownerDocument?.createElement('div');
      if (!highlight) {
        continue;
      }

      highlight.className = 'presentation-editor__cell-selection-rect';
      highlight.style.position = 'absolute';
      highlight.style.left = `${coords.x}px`;
      highlight.style.top = `${coords.y}px`;
      highlight.style.width = `${Math.max(1, cellWidth)}px`;
      highlight.style.height = `${Math.max(1, rowHeight)}px`;
      highlight.style.backgroundColor = 'rgba(51, 132, 255, 0.35)';
      highlight.style.pointerEvents = 'none';
      localSelectionLayer.appendChild(highlight);
    }
  }
}
