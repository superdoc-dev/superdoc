import type {
  TableBlock,
  TableMeasure,
  TableFragment,
  TableColumnBoundary,
  TableFragmentMetadata,
  TableRowMeasure,
  TableRow,
  PartialRowInfo,
  ParagraphMeasure,
  ParagraphBlock,
} from '@superdoc/contracts';
import type { PageState } from './paginator.js';
import { computeFragmentPmRange, extractBlockPmRange } from './layout-utils.js';

/**
 * Ratio of column width (0..1). An anchored table with totalWidth >= columnWidth * this value
 * is treated as full-width and laid out inline instead of as a floating fragment.
 */
export const ANCHORED_TABLE_FULL_WIDTH_RATIO = 0.99;

export type TableLayoutContext = {
  block: TableBlock;
  measure: TableMeasure;
  columnWidth: number;
  ensurePage: () => PageState;
  advanceColumn: (state: PageState) => PageState;
  columnX: (columnIndex: number) => number;
};

/**
 * Safely extract the tableIndent width value from table attributes.
 *
 * The tableIndent attribute controls horizontal offset of tables from the left margin.
 * Negative values are supported and allow tables to extend into the left margin,
 * matching Microsoft Word behavior.
 *
 * Edge cases handled:
 * - Missing attrs object: Returns 0
 * - Missing tableIndent property: Returns 0
 * - tableIndent is not an object: Returns 0
 * - tableIndent.width is missing: Returns 0
 * - tableIndent.width is not a number: Returns 0
 * - tableIndent.width is NaN: Returns 0
 * - tableIndent.width is Infinity/-Infinity: Returns 0
 *
 * @param attrs - Table attributes object (may be undefined)
 * @returns Table indent width in pixels, or 0 if invalid/missing
 *
 * @example
 * ```typescript
 * // Valid positive indent (table moves right)
 * getTableIndentWidth({ tableIndent: { width: 50 } }); // returns 50
 *
 * // Valid negative indent (table extends into left margin)
 * getTableIndentWidth({ tableIndent: { width: -20 } }); // returns -20
 *
 * // Invalid cases - all return 0
 * getTableIndentWidth(undefined); // returns 0
 * getTableIndentWidth({}); // returns 0
 * getTableIndentWidth({ tableIndent: null }); // returns 0
 * getTableIndentWidth({ tableIndent: { width: 'invalid' } }); // returns 0
 * getTableIndentWidth({ tableIndent: { width: NaN } }); // returns 0
 * ```
 */
function getTableIndentWidth(attrs: TableBlock['attrs']): number {
  // Guard: attrs must be defined
  if (!attrs) {
    return 0;
  }

  // Guard: tableIndent must exist and be an object
  const tableIndent = attrs.tableIndent;
  if (!tableIndent || typeof tableIndent !== 'object') {
    return 0;
  }

  // Guard: width must exist in tableIndent
  const width = (tableIndent as Record<string, unknown>).width;
  if (width === undefined || width === null) {
    return 0;
  }

  // Guard: width must be a number
  if (typeof width !== 'number') {
    return 0;
  }

  // Guard: width must be finite (not NaN or Infinity)
  if (!Number.isFinite(width)) {
    return 0;
  }

  return width;
}

/**
 * Apply table indent offset to x position and width, ensuring width stays in a sane range.
 *
 * Positive indents move the table right. Width is only reduced when needed to prevent
 * right overflow past the current column (avoids double-shrinking tables whose grid is
 * already reduced by tblInd in OOXML).
 *
 * Negative indents keep the historical behavior: move left and expand width to preserve
 * the same right edge.
 *
 * @param x - Original x position in pixels
 * @param width - Original width in pixels
 * @param indent - Table indent offset in pixels (positive or negative)
 * @param columnWidth - Column width available for the table
 * @returns Object with adjusted x and width values
 */
function applyTableIndent(x: number, width: number, indent: number, columnWidth: number): { x: number; width: number } {
  const shiftedX = x + indent;

  if (indent <= 0) {
    return {
      x: shiftedX,
      width: Math.max(0, width - indent),
    };
  }

  const maxWidthWithinColumn = Math.max(0, columnWidth - indent);
  return {
    x: shiftedX,
    width: Math.min(width, maxWidthWithinColumn),
  };
}

/**
 * Resolve the table fragment frame within a column based on justification.
 *
 * When justification is center or right/end, the table is aligned within the
 * column width and tableIndent is ignored. Otherwise, tableIndent offsets the
 * table from the left margin and clamps width only when needed to avoid overflow.
 *
 * @param baseX - Left edge of the column in pixels
 * @param columnWidth - Available column width in pixels
 * @param tableWidth - Measured table width in pixels
 * @param attrs - Table attributes
 * @returns Resolved x and width for the table fragment
 */
function resolveTableFrame(
  baseX: number,
  columnWidth: number,
  tableWidth: number,
  attrs: TableBlock['attrs'],
): { x: number; width: number } {
  const width = Math.min(columnWidth, tableWidth);
  const justification = typeof attrs?.justification === 'string' ? attrs.justification : undefined;

  if (justification === 'center') {
    return { x: baseX + Math.max(0, (columnWidth - width) / 2), width };
  }
  if (justification === 'right' || justification === 'end') {
    return { x: baseX + Math.max(0, columnWidth - width), width };
  }

  const tableIndent = getTableIndentWidth(attrs);
  return applyTableIndent(baseX, width, tableIndent, columnWidth);
}

/**
 * Rescales column widths when a table is clamped to fit a narrower section.
 *
 * In mixed-orientation documents, tables are measured at the widest section's
 * content width but may render in narrower sections. When the measured total
 * width exceeds the fragment width, column widths must be proportionally
 * rescaled so cells don't overflow the fragment container (SD-1859).
 *
 * @returns Rescaled column widths if clamping occurred, undefined otherwise.
 */
export function rescaleColumnWidths(
  measureColumnWidths: number[] | undefined,
  measureTotalWidth: number,
  fragmentWidth: number,
): number[] | undefined {
  if (
    !measureColumnWidths ||
    measureColumnWidths.length === 0 ||
    measureTotalWidth <= fragmentWidth ||
    measureTotalWidth <= 0
  ) {
    return undefined;
  }
  const scale = fragmentWidth / measureTotalWidth;
  const scaled = measureColumnWidths.map((w) => Math.max(1, Math.round(w * scale)));
  const scaledSum = scaled.reduce((a, b) => a + b, 0);
  const target = Math.round(fragmentWidth);
  if (scaledSum !== target && scaled.length > 0) {
    scaled[scaled.length - 1] = Math.max(1, scaled[scaled.length - 1] + (target - scaledSum));
  }
  return scaled;
}

/**
 * Calculate minimum width for a table column.
 *
 * Uses a conservative minimum of 10px per column to match PM's
 * columnResizing behavior.
 *
 * @returns Minimum width in pixels (10px)
 */
function calculateColumnMinWidth(): number {
  const DEFAULT_MIN_WIDTH = 10; // Minimum usable column width in pixels

  return DEFAULT_MIN_WIDTH;
}

