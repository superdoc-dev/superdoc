/**
 * Column Balancing Module
 *
 * Implements Word-compatible column balancing for section boundaries.
 * Column balancing distributes content evenly across columns at section end,
 * matching Microsoft Word's behavior.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Configuration for column balancing behavior.
 */
export interface ColumnBalancingConfig {
  /** Whether column balancing is enabled */
  enabled: boolean;
  /** Acceptable height difference between columns in pixels */
  tolerance: number;
  /** Maximum iterations to prevent infinite loops */
  maxIterations: number;
  /** Minimum content height per column in pixels */
  minColumnHeight: number;
}

/**
 * Default configuration for column balancing.
 * These values are tuned to match Word's behavior.
 */
export const DEFAULT_BALANCING_CONFIG: ColumnBalancingConfig = {
  enabled: true,
  tolerance: 5, // 5px tolerance for height differences
  maxIterations: 10, // Max 10 iterations to find balance
  minColumnHeight: 20, // Minimum 20px content per column
};

/**
 * Context for a column balancing operation.
 * Contains all information needed to calculate balanced layout.
 */
export interface BalancingContext {
  /** Number of columns to balance across */
  columnCount: number;
  /** Width of each column in pixels */
  columnWidth: number;
  /** Gap between columns in pixels */
  columnGap: number;
  /** Available height from current position to content bottom */
  availableHeight: number;
  /** Content blocks to distribute across columns */
  contentBlocks: BalancingBlock[];
}

/**
 * A content block for balancing calculations.
 * Contains height and constraint information.
 */
export interface BalancingBlock {
  /** Unique identifier for the block */
  blockId: string;
  /** Measured height of the block in pixels */
  measuredHeight: number;
  /** Whether this block can be split across columns */
  canBreak: boolean;
  /** Whether this block must stay with the next block */
  keepWithNext: boolean;
  /** Whether this block must stay together (not split) */
  keepTogether: boolean;
  /** Minimum lines at start of column (orphan control) */
  orphanLines?: number;
  /** Minimum lines at end of column (widow control) */
  widowLines?: number;
  /** Individual line heights for paragraph blocks (for line-level breaking) */
  lineHeights?: number[];
}

/**
 * Result of a column balancing calculation.
 */
export interface BalancingResult {
  /** Target height for each column */
  targetColumnHeight: number;
  /** Map of block ID to assigned column index */
  columnAssignments: Map<string, number>;
  /** Whether balancing converged successfully */
  success: boolean;
  /** Number of iterations used */
  iterations: number;
  /** Optional break points within blocks (for paragraph splitting) */
  blockBreakPoints?: Map<string, BlockBreakPoint>;
}

/**
 * Break point information for splitting a block across columns.
 */
export interface BlockBreakPoint {
  /** Block ID this break point applies to */
  blockId: string;
  /** Line index after which to break (for paragraphs) */
  breakAfterLine: number;
  /** Height of content before the break */
  heightBeforeBreak: number;
  /** Height of content after the break */
  heightAfterBreak: number;
}

/**
 * Internal result from simulating a balanced layout.
 */
interface SimulationResult {
  /** Map of block ID to column index */
  assignments: Map<string, number>;
  /** Height of content in each column */
  columnHeights: number[];
  /** Whether any column overflowed */
  hasOverflow: boolean;
  /** Break points for split blocks */
  breakPoints: Map<string, BlockBreakPoint>;
}

// ============================================================================
// Core Balancing Algorithm
// ============================================================================

/**
 * Calculate optimal column height for balanced layout.
 *
 * Algorithm:
 * 1. Sum total content height
 * 2. Calculate initial target = total / columnCount
 * 3. Simulate layout with target height
 * 4. Adjust if columns overflow/underflow
 * 5. Iterate until balanced or max iterations reached
 *
 * @param ctx - Balancing context with column config and content blocks
 * @param config - Balancing configuration
 * @returns Balancing result with column assignments
 */
