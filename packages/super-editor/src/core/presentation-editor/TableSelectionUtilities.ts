/**
 * @fileoverview
 * Table selection utilities for handling cell selection and table hit testing.
 *
 * This module provides low-level utilities for working with table selections in the editor:
 * - Converting table hit test results to ProseMirror positions
 * - Determining when to use cell selection vs text selection during interactions
 * - Hit testing to identify which table cell is at a given coordinate
 *
 * These utilities bridge the gap between layout-space coordinates (from DOM events)
 * and document-space positions (used by ProseMirror's selection model).
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import {
  hitTestTableFragment,
  type PageGeometryHelper,
  type PageHit,
  type TableHitResult,
} from '@superdoc/layout-bridge';

/**
 * Calculates the ProseMirror document position for a table cell identified by a hit test result.
 *
 * This function traverses the ProseMirror document tree to locate the table node corresponding
 * to the hit result, then navigates through the table structure (accounting for colspan) to find
 * the exact position of the target cell.
 *
 * @param tableHit - Hit test result containing the table block ID and cell coordinates
 * @param doc - ProseMirror document node to search within
 * @param blocks - Array of layout blocks used to locate the target table
 * @returns The document position at the start of the target cell, or null if not found
 *
 * @remarks
 * This function handles several edge cases:
 * - Validates all input parameters and cell indices for safety
 * - Accounts for colspan when calculating logical column positions
 * - Returns null if the table or cell cannot be located
 * - Logs warnings for invalid inputs to aid debugging
 *
 * The position returned is at the start of the cell node (before any cell content).
 * Table structure: table > tableRow > tableCell
 *
 * @example
 * ```typescript
 * const tableHit = hitTestTable(layout, blocks, measures, x, y, ...);
 * if (tableHit) {
 *   const cellPos = getCellPosFromTableHit(tableHit, doc, blocks);
 *   if (cellPos !== null) {
 *     // Use cellPos to create a selection or perform operations
 *   }
 * }
 * ```
 */
export function getCellPosFromTableHit(
  tableHit: TableHitResult,
  doc: ProseMirrorNode | null,
  blocks: FlowBlock[],
): number | null {
  // Input validation: Check for valid tableHit structure
  if (!tableHit || !tableHit.block || typeof tableHit.block.id !== 'string') {
    console.warn('[getCellPosFromTableHit] Invalid tableHit input:', tableHit);
    return null;
  }

  // Validate cell indices are non-negative
  if (
    typeof tableHit.cellRowIndex !== 'number' ||
    typeof tableHit.cellColIndex !== 'number' ||
    tableHit.cellRowIndex < 0 ||
    tableHit.cellColIndex < 0
  ) {
    console.warn('[getCellPosFromTableHit] Invalid cell indices:', {
      row: tableHit.cellRowIndex,
      col: tableHit.cellColIndex,
    });
    return null;
  }

  if (!doc) return null;

  // Find the table node in the document by searching for the block ID
  // Get table blocks only and find the index of the target table
  const tableBlocks = blocks.filter((b) => b.kind === 'table');
  const targetTableIndex = tableBlocks.findIndex((b) => b.id === tableHit.block.id);
  if (targetTableIndex === -1) return null;

  let tablePos: number | null = null;
  let currentTableIndex = 0;

  try {
    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        if (currentTableIndex === targetTableIndex) {
          tablePos = pos;
          return false; // Stop iteration
        }
        currentTableIndex++;
      }
      return true;
    });
  } catch (error: unknown) {
    console.error('[getCellPosFromTableHit] Error during document traversal:', error);
    return null;
  }

  if (tablePos === null) return null;

  const tableNode = doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') return null;

  // Navigate to the specific cell
  const targetRowIndex = tableHit.cellRowIndex;
  const targetColIndex = tableHit.cellColIndex;

  // Bounds check: Validate target row exists in table
  if (targetRowIndex >= tableNode.childCount) {
    console.warn('[getCellPosFromTableHit] Target row index out of bounds:', {
      targetRowIndex,
      tableChildCount: tableNode.childCount,
    });
    return null;
  }

  // Calculate position by traversing table structure
  // Table structure: table > tableRow > tableCell
  let currentPos = tablePos + 1; // +1 to enter the table node

  // Iterate through rows to find the target row
  for (let r = 0; r < tableNode.childCount && r <= targetRowIndex; r++) {
    const row = tableNode.child(r);
    if (r === targetRowIndex) {
      // Found the target row, now find the cell
      currentPos += 1; // +1 to enter the row node

      // Track logical column position accounting for colspan
      let logicalCol = 0;
      for (let cellIndex = 0; cellIndex < row.childCount; cellIndex++) {
        const cell = row.child(cellIndex);
        // Type guard: Validate colspan is a positive number
        const rawColspan = cell.attrs?.colspan;
        const colspan =
          typeof rawColspan === 'number' && Number.isFinite(rawColspan) && rawColspan > 0 ? rawColspan : 1;

        // Check if target column falls within this cell's span
        if (targetColIndex >= logicalCol && targetColIndex < logicalCol + colspan) {
          // Found the target cell - return position at cell start
          return currentPos;
        }

        // Move past this cell
        currentPos += cell.nodeSize;
        logicalCol += colspan;
      }

      // Target column not found in this row (shouldn't happen in valid tables)
      console.warn('[getCellPosFromTableHit] Target column not found in row:', {
        targetColIndex,
        logicalColReached: logicalCol,
        rowCellCount: row.childCount,
      });
      return null;
    } else {
      // Move past this row
      currentPos += row.nodeSize;
    }
  }

  return null;
}