/**
 * Generate column boundary metadata for interactive table resizing.
 *
 * Creates metadata that enables the overlay component to position resize handles
 * and enforce minimum width constraints during drag operations.
 *
 * The generated metadata includes:
 * - Column index (for identifying which column to resize)
 * - X position (for positioning resize handles)
 * - Current width (for calculating new widths during resize)
 * - Minimum width (for constraining resize operations)
 * - Resizable flag (currently always true, future: lock specific columns)
 *
 * Edge cases handled:
 * - Empty columnWidths array: Returns empty array (no boundaries)
 * - Single column: Returns one boundary with proper min/max constraints
 * - Very wide/narrow columns: Supported with a fixed resize floor
 *
 * @param measure - Table measurement containing column widths
 * @returns Array of column boundary metadata, one per column
 */
function generateColumnBoundaries(measure: TableMeasure, effectiveWidths?: number[]): TableColumnBoundary[] {
  const boundaries: TableColumnBoundary[] = [];
  let xPosition = 0;
  const widths = effectiveWidths ?? measure.columnWidths;

  for (let i = 0; i < widths.length; i++) {
    const width = widths[i];
    const minWidth = calculateColumnMinWidth();

    const boundary = {
      index: i,
      x: xPosition,
      width,
      minWidth,
      resizable: true, // All columns resizable initially
    };

    boundaries.push(boundary);

    xPosition += width;
  }

  return boundaries;
}

/**
 * Count contiguous header rows from the beginning of the table.
 *
 * Header rows are identified by the `repeatHeader` attribute in tableRowProperties.
 * Only contiguous header rows from row 0 are counted; the first non-header row
 * terminates the count.
 *
 * @param block - Table block containing rows and attributes
 * @returns Number of contiguous header rows from row 0
 */
function countHeaderRows(block: TableBlock): number {
  let count = 0;
  for (let i = 0; i < block.rows.length; i++) {
    const row = block.rows[i];
    const repeatHeader = row.attrs?.tableRowProperties?.repeatHeader;
    if (repeatHeader === true) {
      count++;
    } else {
      // Stop at first non-header row
      break;
    }
  }
  return count;
}

/**
 * Sum row heights for a given range.
 *
 * @param rows - Array of measured table rows
 * @param fromRow - Starting row index (inclusive)
 * @param toRow - Ending row index (exclusive)
 * @returns Total height in pixels
 */
function sumRowHeights(rows: TableRowMeasure[], fromRow: number, toRow: number): number {
  let total = 0;
  for (let i = fromRow; i < toRow && i < rows.length; i++) {
    total += rows[i].height;
  }
  return total;
}

/**
 * Calculate the actual rendered height of a table fragment.
 *
 * CRITICAL: This is used for cursor advancement, not measure.totalHeight.
 * Fragment height = (repeated headers) + (body rows from fromRow to toRow)
 *
 * @param fragment - Table fragment with fromRow, toRow, repeatHeaderCount
 * @param measure - Table measurements
 * @param headerCount - Total number of header rows in the table
 * @returns Actual fragment height in pixels
 */
function calculateFragmentHeight(
  fragment: Pick<TableFragment, 'fromRow' | 'toRow' | 'repeatHeaderCount'>,
  measure: TableMeasure,
  _headerCount: number,
): number {
  let height = 0;

  // Add header height if continuation with repeated headers
  if (fragment.repeatHeaderCount && fragment.repeatHeaderCount > 0) {
    height += sumRowHeights(measure.rows, 0, fragment.repeatHeaderCount);
  }

  // Add body row heights (fromRow to toRow, exclusive)
  height += sumRowHeights(measure.rows, fragment.fromRow, fragment.toRow);

  return height;
}

type SplitPointResult = {
  endRow: number; // Exclusive row index (next row after last included)
  partialRow: PartialRowInfo | null; // Null for row-boundary splits, PartialRowInfo for mid-row splits
  forcePageBreak?: boolean; // When true, force a page break after this fragment (rowspan-aware clean break)
};

/**
 * Minimum height in pixels required to render a partial row.
 * Below this threshold, we don't attempt mid-row splits as there's
 * insufficient space to render even a single line of text.
 */
const MIN_PARTIAL_ROW_HEIGHT = 20;

/**
 * Get the line segments for a single embedded table row.
 *
 * If any cell in the row contains nested tables, recursively expand using
 * the tallest cell's segments. This enables the layout engine to split at
 * sub-row boundaries even for deeply nested tables (table-in-table-in-table).
 * Otherwise, return the row as a single segment with its measured height.
 */
function getEmbeddedRowLines(row: TableRowMeasure): Array<{ lineHeight: number }> {
  // Check if any cell has nested table blocks
  const hasNestedTable = row.cells.some((cell) => cell.blocks?.some((b) => b.kind === 'table'));

  if (!hasNestedTable) {
    // Simple case: no nested tables, row is one segment
    return [{ lineHeight: row.height || 0 }];
  }

  // Recursive case: find the cell with the most segments (tallest content)
  let tallestLines: Array<{ lineHeight: number }> = [];
  for (const cell of row.cells) {
    const cellLines = getCellLines(cell);
    if (cellLines.length > tallestLines.length) {
      tallestLines = cellLines;
    }
  }

  return tallestLines.length > 0 ? tallestLines : [{ lineHeight: row.height || 0 }];
}

export function getCellLines(cell: TableRowMeasure['cells'][number]): Array<{ lineHeight: number }> {
  // Multi-block cells use the `blocks` array
  if (cell.blocks && cell.blocks.length > 0) {
    const allLines: Array<{ lineHeight: number }> = [];
    for (const block of cell.blocks) {
      if (block.kind === 'paragraph') {
        if ('lines' in block) {
          const paraBlock = block as ParagraphMeasure;
          if (paraBlock.lines) {
            allLines.push(...paraBlock.lines);
          }
        }
      } else if (block.kind === 'table') {
        // Embedded tables: expand individual rows as separate segments so the
        // outer table splitter can break at embedded-table row boundaries,
        // matching MS Word behavior where nested tables paginate across pages.
        // Recursively expand rows that contain further nested tables.
        const tableBlock = block as TableMeasure;
        for (const row of tableBlock.rows) {
          allLines.push(...getEmbeddedRowLines(row));
        }
      } else {
        // Non-paragraph blocks (images, drawings) are represented as a single
        // unsplittable segment with their full height. This ensures computePartialRow
        // accounts for their height when splitting rows across pages.
        const blockHeight = 'height' in block ? (block as { height: number }).height : 0;
        if (blockHeight > 0) {
          allLines.push({ lineHeight: blockHeight });
        }
      }
    }
    return allLines;
  }

  // Fallback to single paragraph (backward compatibility)
  if (cell.paragraph?.lines) {
    return cell.paragraph.lines;
  }

  return [];
}

type CellPadding = { top: number; bottom: number; left: number; right: number };

function getCellPadding(cellIdx: number, blockRow?: TableRow): CellPadding {
  const padding = blockRow?.cells?.[cellIdx]?.attrs?.padding ?? {};
  return {
    top: padding.top ?? 0,
    bottom: padding.bottom ?? 0,
    left: padding.left ?? 4,
    right: padding.right ?? 4,
  };
}

/**
 * Get total line count for a cell across all its paragraph blocks.
 *
 * @param cell - Cell measure
 * @returns Total number of lines
 */
