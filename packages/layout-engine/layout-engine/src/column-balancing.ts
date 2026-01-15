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

  // Calculate total content height
  const totalHeight = ctx.contentBlocks.reduce((sum, b) => sum + b.measuredHeight, 0);

  // Early exit: content is very small, no need to balance
  if (totalHeight < config.minColumnHeight * ctx.columnCount) {
    return createSingleColumnResult(ctx);
  }

  // Initial target: evenly divide content
  let targetHeight = Math.ceil(totalHeight / ctx.columnCount);

  // Ensure target meets minimum column height
  targetHeight = Math.max(targetHeight, config.minColumnHeight);

  // Don't exceed available height
  targetHeight = Math.min(targetHeight, ctx.availableHeight);

  let bestResult: SimulationResult | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < config.maxIterations; i++) {
    const simulation = simulateBalancedLayout(ctx, targetHeight, config);

    // Calculate balance score (lower is better)
    const score = calculateBalanceScore(simulation.columnHeights, config.tolerance);

    if (score < bestScore) {
      bestScore = score;
      bestResult = simulation;
    }

    // Check if we've achieved acceptable balance
    if (isBalanced(simulation.columnHeights, config.tolerance)) {
      return {
        targetColumnHeight: targetHeight,
        columnAssignments: simulation.assignments,
        success: true,
        iterations: i + 1,
        blockBreakPoints: simulation.breakPoints.size > 0 ? simulation.breakPoints : undefined,
      };
    }

    // Adjust target based on simulation results
    targetHeight = adjustTargetHeight(simulation, targetHeight, ctx, config);
  }

  // Use best result found
  if (bestResult) {
    return {
      targetColumnHeight: targetHeight,
      columnAssignments: bestResult.assignments,
      success: false, // Didn't converge within iterations
      iterations: config.maxIterations,
      blockBreakPoints: bestResult.breakPoints.size > 0 ? bestResult.breakPoints : undefined,
    };
  }

  // Fallback: simple sequential layout
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

/**
 * Check if column heights are balanced within tolerance.
 */
function isBalanced(columnHeights: number[], tolerance: number): boolean {
  if (columnHeights.length <= 1) return true;

  const nonEmptyHeights = columnHeights.filter((h) => h > 0);
  if (nonEmptyHeights.length <= 1) return true;

  const maxHeight = Math.max(...nonEmptyHeights);
  const minHeight = Math.min(...nonEmptyHeights);

  return maxHeight - minHeight <= tolerance;
}

/**
 * Calculate a balance score (lower is better).
 * Used to track best result across iterations.
 */
function calculateBalanceScore(columnHeights: number[], tolerance: number): number {
  if (columnHeights.length <= 1) return 0;

  const nonEmptyHeights = columnHeights.filter((h) => h > 0);
  if (nonEmptyHeights.length <= 1) return 0;

  // Score based on variance from mean
  const mean = nonEmptyHeights.reduce((a, b) => a + b, 0) / nonEmptyHeights.length;
  const variance = nonEmptyHeights.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0);

  // Penalize empty columns
  const emptyPenalty = (columnHeights.length - nonEmptyHeights.length) * tolerance * 10;

  return variance + emptyPenalty;
}

/**
 * Adjust target height based on simulation results.
 */
function adjustTargetHeight(
  simulation: SimulationResult,
  currentTarget: number,
  ctx: BalancingContext,
  config: ColumnBalancingConfig,
): number {
  const heights = simulation.columnHeights;
  const maxHeight = Math.max(...heights);
  const minHeight = Math.min(...heights.filter((h) => h > 0));

  // If last column is significantly taller, increase target
  if (heights[heights.length - 1] > maxHeight * 0.9 && heights[heights.length - 1] > currentTarget) {
    return Math.min(currentTarget + (maxHeight - currentTarget) / 2, ctx.availableHeight);
  }

  // If first columns are too tall and last is too short, decrease target
  if (heights[0] > currentTarget && heights[heights.length - 1] < currentTarget * 0.5) {
    return Math.max(currentTarget - (currentTarget - minHeight) / 2, config.minColumnHeight);
  }

  // Binary search style adjustment
  const diff = maxHeight - minHeight;
  if (maxHeight > currentTarget) {
    return Math.min(currentTarget + diff / 4, ctx.availableHeight);
  } else {
    return Math.max(currentTarget - diff / 4, config.minColumnHeight);
  }
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
interface BalancingFragment {
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
interface MeasureData {
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
  for (const [, rowFragments] of sortedRows) {
    const maxHeight = Math.max(...rowFragments.map((f) => f.height));
    totalHeight += maxHeight;
  }

  // Calculate target height per column for balanced distribution
  const targetHeight = totalHeight / columns.count;

  // Skip balancing if target height is below minimum threshold
  if (targetHeight < DEFAULT_BALANCING_CONFIG.minColumnHeight) {
    return;
  }

  // Distribute rows across columns using greedy algorithm.
  // Each row is assigned to the current column until adding it would
  // reach or exceed the target height, then we advance to the next column.
  let currentColumn = 0;
  let currentColumnHeight = 0;
  let currentY = topMargin;

  for (const [, rowFragments] of sortedRows) {
    const rowHeight = Math.max(...rowFragments.map((f) => f.height));

    // Advance to next column when current column reaches target height.
    // Uses >= to match Word's behavior: switch when target is reached, not just exceeded.
    // This ensures balanced distribution where the first column doesn't exceed its share.
    if (
      currentColumnHeight > 0 &&
      currentColumnHeight + rowHeight >= targetHeight &&
      currentColumn < columns.count - 1
    ) {
      currentColumn++;
      currentColumnHeight = 0;
      currentY = topMargin;
    }

    // Position all fragments in this row within the current column
    const colX = columnX(currentColumn);
    for (const info of rowFragments) {
      info.fragment.x = colX;
      info.fragment.y = currentY;
      info.fragment.width = columns.width;
    }

    currentColumnHeight += rowHeight;
    currentY += rowHeight;
  }
}