/**
 * Retrieves the ProseMirror document position for the start of a table identified by a hit test result.
 *
 * This function locates the table node in the document by matching the table block ID from the
 * hit test result against the layout blocks array.
 *
 * @param tableHit - Hit test result containing the table block ID
 * @param doc - ProseMirror document node to search within
 * @param blocks - Array of layout blocks used to locate the target table
 * @returns The document position at the start of the table node, or null if not found
 *
 * @remarks
 * Unlike getCellPosFromTableHit, this function returns the position of the table node itself,
 * not a specific cell within it. This is useful for operations that need to reference the
 * entire table structure.
 *
 * The position returned is at the start of the table node (before the first row).
 *
 * @example
 * ```typescript
 * const tableHit = hitTestTable(layout, blocks, measures, x, y, ...);
 * if (tableHit) {
 *   const tablePos = getTablePosFromHit(tableHit, doc, blocks);
 *   if (tablePos !== null) {
 *     const tableNode = doc.nodeAt(tablePos);
 *     // Perform table-level operations
 *   }
 * }
 * ```
 */
export function getTablePosFromHit(
  tableHit: TableHitResult,
  doc: ProseMirrorNode | null,
  blocks: FlowBlock[],
): number | null {
  if (!doc) return null;

  // Get table blocks only and find the index of the target table
  const tableBlocks = blocks.filter((b) => b.kind === 'table');
  const targetTableIndex = tableBlocks.findIndex((b) => b.id === tableHit.block.id);
  if (targetTableIndex === -1) return null;

  let tablePos: number | null = null;
  let currentTableIndex = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      if (currentTableIndex === targetTableIndex) {
        tablePos = pos;
        return false;
      }
      currentTableIndex++;
    }
    return true;
  });

  return tablePos;
}

/**
 * Determines whether cell selection mode should be used based on the current drag state and position.
 *
 * This function implements the state machine logic for transitioning between regular text selection
 * and table cell selection during pointer interactions. It handles cases where the user drags within
 * a table, across cell boundaries, or outside the table entirely.
 *
 * @param currentTableHit - Current hit test result, or null if pointer is outside any table
 * @param cellAnchor - The cell where the drag started, or null if not dragging from a table cell
 * @param cellDragMode - Current drag mode state: 'none', 'pending', or 'active'
 * @returns True if cell selection should be used, false for regular text selection
 *
 * @remarks
 * The function implements the following logic:
 * - Returns false if no cell anchor exists (drag didn't start in a table)
 * - Returns true if drag mode is active and pointer is outside any table (preserves last cell selection)
 * - Returns true if drag mode is active and pointer is in a different table (preserves last cell selection)
 * - Returns true if the pointer has crossed a cell boundary within the same table
 * - Returns true if drag mode is active and pointer is still in the same cell
 * - Returns false otherwise (same cell, pending mode)
 *
 * This enables a smooth user experience where cell selection activates when crossing cell boundaries
 * and persists when dragging outside the table.
 *
 * @example
 * ```typescript
 * if (shouldUseCellSelection(currentTableHit, cellAnchor, cellDragMode)) {
 *   // Use CellSelection for multi-cell selection
 *   const cellSelection = createCellSelection(...);
 * } else {
 *   // Use TextSelection for normal selection
 *   const textSelection = createTextSelection(...);
 * }
 * ```
 */