function getCellTotalLines(cell: TableRowMeasure['cells'][number]): number {
  return getCellLines(cell).length;
}

const ROW_HEIGHT_EPSILON = 0.1;

function getRowContentHeight(blockRow: TableRow | undefined, rowMeasure: TableRowMeasure): number {
  let contentHeight = 0;
  for (let cellIdx = 0; cellIdx < rowMeasure.cells.length; cellIdx++) {
    const cell = rowMeasure.cells[cellIdx];
    const cellPadding = getCellPadding(cellIdx, blockRow);
    const paddingTotal = cellPadding.top + cellPadding.bottom;
    const lines = getCellLines(cell);
    const linesHeight = lines.reduce((sum, line) => sum + (line.lineHeight || 0), 0);
    contentHeight = Math.max(contentHeight, linesHeight + paddingTotal);
  }
  return contentHeight;
}

function hasExplicitRowHeightSlack(blockRow: TableRow | undefined, rowMeasure: TableRowMeasure): boolean {
  const rowHeightSpec = blockRow?.attrs?.rowHeight;
  if (!rowHeightSpec || rowHeightSpec.value == null || !Number.isFinite(rowHeightSpec.value)) {
    return false;
  }

  const contentHeight = getRowContentHeight(blockRow, rowMeasure);
  return rowMeasure.height > contentHeight + ROW_HEIGHT_EPSILON;
}

/**
 * ProseMirror range representing a contiguous span of document positions.
 *
 * Used to track which portion of the ProseMirror document a table fragment
 * corresponds to, enabling accurate selection and editing of table content.
 *
 * @property pmStart - Absolute ProseMirror position (inclusive) where the range begins
 * @property pmEnd - Absolute ProseMirror position (exclusive) where the range ends
 */
type PmRange = { pmStart?: number; pmEnd?: number };

/**
 * Merge a source PmRange into a target PmRange, expanding the target to include the source.
 *
 * This function performs a union operation on two ranges by taking the minimum start
 * position and maximum end position. It handles undefined values gracefully, treating
 * them as unbounded in that direction.
 *
 * The target range is mutated in place for efficiency during aggregation of multiple ranges.
 *
 * @param target - The range to be expanded (mutated in place)
 * @param range - The source range to merge into the target
 *
 * @example
 * ```typescript
 * const target: PmRange = { pmStart: 10, pmEnd: 20 };
 * const range: PmRange = { pmStart: 15, pmEnd: 25 };
 * mergePmRange(target, range);
 * // target is now { pmStart: 10, pmEnd: 25 }
 * ```
 *
 * @example
 * ```typescript
 * // Handles undefined values
 * const target: PmRange = {};
 * const range: PmRange = { pmStart: 5, pmEnd: 10 };
 * mergePmRange(target, range);
 * // target is now { pmStart: 5, pmEnd: 10 }
 * ```
 */
function mergePmRange(target: PmRange, range: PmRange): void {
  if (typeof range.pmStart === 'number') {
    target.pmStart = target.pmStart == null ? range.pmStart : Math.min(target.pmStart, range.pmStart);
  }
  if (typeof range.pmEnd === 'number') {
    target.pmEnd = target.pmEnd == null ? range.pmEnd : Math.max(target.pmEnd, range.pmEnd);
  }
}

/**
 * Compute the ProseMirror range for a subset of lines within a table cell.
 *
 * Table cells can contain multiple blocks (paragraphs, images, etc.). This function
 * calculates which portion of the cell's content falls within the specified line range,
 * accounting for multi-block cells by accumulating line counts across blocks.
 *
 * Edge cases handled:
 * - Undefined cell or cellMeasure: Returns empty range
 * - Mismatched block counts: Uses minimum of both arrays to avoid out-of-bounds errors
 * - Lines spanning multiple blocks: Correctly maps global line indices to block-local indices
 * - Non-paragraph blocks: Includes their full PM range if within the line range
 *
 * @param cell - The table cell block data containing content blocks
 * @param cellMeasure - The measured cell data containing line information
 * @param fromLine - Starting line index (inclusive, 0-based) across all blocks in the cell
 * @param toLine - Ending line index (exclusive) across all blocks in the cell
 * @returns PmRange covering the specified lines, or empty range if cell is invalid
 *
 * @remarks
 * When cellBlocks.length !== blockMeasures.length, the function uses the minimum of both
 * lengths to prevent array access errors. This mismatch can occur during incremental
 * updates or measurement failures. The function gracefully handles this by processing
 * only the valid overlapping blocks.
 *
 * @example
 * ```typescript
 * // Single-block cell with 3 lines, requesting lines 0-2
 * const cell = { paragraph: { kind: 'paragraph', runs: [...] } };
 * const cellMeasure = { paragraph: { kind: 'paragraph', lines: [{...}, {...}, {...}] } };
 * const range = computeCellPmRange(cell, cellMeasure, 0, 2);
 * // range covers lines 0-1 (exclusive end)
 * ```
 *
 * @example
 * ```typescript
 * // Multi-block cell with lines spanning blocks
 * const cell = { blocks: [para1, para2] }; // para1 has 3 lines, para2 has 2 lines
 * const cellMeasure = { blocks: [measure1, measure2] };
 * const range = computeCellPmRange(cell, cellMeasure, 2, 4);
 * // range covers line 2 from para1 and line 0 from para2
 * ```
 */
function computeCellPmRange(
  cell: TableRow['cells'][number] | undefined,
  cellMeasure: TableRowMeasure['cells'][number] | undefined,
  fromLine: number,
  toLine: number,
): PmRange {
  const range: PmRange = {};
  if (!cell || !cellMeasure) return range;

  const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
  const blockMeasures = cellMeasure.blocks ?? (cellMeasure.paragraph ? [cellMeasure.paragraph] : []);

  // Use minimum length to handle mismatched data gracefully
  // This can occur during incremental updates or if measurement fails for some blocks
  const maxBlocks = Math.min(cellBlocks.length, blockMeasures.length);

  let cumulativeLineCount = 0;
  for (let i = 0; i < maxBlocks; i++) {
    const block = cellBlocks[i];
    const blockMeasure = blockMeasures[i];

    if (blockMeasure.kind === 'paragraph' && block?.kind === 'paragraph') {
      const paraMeasure = blockMeasure as ParagraphMeasure;
      const lines = paraMeasure.lines;
      const blockLineCount = lines?.length ?? 0;
      const blockStartGlobal = cumulativeLineCount;
      const blockEndGlobal = cumulativeLineCount + blockLineCount;

      const localFrom = Math.max(fromLine, blockStartGlobal) - blockStartGlobal;
      const localTo = Math.min(toLine, blockEndGlobal) - blockStartGlobal;

      if (lines && lines.length > 0 && localFrom < localTo) {
        // Use line-level PM range computation when lines are available
        mergePmRange(range, computeFragmentPmRange(block as ParagraphBlock, lines, localFrom, localTo));
      } else {
        // Fallback to block-level PM range when no lines or no overlap
        // This handles cases where the paragraph has PM range in attrs but no line data
        mergePmRange(range, extractBlockPmRange(block as { attrs?: Record<string, unknown> }));
      }

      cumulativeLineCount += blockLineCount;
      continue;
    }

    // Non-paragraph blocks: advance cumulative count to stay aligned with getCellLines().
    // Embedded tables expand to N segments (recursively, matching getEmbeddedRowLines);
    // images/drawings are 1 segment.
    if (blockMeasure.kind === 'table') {
      const tableMeasure = blockMeasure as TableMeasure;
      let tableSegments = 0;
      for (const row of tableMeasure.rows) {
        tableSegments += getEmbeddedRowLines(row).length;
      }
      const blockStart = cumulativeLineCount;
      const blockEnd = cumulativeLineCount + tableSegments;
      // Only include PM range if this block overlaps the requested line range
      if (blockStart < toLine && blockEnd > fromLine) {
        mergePmRange(range, extractBlockPmRange(block as { attrs?: Record<string, unknown> }));
      }
      cumulativeLineCount += tableSegments;
    } else {
      // Images, drawings: 1 segment each
      const blockStart = cumulativeLineCount;
      cumulativeLineCount += 1;
      if (blockStart < toLine && blockStart >= fromLine) {
        mergePmRange(range, extractBlockPmRange(block as { attrs?: Record<string, unknown> }));
      }
    }
  }

  return range;
}