export function calculateBalancedColumnHeight(
  ctx: BalancingContext,
  config: ColumnBalancingConfig = DEFAULT_BALANCING_CONFIG,
): BalancingResult {
  // Early exit: single column doesn't need balancing
  if (ctx.columnCount <= 1) {
    return createSingleColumnResult(ctx);
  }

  // Early exit: no content to balance
  if (ctx.contentBlocks.length === 0) {
    return {
      targetColumnHeight: 0,
      columnAssignments: new Map(),
      success: true,
      iterations: 0,
    };
  }

  // Calculate total content height and block-height extremes
  const totalHeight = ctx.contentBlocks.reduce((sum, b) => sum + b.measuredHeight, 0);
  const maxBlockHeight = ctx.contentBlocks.reduce((m, b) => Math.max(m, b.measuredHeight), 0);

  // Early exit: content is very small, no need to balance
  if (totalHeight < config.minColumnHeight * ctx.columnCount) {
    return createSingleColumnResult(ctx);
  }

  // Binary-search for the minimum column height H such that a greedy
  // left-to-right fill places every block with every column ≤ H. This matches
  // Word's observed behavior: left columns are filled as tightly as possible
  // against the minimum viable height, leaving the last column shorter when
  // content doesn't divide evenly (e.g. 7 blocks across 3 columns → 3+3+1,
  // not 2+2+3). Both splits have the same max column height, but Word prefers
  // left-heavy packing for visual rhythm.
  let lo = Math.max(maxBlockHeight, config.minColumnHeight);
  let hi = Math.min(totalHeight, ctx.availableHeight);
  if (lo > hi) lo = hi;

  let bestResult: SimulationResult | null = null;
  let bestH = hi;
  let iterations = 0;

  while (lo <= hi) {
    iterations++;
    const mid = Math.floor((lo + hi) / 2);
    const sim = simulateBalancedLayout(ctx, mid, config);
    const maxCol = Math.max(...sim.columnHeights);
    const placed = sim.assignments.size === ctx.contentBlocks.length;
    if (placed && maxCol <= mid) {
      bestResult = sim;
      bestH = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
    if (iterations >= config.maxIterations) break;
  }

  if (bestResult) {
    return {
      targetColumnHeight: bestH,
      columnAssignments: bestResult.assignments,
      success: true,
      iterations,
      blockBreakPoints: bestResult.breakPoints.size > 0 ? bestResult.breakPoints : undefined,
    };
  }

  // Fallback: simple sequential layout if binary search never found a valid H
  // (e.g. availableHeight too small to fit content).
  return createSequentialResult(ctx);
}

/**
 * Simulate layout with given target column height.
 * Does NOT mutate actual layout state.
 */
function simulateBalancedLayout(
  ctx: BalancingContext,
  targetHeight: number,
  config: ColumnBalancingConfig,
): SimulationResult {
  const assignments = new Map<string, number>();
  const breakPoints = new Map<string, BlockBreakPoint>();
  const columnHeights: number[] = new Array(ctx.columnCount).fill(0);

  let currentColumn = 0;

  for (let i = 0; i < ctx.contentBlocks.length; i++) {
    const block = ctx.contentBlocks[i];
    const nextBlock = ctx.contentBlocks[i + 1];

    // Check if block fits in current column
    const wouldExceed = columnHeights[currentColumn] + block.measuredHeight > targetHeight;

    if (wouldExceed && currentColumn < ctx.columnCount - 1) {
      // Check keep-with-next constraint
      if (block.keepWithNext && nextBlock) {
        // This block must stay with next, check if both fit
        const combinedHeight = block.measuredHeight + nextBlock.measuredHeight;
        if (columnHeights[currentColumn] + combinedHeight <= targetHeight) {
          // Both fit, keep in current column
          assignments.set(block.blockId, currentColumn);
          columnHeights[currentColumn] += block.measuredHeight;
          continue;
        }
      }

      // Check if we can break this block (paragraph with multiple lines)
      if (block.canBreak && block.lineHeights && block.lineHeights.length > 1) {
        const breakPoint = calculateParagraphBreakPoint(
          block,
          targetHeight - columnHeights[currentColumn],
          block.orphanLines ?? 1,
          block.widowLines ?? 1,
        );

        if (breakPoint.canBreak && breakPoint.breakAfterLine >= 0) {
          // Split the block
          const heightBefore = block.lineHeights.slice(0, breakPoint.breakAfterLine + 1).reduce((sum, h) => sum + h, 0);
          const heightAfter = block.measuredHeight - heightBefore;

          breakPoints.set(block.blockId, {
            blockId: block.blockId,
            breakAfterLine: breakPoint.breakAfterLine,
            heightBeforeBreak: heightBefore,
            heightAfterBreak: heightAfter,
          });

          // First part stays in current column
          assignments.set(block.blockId, currentColumn);
          columnHeights[currentColumn] += heightBefore;

          // Move to next column for remaining content
          currentColumn++;
          columnHeights[currentColumn] += heightAfter;
          continue;
        }
      }

      // Move to next column
      currentColumn++;
    }

    // Assign block to current column
    assignments.set(block.blockId, currentColumn);
    columnHeights[currentColumn] += block.measuredHeight;
  }

  return {
    assignments,
    columnHeights,
    hasOverflow: columnHeights.some((h) => h > ctx.availableHeight),
    breakPoints,
  };
}

/**
 * Calculate where to break a paragraph for column balancing.
 * Respects orphan/widow constraints.
 */
function calculateParagraphBreakPoint(
  block: BalancingBlock,
  availableHeight: number,
  orphanLines: number,
  widowLines: number,
): { breakAfterLine: number; canBreak: boolean } {
  if (!block.lineHeights || block.lineHeights.length === 0) {
    return { breakAfterLine: -1, canBreak: false };
  }

  const lines = block.lineHeights;
  let heightSoFar = 0;

  for (let i = 0; i < lines.length; i++) {
    heightSoFar += lines[i];

    if (heightSoFar > availableHeight) {
      // Found break point, check constraints
      const linesBeforeBreak = i;
      const linesAfterBreak = lines.length - i;

      // Check orphan constraint (min lines at top of next column)
      if (linesAfterBreak < widowLines) {
        // Not enough lines for next column, try earlier break
        const adjustedBreak = Math.max(0, i - (widowLines - linesAfterBreak));
        if (adjustedBreak < orphanLines) {
          // Can't satisfy both constraints, don't break
          return { breakAfterLine: -1, canBreak: false };
        }
        return { breakAfterLine: adjustedBreak - 1, canBreak: true };
      }

      // Check orphan constraint (min lines in current column)
      if (linesBeforeBreak < orphanLines) {
        // Not enough lines in current column, don't break
        return { breakAfterLine: -1, canBreak: false };
      }

      return { breakAfterLine: i - 1, canBreak: true };
    }
  }

  // All content fits, no break needed
  return { breakAfterLine: lines.length - 1, canBreak: true };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create result for single-column layout (no balancing needed).
 */
function createSingleColumnResult(ctx: BalancingContext): BalancingResult {
  const assignments = new Map<string, number>();
  for (const block of ctx.contentBlocks) {
    assignments.set(block.blockId, 0);
  }
  return {
    targetColumnHeight: ctx.availableHeight,
    columnAssignments: assignments,
    success: true,
    iterations: 0,
  };
}

/**
 * Create result for sequential (non-balanced) layout.
 * Used as fallback when balancing fails.
 */
function createSequentialResult(ctx: BalancingContext): BalancingResult {
  const assignments = new Map<string, number>();
  const columnHeights: number[] = new Array(ctx.columnCount).fill(0);
  let currentColumn = 0;

  for (const block of ctx.contentBlocks) {
    // Fill columns sequentially
    if (
      columnHeights[currentColumn] + block.measuredHeight > ctx.availableHeight &&
      currentColumn < ctx.columnCount - 1
    ) {
      currentColumn++;
    }
    assignments.set(block.blockId, currentColumn);
    columnHeights[currentColumn] += block.measuredHeight;
  }

  return {
    targetColumnHeight: Math.max(...columnHeights),
    columnAssignments: assignments,
    success: false,
    iterations: 0,
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Check if column balancing should be triggered for a section.
 *
 * Balancing is triggered when:
 * 1. Section type is 'continuous' (mid-page section break)
 * 2. Section has explicit balanceColumns flag set to true
 * 3. This is the last section in the document (end of document)
 *
 * @param sectionType - Type of section break
 * @param balanceColumns - Explicit balance flag from section properties
 * @param isLastSection - Whether this is the document's final section
 * @returns Whether column balancing should be performed
 */
export function shouldBalanceColumns(
  sectionType: 'continuous' | 'nextPage' | 'evenPage' | 'oddPage' | undefined,
  balanceColumns: boolean | undefined,
  isLastSection: boolean,
): boolean {
  // Explicit flag takes precedence
  if (balanceColumns === true) return true;
  if (balanceColumns === false) return false;

  // Default behavior: balance for continuous sections and end of document
  return sectionType === 'continuous' || isLastSection;
}

/**
 * Determine if content should skip balancing (optimization).
 *
 * Skip balancing when:
 * 1. Balancing is disabled
 * 2. Single column (nothing to balance across)
 * 3. No content blocks
 * 4. Single unbreakable block that can't be split
 * 5. Total content fits in a single column (no overflow = no need to balance)
 * 6. Total content is less than minimum column height
 *
 * Word only balances columns when content would overflow a single column.
 * If all content fits comfortably in column 0, there's no redistribution.
 *
 * @param ctx - Balancing context
 * @param config - Balancing configuration
 * @returns Whether to skip balancing
 */
export function shouldSkipBalancing(
  ctx: BalancingContext,
  config: ColumnBalancingConfig = DEFAULT_BALANCING_CONFIG,
): boolean {
  // Skip if disabled
  if (!config.enabled) return true;

  // Skip for single column
  if (ctx.columnCount <= 1) return true;

  // Skip if no content
  if (ctx.contentBlocks.length === 0) return true;

  // For single block, only skip if it can't be split across columns
  // A single long paragraph CAN be split, so we should try to balance it
  if (ctx.contentBlocks.length === 1) {
    const block = ctx.contentBlocks[0];
    // Skip if block is unbreakable - can't distribute a single atomic block
    // (whether small or large, it will stay in column 0)
    if (!block.canBreak) {
      return true;
    }
  }

  // Calculate total height
  const totalHeight = ctx.contentBlocks.reduce((sum, b) => sum + b.measuredHeight, 0);

  // Skip if content is smaller than minimum column height
  // (content is too small to meaningfully distribute)
  if (totalHeight < config.minColumnHeight) return true;

  // Skip if balanced height per column would be too small
  // This prevents distributing tiny content across many columns
  const targetHeightPerColumn = totalHeight / ctx.columnCount;
  if (targetHeightPerColumn < config.minColumnHeight) return true;

  return false;
}

// ============================================================================
// Post-Layout Column Balancing
// ============================================================================

/**
 * Fragment with required properties for column balancing.
 * Represents a positioned content block that can be redistributed across columns.
 */
export interface BalancingFragment {
  /** Horizontal position in pixels from left edge of page */
  x: number;
  /** Vertical position in pixels from top edge of page */
  y: number;
  /** Width of the fragment in pixels (updated during balancing to match column width) */
  width: number;
  /** Type of content: 'para', 'image', 'drawing', 'table', etc. */
  kind: string;
  /** Unique identifier linking fragment to its source block */
  blockId: string;
  /** Starting line index for partial paragraph fragments */
  fromLine?: number;
  /** Ending line index (exclusive) for partial paragraph fragments */
  toLine?: number;
  /** Pre-computed height for non-paragraph fragments */
  height?: number;
}

/**
 * Measure data used to calculate fragment heights.
 * Contains layout measurements from the measuring phase.
 */
export interface MeasureData {
  /** Type of measure: 'paragraph', 'image', etc. */
  kind: string;
  /** Line measurements for paragraph content */
  lines?: Array<{ lineHeight: number }>;
  /** Total height for non-paragraph content */
  height?: number;
}

/**
 * Internal structure tracking fragment info during balancing.
 */
interface FragmentInfo {
  /** Reference to the original fragment (mutated during balancing) */
  fragment: BalancingFragment;
  /** Computed height of this fragment */
  height: number;
  /** Original array index for debugging */
  originalIndex: number;
}

/**
 * Calculates the height of a fragment using measure data.
 *
 * For paragraph fragments, sums line heights from the measure data.
 * For images, drawings, and tables, uses the pre-computed height.
 *
 * @param fragment - The fragment to calculate height for
 * @param measureMap - Map of block IDs to their measure data
 * @returns Height in pixels, or 0 if height cannot be determined
 */
function getFragmentHeight(fragment: BalancingFragment, measureMap: Map<string, MeasureData>): number {
  if (fragment.kind === 'para') {
    const measure = measureMap.get(fragment.blockId);
    if (!measure || measure.kind !== 'paragraph' || !measure.lines) {
      return 0;
    }
    // Sum line heights for the fragment's line range
    let sum = 0;
    const fromLine = fragment.fromLine ?? 0;
    const toLine = fragment.toLine ?? measure.lines.length;
    for (let i = fromLine; i < toLine; i++) {
      sum += measure.lines[i]?.lineHeight ?? 0;
    }
    return sum;
  }

  // For non-paragraph content, use explicit height or measure height
  if (fragment.kind === 'image' || fragment.kind === 'drawing' || fragment.kind === 'table') {
    if (typeof fragment.height === 'number') {
      return fragment.height;
    }
    const measure = measureMap.get(fragment.blockId);
    if (measure && typeof measure.height === 'number') {
      return measure.height;
    }
  }

  return 0;
}

/**
 * Balances column content on a page by redistributing fragments.
 *
 * This function post-processes a page's fragments to achieve balanced column heights,
 * matching Microsoft Word's column balancing behavior. It:
 *
 * 1. Groups fragments into logical rows by Y position
 * 2. Calculates total content height and target height per column
 * 3. Redistributes rows across columns using a greedy algorithm
 * 4. Updates fragment x, y, and width properties in place
 *
 * The algorithm switches to the next column when adding a row would reach or exceed
 * the target height (using >= comparison to match Word's behavior).
 *
 * @param fragments - Page fragments to balance (mutated in place)
 * @param columns - Column configuration with count, gap between columns, and column width
 * @param margins - Page margins (left margin determines column 0 start position)
 * @param topMargin - Top margin where content starts vertically
 * @param measureMap - Map of block IDs to measure data for height calculation
 *
 * @example
 * ```typescript
 * balancePageColumns(
 *   page.fragments,
 *   { count: 2, gap: 48, width: 288 },
 *   { left: 96 },
 *   96,
 *   measureMap
 * );
 * // Fragments are now redistributed: first half at x=96, second half at x=432
 * ```
 */
export function balancePageColumns(
  fragments: BalancingFragment[],
  columns: { count: number; gap: number; width: number },
  margins: { left: number },
  topMargin: number,
  availableHeight: number,
  measureMap: Map<string, MeasureData>,
): void {
  // Skip balancing for single-column layouts or empty pages
  if (columns.count <= 1 || fragments.length === 0) {
    return;
  }

  /**
   * Calculates the X position for a given column index.
   * Column 0 starts at the left margin, subsequent columns offset by (width + gap).
   */
  const columnX = (columnIndex: number): number => {
    return margins.left + columnIndex * (columns.width + columns.gap);
  };

  // Group fragments by Y position into logical rows.
  // Fragments at the same Y coordinate are part of the same row and move together.
  const rowMap = new Map<number, FragmentInfo[]>();
  fragments.forEach((fragment, idx) => {
    // Round Y to handle floating point precision
    const y = Math.round(fragment.y);
    if (!rowMap.has(y)) {
      rowMap.set(y, []);
    }
    const height = getFragmentHeight(fragment, measureMap);
    rowMap.get(y)!.push({
      fragment,
      height,
      originalIndex: idx,
    });
  });

  // Sort rows by Y position (top to bottom)
  const sortedRows = [...rowMap.entries()].sort((a, b) => a[0] - b[0]);

  // Calculate total content height by summing max height of each row
  let totalHeight = 0;
  const contentBlocks: BalancingBlock[] = [];
  for (const [, rowFragments] of sortedRows) {
    const maxHeight = Math.max(...rowFragments.map((f) => f.height));
    totalHeight += maxHeight;
    contentBlocks.push({
      blockId: rowFragments[0]?.fragment.blockId ?? `row-${contentBlocks.length}`,
      measuredHeight: maxHeight,
      canBreak: false,
      keepWithNext: false,
      keepTogether: true,
    });
  }

  if (
    shouldSkipBalancing({
      columnCount: columns.count,
      columnWidth: columns.width,
      columnGap: columns.gap,
      availableHeight,
      contentBlocks,
    })
  ) {
    return;
  }

  // Skip balancing if balanced height per column would be below minimum threshold
  if (totalHeight / columns.count < DEFAULT_BALANCING_CONFIG.minColumnHeight) {
    return;
  }

  // Delegate to the binary-search algorithm to find the minimum section height
  // where all content fits across N columns. This matches Word's behavior: Word
  // finds the smallest max-column-height that keeps content within constraints,
  // rather than greedily splitting at total/N (which can leave col1 barely
  // populated when one paragraph is much taller than the rest).
  const result = calculateBalancedColumnHeight(
    {
      columnCount: columns.count,
      columnWidth: columns.width,
      columnGap: columns.gap,
      availableHeight,
      contentBlocks,
    },
    DEFAULT_BALANCING_CONFIG,
  );

  // Apply the assignments to fragments: pack each column top-to-bottom from topMargin,
  // indexing back into sortedRows via the same ordering used to build contentBlocks.
  const colCursors = new Array<number>(columns.count).fill(topMargin);
  for (let i = 0; i < sortedRows.length; i++) {
    const [, rowFragments] = sortedRows[i];
    const block = contentBlocks[i];
    const col = result.columnAssignments.get(block.blockId) ?? 0;
    const colX = columnX(col);
    const rowHeight = block.measuredHeight;
    for (const info of rowFragments) {
      info.fragment.x = colX;
      info.fragment.y = colCursors[col];
      info.fragment.width = columns.width;
    }
    colCursors[col] += rowHeight;
  }
}

// ============================================================================
// Section-scoped balancing (wraps balancePageColumns with per-section guards)
// ============================================================================

/**
 * Column layout properties relevant to balancing decisions.
 * Mirrors the subset of ColumnLayout that this module reads.
 */
export interface SectionColumnLayout {
  count: number;
  gap: number;
  width?: number;
  widths?: number[];
  equalWidth?: boolean;
}

export interface BalanceSectionOnPageArgs {
  /** All fragments on the target page. Only those belonging to sectionIndex are balanced (mutated in place). */
  fragments: BalancingFragment[];
  /** Section whose content ends on this page. */
  sectionIndex: number;
  /** Column layout of the ending section. */
  sectionColumns: SectionColumnLayout;
  /** True if the section contains an explicit <w:br w:type="column"/> — skip balancing to preserve author intent. */
  sectionHasExplicitColumnBreak: boolean;
  /** blockId -> sectionIndex map (built once per layout, shared across calls). */
  blockSectionMap: Map<string, number>;
  /** Left page margin, used to compute column X positions. */
  margins: { left: number };
  /** Y position where the section's region begins on this page. */
  topMargin: number;
  /** Column width — passed to balancePageColumns so it can resize fragments. */
  columnWidth: number;
  /** Available height from topMargin to content bottom. */
  availableHeight: number;
  /** Measurement data for fragments (built from measures array). */
  measureMap: Map<string, MeasureData>;
}

/**
 * Balance the fragments of one section on one page.
 *
 * Returns the tallest balanced column's bottom Y, or null if balancing was skipped.
 * Callers can use the returned Y to update paginator cursors so subsequent content
 * starts just below the balanced section rather than below an unbalanced maxCursorY.
 *
 * Guards (skip balancing when):
 *   - Section has <= 1 column (nothing to balance)
 *   - Section contains an explicit column break (author intent wins)
 *   - Section uses unequal column widths (Word doesn't rebalance these)
 *   - No fragments on this page belong to the section
 */
export function balanceSectionOnPage(args: BalanceSectionOnPageArgs): { maxY: number } | null {
  const { sectionColumns, sectionHasExplicitColumnBreak, sectionIndex, blockSectionMap, fragments } = args;

  if (sectionColumns.count <= 1) return null;
  if (sectionHasExplicitColumnBreak) return null;
  if (sectionColumns.equalWidth === false && Array.isArray(sectionColumns.widths) && sectionColumns.widths.length > 0) {
    return null;
  }

  // Filter to fragments of the target section on this page.
  const sectionFragments = fragments.filter((f) => blockSectionMap.get(f.blockId) === sectionIndex);
  if (sectionFragments.length === 0) return null;

  const columnCount = sectionColumns.count;
  const columnGap = sectionColumns.gap;
  const columnWidth = sectionColumns.width ?? 0;
  if (columnWidth <= 0) return null;

  // Use the minimum Y of the section's fragments as the balancing origin — the
  // section may start mid-page (e.g. section 0 is single-column and section 1
  // continues below it). Using topMargin unconditionally would stack balanced
  // columns on top of earlier single-column content on the same page.
  let sectionTopY = Number.POSITIVE_INFINITY;
  for (const f of sectionFragments) {
    if (f.y < sectionTopY) sectionTopY = f.y;
  }
  if (!Number.isFinite(sectionTopY)) sectionTopY = args.topMargin;

  // Remaining height from the section's actual top to the page content bottom.
  const remainingHeight = args.availableHeight - (sectionTopY - args.topMargin);
  if (remainingHeight <= 0) return null;

  // Order fragments in document order: by current column (x → left-to-right),
  // then by y within each column. During unbalanced layout the paginator fills
  // column 0 top-to-bottom, then column 1, etc. — so (x, y) preserves the
  // original sequence.
  const ordered = [...sectionFragments].sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  // Treat each fragment as its own block for binary-search balancing. Grouping
  // by y (as balancePageColumns does) would collapse fragments from different
  // source columns that happen to share a y coordinate into a single row and
  // re-stack them at one position — producing overlap.
  const contentBlocks: BalancingBlock[] = ordered.map((f, i) => ({
    blockId: `${f.blockId}#${i}`,
    measuredHeight: getFragmentHeight(f, args.measureMap),
    canBreak: false,
    keepWithNext: false,
    keepTogether: true,
  }));

  if (
    shouldSkipBalancing({
      columnCount,
      columnWidth,
      columnGap,
      availableHeight: remainingHeight,
      contentBlocks,
    })
  ) {
    return null;
  }

  const result = calculateBalancedColumnHeight(
    { columnCount, columnWidth, columnGap, availableHeight: remainingHeight, contentBlocks },
    DEFAULT_BALANCING_CONFIG,
  );

  const columnX = (columnIndex: number): number => args.margins.left + columnIndex * (columnWidth + columnGap);

  const colCursors = new Array<number>(columnCount).fill(sectionTopY);
  let maxY = sectionTopY;
  for (let i = 0; i < ordered.length; i++) {
    const f = ordered[i];
    const block = contentBlocks[i];
    const col = result.columnAssignments.get(block.blockId) ?? 0;
    f.x = columnX(col);
    f.y = colCursors[col];
    f.width = columnWidth;
    colCursors[col] += block.measuredHeight;
    if (colCursors[col] > maxY) maxY = colCursors[col];
  }
  return { maxY };
}