export function shouldUseCellSelection(
  currentTableHit: TableHitResult | null,
  cellAnchor: { tableBlockId: string; cellRowIndex: number; cellColIndex: number } | null,
  cellDragMode: 'none' | 'pending' | 'active',
): boolean {
  // No cell anchor means we didn't start in a table
  if (!cellAnchor) return false;

  // Current position is outside any table - keep last cell selection
  if (!currentTableHit) return cellDragMode === 'active';

  // Check if we're in the same table
  if (currentTableHit.block.id !== cellAnchor.tableBlockId) {
    // Different table - treat as outside table
    return cellDragMode === 'active';
  }

  // Check if we've crossed a cell boundary
  const sameCell =
    currentTableHit.cellRowIndex === cellAnchor.cellRowIndex &&
    currentTableHit.cellColIndex === cellAnchor.cellColIndex;

  if (!sameCell) {
    // We've crossed into a different cell - activate cell selection
    return true;
  }

  // Same cell - only use cell selection if we were already in active mode
  return cellDragMode === 'active';
}

/**
 * Performs hit testing to determine which table cell (if any) is at the given coordinates.
 *
 * This function combines page-level hit testing with table fragment hit testing to accurately
 * identify the table cell at a specific point in the document. It handles multi-page tables,
 * page virtualization, and provides fallback logic when geometry helpers are unavailable.
 *
 * @param layout - Current layout state containing pages and fragments
 * @param blocks - Array of layout blocks (tables, paragraphs, etc.)
 * @param measures - Array of measurement data corresponding to blocks
 * @param normalizedX - X coordinate in document space (not page-relative)
 * @param normalizedY - Y coordinate in document space (not page-relative)
 * @param configuredPageHeight - Configured page height from layout options
 * @param pageGapFallback - Gap between pages when layout.pageGap is not available
 * @param geometryHelper - Optional helper for efficient page geometry queries
 * @returns Hit test result with table block ID and cell coordinates, or null if no table hit
 *
 * @remarks
 * The function performs a two-stage hit test:
 * 1. Identify which page contains the coordinates (using geometryHelper or manual scan)
 * 2. Convert to page-relative coordinates and delegate to hitTestTableFragment
 *
 * The geometryHelper (when available) provides optimized page lookups for better performance.
 * If unavailable, the function falls back to a linear scan through all pages.
 *
 * Coordinate systems:
 * - Input coordinates (normalizedX, normalizedY) are in document space (absolute from top)
 * - Converted to page-relative coordinates before table fragment hit testing
 * - Page heights and gaps account for multi-page layout
 *
 * @example
 * ```typescript
 * const tableHit = hitTestTable(
 *   layout,
 *   blocks,
 *   measures,
 *   event.clientX,
 *   event.clientY,
 *   792,
 *   20,
 *   geometryHelper
 * );
 *
 * if (tableHit) {
 *   console.log(`Hit cell [${tableHit.cellRowIndex}, ${tableHit.cellColIndex}]`);
 * }
 * ```
 */
export function hitTestTable(
  layout: Layout | null,
  blocks: FlowBlock[],
  measures: Measure[],
  normalizedX: number,
  normalizedY: number,
  configuredPageHeight: number,
  pageGapFallback: number,
  geometryHelper: PageGeometryHelper | null,
): TableHitResult | null {
  if (!layout) {
    return null;
  }

  let pageY = 0;
  let pageHit: PageHit | null = null;

  if (geometryHelper) {
    const idx = geometryHelper.getPageIndexAtY(normalizedY) ?? geometryHelper.getNearestPageIndex(normalizedY);
    if (idx != null && layout.pages[idx]) {
      pageHit = { pageIndex: idx, page: layout.pages[idx] };
      pageY = geometryHelper.getPageTop(idx);
    }
  }

  // Fallback to manual scan if helper unavailable
  if (!pageHit) {
    const gap = layout.pageGap ?? pageGapFallback;
    for (let i = 0; i < layout.pages.length; i++) {
      const page = layout.pages[i];
      // Use page.size.h if available, otherwise fall back to configured page size
      const pageHeight = page.size?.h ?? configuredPageHeight;

      if (normalizedY >= pageY && normalizedY < pageY + pageHeight) {
        pageHit = { pageIndex: i, page };
        break;
      }
      pageY += pageHeight + gap;
    }
  }

  if (!pageHit) {
    return null;
  }

  // Convert to page-relative coordinates
  const pageRelativeY = normalizedY - pageY;
  const point = { x: normalizedX, y: pageRelativeY };

  return hitTestTableFragment(pageHit, blocks, measures, point);
}