/**
 * Compute the ProseMirror range for a table fragment spanning multiple rows.
 *
 * Aggregates PM ranges from all cells within the fragment, handling both full rows
 * and partial row splits (mid-row page breaks). For partial rows, consults the
 * partialRow metadata to determine which lines to include from each cell.
 *
 * Edge cases handled:
 * - Missing row or rowMeasure data: Skips invalid rows
 * - Mismatched cell counts: Uses minimum of both arrays
 * - Partial row with out-of-bounds cellIndex: Validates array access before reading fromLineByCell/toLineByCell
 * - Invalid line indices: Clamps to valid range and ensures toLine >= fromLine
 * - Empty cells (no lines): Gracefully handles totalLines = 0
 *
 * @param block - The table block containing row and cell data
 * @param measure - The table measurements containing cell line information
 * @param fromRow - Starting row index (inclusive, 0-based)
 * @param toRow - Ending row index (exclusive)
 * @param partialRow - Optional partial row metadata for mid-row splits
 * @returns Aggregated PmRange covering all included content
 *
 * @remarks
 * Partial row handling: When a row is split across pages, partialRow specifies
 * which lines to include from each cell via fromLineByCell and toLineByCell arrays.
 * These arrays are indexed by cellIndex. If cellIndex exceeds the array bounds,
 * the function defaults to including all lines (0 to totalLines), preventing errors.
 *
 * Line index validation: The function clamps fromLine and toLine to [0, totalLines]
 * and ensures toLine >= fromLine. This handles edge cases where partialRow metadata
 * contains invalid indices (e.g., from corrupt state or race conditions).
 *
 * @example
 * ```typescript
 * // Full table fragment (rows 0-2)
 * const range = computeTableFragmentPmRange(block, measure, 0, 2);
 * // range covers all content in rows 0 and 1
 * ```
 *
 * @example
 * ```typescript
 * // Partial row fragment (row 1, lines 2-5 from each cell)
 * const partialRow = {
 *   rowIndex: 1,
 *   fromLineByCell: [2, 2],
 *   toLineByCell: [5, 5],
 *   isFirstPart: false,
 *   isLastPart: false,
 *   partialHeight: 60
 * };
 * const range = computeTableFragmentPmRange(block, measure, 1, 2, partialRow);
 * // range covers only lines 2-4 (exclusive end) from each cell in row 1
 * ```
 */
function computeTableFragmentPmRange(
  block: TableBlock,
  measure: TableMeasure,
  fromRow: number,
  toRow: number,
  partialRow?: PartialRowInfo,
): PmRange {
  const range: PmRange = {};

  for (let rowIndex = fromRow; rowIndex < toRow; rowIndex++) {
    const row = block.rows[rowIndex];
    const rowMeasure = measure.rows[rowIndex];
    if (!row || !rowMeasure) continue;

    const isPartial = partialRow?.rowIndex === rowIndex;
    const cellCount = Math.min(row.cells.length, rowMeasure.cells.length);

    for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
      const cell = row.cells[cellIndex];
      const cellMeasure = rowMeasure.cells[cellIndex];
      if (!cell || !cellMeasure) continue;

      const totalLines = getCellTotalLines(cellMeasure);
      let fromLine = 0;
      let toLine = totalLines;

      if (isPartial) {
        // Validate cellIndex is within bounds before accessing arrays
        // This prevents errors when partialRow metadata is inconsistent with actual cell count
        const hasValidFromLineByCell = partialRow?.fromLineByCell && cellIndex < partialRow.fromLineByCell.length;
        const hasValidToLineByCell = partialRow?.toLineByCell && cellIndex < partialRow.toLineByCell.length;

        if (hasValidFromLineByCell) {
          const rawFrom = partialRow.fromLineByCell[cellIndex];
          if (typeof rawFrom === 'number' && rawFrom >= 0) {
            fromLine = rawFrom;
          }
        }

        if (hasValidToLineByCell) {
          const rawTo = partialRow.toLineByCell[cellIndex];
          if (typeof rawTo === 'number') {
            toLine = rawTo === -1 ? totalLines : rawTo;
          }
        }
      }

      // Clamp line indices to valid range
      fromLine = Math.max(0, Math.min(fromLine, totalLines));
      toLine = Math.max(0, Math.min(toLine, totalLines));
      if (toLine < fromLine) {
        toLine = fromLine;
      }

      mergePmRange(range, computeCellPmRange(cell, cellMeasure, fromLine, toLine));
    }
  }

  return range;
}

/**
 * Apply computed ProseMirror range to a table fragment.
 *
 * Mutates the fragment by setting its pmStart and pmEnd properties based on the
 * content it contains. This enables the overlay component to map fragment coordinates
 * back to ProseMirror document positions for selection and editing.
 *
 * The function computes the range by aggregating PM positions from all cells within
 * the fragment's row range, handling both full rows and partial row splits.
 *
 * @param fragment - The table fragment to annotate with PM range (mutated in place)
 * @param block - The table block containing row and cell data
 * @param measure - The table measurements containing cell line information
 *
 * @remarks
 * This function is called for every table fragment created during layout, including:
 * - Single-page tables (one fragment covering all rows)
 * - Multi-page tables (multiple fragments with row ranges)
 * - Partial row fragments (fragments with mid-row page breaks)
 *
 * The computed range is inclusive for pmStart and exclusive for pmEnd, matching
 * ProseMirror's position semantics.
 *
 * @example
 * ```typescript
 * const fragment: TableFragment = {
 *   kind: 'table',
 *   blockId: 'table-1',
 *   fromRow: 0,
 *   toRow: 3,
 *   x: 0,
 *   y: 0,
 *   width: 400,
 *   height: 150
 * };
 * applyTableFragmentPmRange(fragment, block, measure);
 * // fragment now has pmStart and pmEnd set based on rows 0-2 content
 * ```
 */
function applyTableFragmentPmRange(fragment: TableFragment, block: TableBlock, measure: TableMeasure): void {
  const range = computeTableFragmentPmRange(block, measure, fragment.fromRow, fragment.toRow, fragment.partialRow);
  if (range.pmStart != null) {
    fragment.pmStart = range.pmStart;
  }
  if (range.pmEnd != null) {
    fragment.pmEnd = range.pmEnd;
  }
}

/**
 * Compute partial row split information for rows that don't fit.
 *
 * When a row exceeds the available height and cantSplit is not set,
 * this function calculates where to split within the row by advancing
 * each cell independently based on its available line height.
 *
 * Algorithm:
 *
 * 1. For each cell, calculate available height for lines (subtract padding)
 * 2. Find cumulative line heights and determine initial cutoff point per cell
 * 3. Use each cell's fitted line height independently (no line-count normalization)
 * 4. Row fragment height is the max of fitted cell heights + padding
 *
 * Rationale:
 * Each cell should render as many lines as fit within the available height. Forcing
 * all cells to advance the same number of lines can prematurely truncate taller cells
 * when neighboring cells have fewer lines (e.g., one column overflows, another does not).
 * This manifests as a border drawn after the first line in the overflowing cell.
 *
 * @param rowIndex - Index of the row to split
 * @param blockRow - Table row data for accessing cell attributes (padding, etc.)
 * @param measure - Table measurements with cell line data
 * @param availableHeight - Available vertical space for the partial row
 * @param fromLineByCell - Starting line indices per cell (for continuations)
 * @returns PartialRowInfo with line cutoffs per cell, partial height, and split flags
 */
function computePartialRow(
  rowIndex: number,
  blockRow: TableRow | undefined,
  measure: TableMeasure,
  availableHeight: number,
  fromLineByCell?: number[],
  fullPageHeight?: number,
): PartialRowInfo {
  const row = measure.rows[rowIndex];
  if (!row) {
    throw new Error(`Invalid rowIndex ${rowIndex}: measure.rows has ${measure.rows.length} rows`);
  }
  const cellCount = row.cells.length;

  // Initialize fromLineByCell if not provided (first part of split)
  const startLines = fromLineByCell || new Array(cellCount).fill(0);

  const toLineByCell: number[] = [];
  const heightByCell: number[] = [];

  // Capture cell paddings to keep height math aligned with rendering
  const cellPaddings = row.cells.map((_, idx: number) => getCellPadding(idx, blockRow));

  // First pass: find cutoff for each cell based on available height
  for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
    const cell = row.cells[cellIdx];
    const startLine = startLines[cellIdx] || 0;

    // Calculate available height for lines (subtract this cell's padding)
    const cellPadding = cellPaddings[cellIdx];
    const availableForLines = Math.max(0, availableHeight - (cellPadding.top + cellPadding.bottom));

    // Get all lines from all blocks in this cell (multi-block support)
    const lines = getCellLines(cell);
    let cumulativeHeight = 0;
    let cutLine = startLine;

    for (let i = startLine; i < lines.length; i++) {
      const lineHeight = lines[i].lineHeight || 0;
      if (cumulativeHeight + lineHeight > availableForLines) {
        // Force progress: only when the segment is truly taller than a full page
        // (e.g. an embedded table that can never fit on any page). This prevents
        // infinite pagination loops. Normal lines that don't fit at the bottom of a
        // page should NOT be forced — the caller will advance to the next page.
        if (
          cumulativeHeight === 0 &&
          i === startLine &&
          availableForLines > 0 &&
          fullPageHeight != null &&
          lineHeight > fullPageHeight
        ) {
          // Cap height to available space — overflow:hidden on the cell clips the rest.
          cumulativeHeight += Math.min(lineHeight, availableForLines);
          cutLine = i + 1;
        }
        break;
      }
      cumulativeHeight += lineHeight;
      cutLine = i + 1; // Exclusive index
    }

    toLineByCell.push(cutLine);
    heightByCell.push(cumulativeHeight);
  }

  let actualPartialHeight = 0;
  let maxPaddingTotal = 0;
  for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
    const cellPadding = cellPaddings[cellIdx];
    const paddingTotal = cellPadding.top + cellPadding.bottom;
    maxPaddingTotal = Math.max(maxPaddingTotal, paddingTotal);
    actualPartialHeight = Math.max(actualPartialHeight, heightByCell[cellIdx] + paddingTotal);
  }

  // CRITICAL: Check if we made any progress (advanced any lines)
  const madeProgress = toLineByCell.some((cutLine, idx: number) => cutLine > (startLines[idx] || 0));

  const isFirstPart = startLines.every((l) => l === 0);

  // Determine if this is the last part (all cells exhausted OR no progress made)
  const allCellsExhausted = toLineByCell.every((cutLine, idx: number) => {
    const totalLines = getCellTotalLines(row.cells[idx]);
    return cutLine >= totalLines;
  });
  const isLastPart = allCellsExhausted || !madeProgress;

  // Ensure the partial height includes at least padding when we have content to render
  if (actualPartialHeight === 0 && isFirstPart) {
    actualPartialHeight = maxPaddingTotal;
  }

  return {
    rowIndex,
    fromLineByCell: startLines,
    toLineByCell,
    isFirstPart,
    isLastPart,
    partialHeight: actualPartialHeight,
  };
}

/**
 * Find the split point for table rows given available height and constraints.
 *
 * Algorithm:
 * 1. Iterate rows from startRow, accumulating heights
 * 2. Check cantSplit attribute for each row
 * 3. Return endRow (exclusive) where split should occur
 * 4. For rows that don't fit AND don't have cantSplit, split mid-row using computePartialRow()
 * 5. For over-tall rows (row > fullPageHeight), force mid-row split even with cantSplit
 *
 * MS Word Behavior:
 * - Default: Rows CAN break across pages (cantSplit = false by default)
 * - When a row doesn't fit and cantSplit is false, Word splits mid-row at line boundaries
 * - cantSplit = true prevents mid-row splitting; row moves to next page
 * - Even with cantSplit, rows taller than a full page must split
 *
 * @param block - Table block
 * @param measure - Table measurements
 * @param startRow - Starting row index (inclusive)
 * @param availableHeight - Available vertical space
 * @param fullPageHeight - Full page height (for detecting over-tall rows)
 * @param pendingPartialRow - If continuing a partial row from previous page
 * @returns Split point result with endRow and partialRow
 */
function findSplitPoint(
  block: TableBlock,
  measure: TableMeasure,
  startRow: number,
  availableHeight: number,
  fullPageHeight?: number,
  _pendingPartialRow?: PartialRowInfo | null,
): SplitPointResult {
  let accumulatedHeight = 0;
  let lastFitRow = startRow; // Last row that fit completely

  // Rowspan-aware splitting: track the farthest row reached by any active rowspan
  // and the last boundary where no rowspan crosses (a "clean" break point).
  // When the standard break point splits a rowspan group, prefer the clean break
  // to avoid continuation cells and match Word's behavior.
  let maxRowspanEnd = startRow;
  let lastCleanFitRow = startRow;

  for (let i = startRow; i < block.rows.length; i++) {
    const row = block.rows[i];
    const rowMeasure = measure.rows[i];
    const rowHeight = rowMeasure?.height || 0;
    let cantSplit = row.attrs?.tableRowProperties?.cantSplit === true;
    if (rowMeasure && hasExplicitRowHeightSlack(row, rowMeasure) && (!fullPageHeight || rowHeight <= fullPageHeight)) {
      cantSplit = true;
    }

    // Track the farthest rowspan extent from this row's cells
    if (rowMeasure) {
      for (const cellMeasure of rowMeasure.cells) {
        const rs = cellMeasure.rowSpan ?? 1;
        if (rs > 1) {
          maxRowspanEnd = Math.max(maxRowspanEnd, i + rs);
        }
      }
    }

    // Check if this row fits completely
    if (accumulatedHeight + rowHeight <= availableHeight) {
      // Row fits completely
      accumulatedHeight += rowHeight;
      lastFitRow = i + 1; // Next row index (exclusive)

      // A boundary is "clean" if no active rowspan crosses it
      if (maxRowspanEnd <= i + 1) {
        lastCleanFitRow = i + 1;
      }
    } else {
      // Row doesn't fit completely
      const remainingHeight = availableHeight - accumulatedHeight;

      // Check if this is an over-tall row (exceeds full page height) - force split regardless of cantSplit
      // This handles edge case where a row is taller than an entire page
      if (fullPageHeight && rowHeight > fullPageHeight) {
        const partialRow = computePartialRow(i, block.rows[i], measure, remainingHeight, undefined, fullPageHeight);
        return { endRow: i + 1, partialRow };
      }

      // If row has cantSplit, don't split it - break before this row
      if (cantSplit) {
        // If we haven't fit any rows yet, return startRow to trigger page advance
        if (lastFitRow === startRow) {
          return { endRow: startRow, partialRow: null };
        }
        // Prefer a clean break point that avoids splitting rowspan groups
        if (maxRowspanEnd > lastFitRow && lastCleanFitRow > startRow) {
          return { endRow: lastCleanFitRow, partialRow: null, forcePageBreak: true };
        }
        // Break before the cantSplit row
        return { endRow: lastFitRow, partialRow: null };
      }

      // Row doesn't have cantSplit - try to split mid-row (MS Word default behavior)
      // Only split if we have meaningful space (at least MIN_PARTIAL_ROW_HEIGHT for one line)
      if (remainingHeight >= MIN_PARTIAL_ROW_HEIGHT) {
        const partialRow = computePartialRow(i, block.rows[i], measure, remainingHeight, undefined, fullPageHeight);

        // Check if we can actually fit any lines
        const hasContent = partialRow.toLineByCell.some(
          (cutLine: number, idx: number) => cutLine > (partialRow.fromLineByCell[idx] || 0),
        );

        if (hasContent) {
          // We can fit some content - do mid-row split
          return { endRow: i + 1, partialRow };
        }
      }

      // Can't fit any content from this row - prefer clean break if available
      if (maxRowspanEnd > lastFitRow && lastCleanFitRow > startRow) {
        return { endRow: lastCleanFitRow, partialRow: null, forcePageBreak: true };
      }
      return { endRow: lastFitRow, partialRow: null };
    }
  }

  // All remaining rows fit
  return { endRow: block.rows.length, partialRow: null };
}

/**
 * Generate fragment metadata for a table fragment.
 *
 * Currently only includes column boundaries; row boundaries omitted to reduce DOM overhead.
 *
 * @param measure - Table measurements
 * @param fromRow - Starting row (unused but kept for future row boundaries)
 * @param toRow - Ending row (unused but kept for future row boundaries)
 * @param repeatHeaderCount - Header count (unused but kept for future metadata)
 * @returns Table fragment metadata
 */
function generateFragmentMetadata(
  measure: TableMeasure,
  _fromRow: number,
  _toRow: number,
  _repeatHeaderCount: number,
  effectiveWidths?: number[],
): TableFragmentMetadata {
  return {
    columnBoundaries: generateColumnBoundaries(measure, effectiveWidths),
    coordinateSystem: 'fragment',
  };
}

/**
 * Layout a table block with monolithic rendering (no splitting).
 *
 * Used for floating tables (tblpPr) which should not split across pages.
 *
 * @param context - Table layout context
 */
function layoutMonolithicTable(context: TableLayoutContext): void {
  let state = context.ensurePage();
  if (state.cursorY + context.measure.totalHeight > state.contentBottom && state.page.fragments.length > 0) {
    state = context.advanceColumn(state);
  }
  state = context.ensurePage();
  const height = Math.min(context.measure.totalHeight, state.contentBottom - state.cursorY);

  const baseX = context.columnX(state.columnIndex);
  const baseWidth = Math.min(context.columnWidth, context.measure.totalWidth || context.columnWidth);
  const { x, width } = resolveTableFrame(baseX, context.columnWidth, baseWidth, context.block.attrs);
  const columnWidths = rescaleColumnWidths(context.measure.columnWidths, context.measure.totalWidth, width);

  const metadata: TableFragmentMetadata = {
    columnBoundaries: generateColumnBoundaries(context.measure, columnWidths),
    coordinateSystem: 'fragment',
  };

  const fragment: TableFragment = {
    kind: 'table',
    blockId: context.block.id,
    fromRow: 0,
    toRow: context.block.rows.length,
    x,
    y: state.cursorY,
    width,
    height,
    metadata,
    columnWidths,
  };
  applyTableFragmentPmRange(fragment, context.block, context.measure);
  state.page.fragments.push(fragment);
  state.cursorY += height;
}

/**
 * Layout a table block with row-boundary and mid-row splitting.
 *
 * Implements MS Word-compatible table splitting:
 * - Breaks tables at row boundaries when exceeding page height
 * - Splits rows mid-content when cantSplit is false (default)
 * - Respects cantSplit attribute (prevents row from splitting)
 * - Repeats header rows on continuation fragments
 * - Handles floating tables (tblpPr) with monolithic layout
 * - Tracks partial row continuations across pages
 *
 * Algorithm:
 * 1. Detect floating tables → delegate to monolithic layout
 * 2. Count header rows
 * 3. Loop through rows, finding split points
 * 4. When a partial row split occurs, track it for continuation
 * 5. Create fragments with proper fromRow/toRow/repeatHeaderCount/partialRow
 * 6. Advance cursor by actual fragment height (not total table height)
 *
 * @param context - Table layout context

 */
export function layoutTableBlock({
  block,
  measure,
  columnWidth,
  ensurePage,
  advanceColumn,
  columnX,
}: TableLayoutContext): void {
  // Anchored/floating tables are normally placed by the float manager when we layout their anchor
  // paragraph. Treat full-width floating tables as inline so they flow like normal tables and
  // don't create overlap or extra pages.
  let treatAsInline = false;
  if (block.anchor?.isAnchored) {
    const totalWidth = measure.totalWidth ?? 0;
    treatAsInline = columnWidth > 0 && totalWidth >= columnWidth * ANCHORED_TABLE_FULL_WIDTH_RATIO;
    if (!treatAsInline) {
      return;
    }
  }

  // 1. Detect floating tables - use monolithic layout so the table stays one unit (no split across pages).
  // This applies even when treatAsInline (full-width anchored): we still flow the table here but render it as one fragment.
  const tableProps = block.attrs?.tableProperties as Record<string, unknown> | undefined;
  const floatingProps = tableProps?.floatingTableProperties as Record<string, unknown> | undefined;
  if (floatingProps && Object.keys(floatingProps).length > 0) {
    layoutMonolithicTable({ block, measure, columnWidth, ensurePage, advanceColumn, columnX });
    return;
  }

  // 2. Count header rows
  const headerCount = countHeaderRows(block);
  const headerHeight = headerCount > 0 ? sumRowHeights(measure.rows, 0, headerCount) : 0;

  // 3. Initialize state
  let state = ensurePage();

  // Check if we need to advance column/page before starting the table
  // If the table doesn't fit in the current position and there's already content on the page,
  // move to the next column/page to avoid starting a table that immediately needs to split
  const availableHeight = state.contentBottom - state.cursorY;

  // Table start preflight check: Decide whether to start the table on the current page
  // or advance to a new page. This prevents starting a table that immediately splits,
  // which would waste the remaining space on the current page.
  const hasPriorFragments = state.page.fragments.length > 0;
  const hasMeasuredRows = measure.rows.length > 0 && block.rows.length > 0;

  if (hasMeasuredRows && hasPriorFragments) {
    // Decision tree for tables with measured rows and existing page content:
    const firstRowCantSplit = block.rows[0]?.attrs?.tableRowProperties?.cantSplit === true;
    const firstRowHeight = measure.rows[0]?.height ?? measure.totalHeight ?? 0;
    const firstRowSlack = hasExplicitRowHeightSlack(block.rows[0], measure.rows[0]);
    const firstRowFitsPage = firstRowHeight <= state.contentBottom;
    const treatFirstRowAsCantSplit = firstRowCantSplit || (firstRowSlack && firstRowFitsPage);

    if (treatFirstRowAsCantSplit) {
      // Branch 1: cantSplit row
      // Require the entire first row to fit on the current page.
      // If it doesn't fit, advance to a new page to avoid an immediate split.
      if (firstRowHeight > availableHeight) {
        state = advanceColumn(state);
      }
    } else {
      // Branch 2: Splittable row (cantSplit = false or undefined)
      // Allow the table to start on the current page if ANY content can fit.
      // Use computePartialRow to check if at least one line can be rendered.
      const partial = computePartialRow(0, block.rows[0], measure, availableHeight);
      const madeProgress = partial.toLineByCell.some(
        (toLine: number, idx: number) => toLine > (partial.fromLineByCell[idx] || 0),
      );
      const hasRenderableHeight = partial.partialHeight > 0;

      // Advance only if we can't fit any lines at all
      if (!madeProgress || !hasRenderableHeight) {
        state = advanceColumn(state);
      }
      // Otherwise, start on current page and let normal row processing handle the split
    }
  } else if (hasPriorFragments) {
    // Fallback for cases without measured rows (e.g., empty measure.rows)
    let minRequiredHeight = 0;
    if (measure.rows.length > 0) {
      minRequiredHeight = sumRowHeights(measure.rows, 0, 1);
    } else if (measure.totalHeight > 0) {
      minRequiredHeight = measure.totalHeight;
    }

    if (minRequiredHeight > availableHeight) {
      state = advanceColumn(state);
    }
  }

  let currentRow = 0;
  let isTableContinuation = false;
  let pendingPartialRow: PartialRowInfo | null = null;

  // Handle edge case: table with no rows but non-zero totalHeight
  // This can occur in test scenarios or with placeholder tables
  if (block.rows.length === 0 && measure.totalHeight > 0) {
    const height = Math.min(measure.totalHeight, state.contentBottom - state.cursorY);

    const baseX = columnX(state.columnIndex);
    const baseWidth = Math.min(columnWidth, measure.totalWidth || columnWidth);
    const { x, width } = resolveTableFrame(baseX, columnWidth, baseWidth, block.attrs);
    const columnWidths = rescaleColumnWidths(measure.columnWidths, measure.totalWidth, width);

    const metadata: TableFragmentMetadata = {
      columnBoundaries: generateColumnBoundaries(measure, columnWidths),
      coordinateSystem: 'fragment',
    };

    const fragment: TableFragment = {
      kind: 'table',
      blockId: block.id,
      fromRow: 0,
      toRow: 0,
      x,
      y: state.cursorY,
      width,
      height,
      metadata,
      columnWidths,
    };
    applyTableFragmentPmRange(fragment, block, measure);
    state.page.fragments.push(fragment);
    state.cursorY += height;
    return;
  }

  // 4. Loop until all rows processed (including pending partial rows)
  while (currentRow < block.rows.length || pendingPartialRow !== null) {
    state = ensurePage();
    const availableHeight = state.contentBottom - state.cursorY;

    // Determine repeat header count for this fragment
    let repeatHeaderCount = 0;

    if (currentRow === 0 && !pendingPartialRow) {
      // First fragment: headers are part of body rows, don't repeat separately
      repeatHeaderCount = 0;
    } else {
      // Continuation fragment: check if headers should repeat
      if (headerCount > 0 && headerHeight <= availableHeight) {
        repeatHeaderCount = headerCount;
      } else if (headerCount > 0 && headerHeight > availableHeight) {
        // Table headers taller than page height - skip header repetition to avoid overflow
        repeatHeaderCount = 0;
      }
    }

    // If repeated headers would prevent a cantSplit row from fitting, skip header repetition.
    // Word does not split cantSplit rows just because repeated headers eat up space.
    if (repeatHeaderCount > 0 && !pendingPartialRow) {
      const bodyRow = block.rows[currentRow];
      const bodyRowHeight = measure.rows[currentRow]?.height || 0;
      const bodyCantSplit = bodyRow?.attrs?.tableRowProperties?.cantSplit === true;
      const spaceWithHeaders = availableHeight - headerHeight;
      if (bodyCantSplit && bodyRowHeight > spaceWithHeaders && bodyRowHeight <= availableHeight) {
        repeatHeaderCount = 0;
      }
    }

    // Adjust available height for header repetition
    const availableForBody = repeatHeaderCount > 0 ? availableHeight - headerHeight : availableHeight;

    // Calculate full page height (for detecting over-tall rows)
    // This is the actual usable content area height, accounting for top margin.
    // The ?? 0 handles test fixtures that may not set topMargin.
    const fullPageHeight = state.contentBottom - (state.topMargin ?? 0);

    // Handle pending partial row continuation
    if (pendingPartialRow !== null) {
      const rowIndex = pendingPartialRow.rowIndex;
      const fromLineByCell = pendingPartialRow.toLineByCell;

      const continuationPartialRow = computePartialRow(
        rowIndex,
        block.rows[rowIndex],
        measure,
        availableForBody,
        fromLineByCell,
        fullPageHeight,
      );

      const madeProgress = continuationPartialRow.toLineByCell.some(
        (toLine: number, idx: number) => toLine > (fromLineByCell[idx] || 0),
      );

      const hasRemainingLinesAfterContinuation = continuationPartialRow.toLineByCell.some(
        (toLine: number, idx: number) => {
          const totalLines = getCellTotalLines(measure.rows[rowIndex].cells[idx]);
          return toLine < totalLines;
        },
      );

      const hadRemainingLinesBefore = fromLineByCell.some((fromLine: number, idx: number) => {
        const totalLines = getCellTotalLines(measure.rows[rowIndex].cells[idx]);
        return fromLine < totalLines;
      });

      const fragmentHeight = continuationPartialRow.partialHeight + (repeatHeaderCount > 0 ? headerHeight : 0);

      // Only create a fragment if we made progress (rendered some lines)
      // Don't create empty fragments with just padding
      if (fragmentHeight > 0 && madeProgress) {
        const baseX = columnX(state.columnIndex);
        const baseWidth = Math.min(columnWidth, measure.totalWidth || columnWidth);
        const { x, width } = resolveTableFrame(baseX, columnWidth, baseWidth, block.attrs);
        const scaledWidths = rescaleColumnWidths(measure.columnWidths, measure.totalWidth, width);

        const fragment: TableFragment = {
          kind: 'table',
          blockId: block.id,
          fromRow: rowIndex,
          toRow: rowIndex + 1,
          x,
          y: state.cursorY,
          width,
          height: fragmentHeight,
          continuesFromPrev: true,
          continuesOnNext: hasRemainingLinesAfterContinuation || rowIndex + 1 < block.rows.length,
          repeatHeaderCount,
          partialRow: continuationPartialRow,
          metadata: generateFragmentMetadata(measure, rowIndex, rowIndex + 1, repeatHeaderCount, scaledWidths),
          columnWidths: scaledWidths,
        };

        applyTableFragmentPmRange(fragment, block, measure);
        state.page.fragments.push(fragment);
        state.cursorY += fragmentHeight;
      }

      const rowComplete = !hasRemainingLinesAfterContinuation;

      if (rowComplete) {
        currentRow = rowIndex + 1;
        pendingPartialRow = null;
      } else if (!madeProgress && hadRemainingLinesBefore) {
        // No progress made - need to advance to next page/column and retry
        state = advanceColumn(state);
        // Keep the same pendingPartialRow to retry on next page (no assignment needed)
      } else {
        // Made progress but row not complete - continue on SAME page
        // DO NOT call advanceColumn here! The cursor has already been advanced
        // by the fragment height above. Just update pendingPartialRow to track
        // remaining lines for the next iteration.
        pendingPartialRow = continuationPartialRow;
      }

      isTableContinuation = true;
      continue;
    }

    // Normal row processing
    const bodyStartRow = currentRow;
    const { endRow, partialRow, forcePageBreak } = findSplitPoint(
      block,
      measure,
      bodyStartRow,
      availableForBody,
      fullPageHeight,
    );

    // If no rows fit and page has content, advance
    if (endRow === bodyStartRow && partialRow === null && state.page.fragments.length > 0) {
      state = advanceColumn(state);
      continue;
    }

    // If still no rows fit after retry, force split
    // This handles edge case where row is too tall to fit on empty page
    if (endRow === bodyStartRow && partialRow === null) {
      const forcedPartialRow = computePartialRow(
        bodyStartRow,
        block.rows[bodyStartRow],
        measure,
        availableForBody,
        undefined,
        fullPageHeight,
      );
      const forcedEndRow = bodyStartRow + 1;
      const fragmentHeight = forcedPartialRow.partialHeight + (repeatHeaderCount > 0 ? headerHeight : 0);

      const baseX = columnX(state.columnIndex);
      const baseWidth = Math.min(columnWidth, measure.totalWidth || columnWidth);
      const { x, width } = resolveTableFrame(baseX, columnWidth, baseWidth, block.attrs);
      const scaledWidths = rescaleColumnWidths(measure.columnWidths, measure.totalWidth, width);

      const fragment: TableFragment = {
        kind: 'table',
        blockId: block.id,
        fromRow: bodyStartRow,
        toRow: forcedEndRow,
        x,
        y: state.cursorY,
        width,
        height: fragmentHeight,
        continuesFromPrev: isTableContinuation,
        continuesOnNext: !forcedPartialRow.isLastPart || forcedEndRow < block.rows.length,
        repeatHeaderCount,
        partialRow: forcedPartialRow,
        metadata: generateFragmentMetadata(measure, bodyStartRow, forcedEndRow, repeatHeaderCount, scaledWidths),
        columnWidths: scaledWidths,
      };

      applyTableFragmentPmRange(fragment, block, measure);
      state.page.fragments.push(fragment);
      state.cursorY += fragmentHeight;
      pendingPartialRow = forcedPartialRow;
      isTableContinuation = true;
      continue;
    }

    // Calculate fragment height
    let fragmentHeight: number;
    if (partialRow) {
      const fullRowsHeight = sumRowHeights(measure.rows, bodyStartRow, endRow - 1);
      fragmentHeight = fullRowsHeight + partialRow.partialHeight + (repeatHeaderCount > 0 ? headerHeight : 0);
    } else {
      fragmentHeight = calculateFragmentHeight(
        { fromRow: bodyStartRow, toRow: endRow, repeatHeaderCount },
        measure,
        headerCount,
      );
    }

    const baseX = columnX(state.columnIndex);
    const baseWidth = Math.min(columnWidth, measure.totalWidth || columnWidth);
    const { x, width } = resolveTableFrame(baseX, columnWidth, baseWidth, block.attrs);
    const scaledWidths = rescaleColumnWidths(measure.columnWidths, measure.totalWidth, width);

    const fragment: TableFragment = {
      kind: 'table',
      blockId: block.id,
      fromRow: bodyStartRow,
      toRow: endRow,
      x,
      y: state.cursorY,
      width,
      height: fragmentHeight,
      continuesFromPrev: isTableContinuation,
      continuesOnNext: endRow < block.rows.length || (partialRow ? !partialRow.isLastPart : false),
      repeatHeaderCount,
      partialRow: partialRow || undefined,
      metadata: generateFragmentMetadata(measure, bodyStartRow, endRow, repeatHeaderCount, scaledWidths),
      columnWidths: scaledWidths,
    };

    applyTableFragmentPmRange(fragment, block, measure);
    state.page.fragments.push(fragment);
    state.cursorY += fragmentHeight;

    // Handle partial row tracking
    if (partialRow && !partialRow.isLastPart) {
      pendingPartialRow = partialRow;
      currentRow = partialRow.rowIndex;
    } else {
      currentRow = endRow;
      pendingPartialRow = null;
    }

    isTableContinuation = true;

    // If findSplitPoint chose a clean rowspan boundary (earlier than the standard break),
    // force a page break so the remaining rows start on the next page instead of
    // continuing to fill the current page with another fragment.
    if (forcePageBreak && currentRow < block.rows.length) {
      state = advanceColumn(state);
    }
  }
}

/**
 * Create a table fragment for an anchored/floating table at its computed position.
 * Called by the layout engine after the float manager computes the table's position.
 */
export function createAnchoredTableFragment(
  block: TableBlock,
  measure: TableMeasure,
  x: number,
  y: number,
): TableFragment {
  const metadata: TableFragmentMetadata = {
    columnBoundaries: generateColumnBoundaries(measure),
    coordinateSystem: 'fragment',
  };

  const fragment: TableFragment = {
    kind: 'table',
    blockId: block.id,
    fromRow: 0,
    toRow: block.rows.length,
    x,
    y,
    width: measure.totalWidth ?? 0,
    height: measure.totalHeight ?? 0,
    metadata,
  };
  applyTableFragmentPmRange(fragment, block, measure);
  return fragment;
}
