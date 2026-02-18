import type {
  FlowBlock,
  Layout,
  Measure,
  Fragment,
  DrawingFragment,
  ImageFragment,
  Run,
  Line,
  TableFragment,
  TableBlock,
  TableMeasure,
  ParagraphBlock,
  ParagraphMeasure,
} from '@superdoc/contracts';
import { computeLinePmRange as computeLinePmRangeUnified } from '@superdoc/contracts';
import { charOffsetToPm, findCharacterAtX, measureCharacterX } from './text-measurement.js';
import { clickToPositionDom, findPageElement } from './dom-mapping.js';
import {
  isListItem,
  getWordLayoutConfig,
  calculateTextStartIndent,
  extractParagraphIndent,
} from './list-indent-utils.js';

export type { HeaderFooterType } from '@superdoc/contracts';
export {
  extractIdentifierFromConverter,
  getHeaderFooterType,
  defaultHeaderFooterIdentifier,
  resolveHeaderFooterForPage,
  // Multi-section header/footer support
  buildMultiSectionIdentifier,
  defaultMultiSectionIdentifier,
  getHeaderFooterTypeForSection,
  getHeaderFooterIdForPage,
  resolveHeaderFooterForPageAndSection,
} from './headerFooterUtils';
export type {
  HeaderFooterIdentifier,
  MultiSectionHeaderFooterIdentifier,
  SectionHeaderFooterIds,
} from './headerFooterUtils';
export {
  layoutHeaderFooterWithCache,
  type HeaderFooterBatchResult,
  getBucketForPageNumber,
  getBucketRepresentative,
} from './layoutHeaderFooter';
export type { HeaderFooterBatch, DigitBucket } from './layoutHeaderFooter';
export { findWordBoundaries, findParagraphBoundaries } from './text-boundaries';
export type { BoundaryRange } from './text-boundaries';
export { incrementalLayout, measureCache } from './incrementalLayout';
export type { HeaderFooterLayoutResult, IncrementalLayoutResult } from './incrementalLayout';
// Re-export computeDisplayPageNumber from layout-engine for section-aware page numbering
export { computeDisplayPageNumber, type DisplayPageInfo } from '@superdoc/layout-engine';
export { remeasureParagraph } from './remeasure';
export { measureCharacterX } from './text-measurement';
export { clickToPositionDom, findPageElement } from './dom-mapping';
export { isListItem, getWordLayoutConfig, calculateTextStartIndent, extractParagraphIndent } from './list-indent-utils';
export type { TextIndentCalculationParams } from './list-indent-utils';
export { LayoutVersionManager } from './layout-version-manager';
export type { VersionedLayoutState, LayoutVersionMetrics } from './layout-version-manager';
export { LayoutVersionLogger } from './instrumentation';

// Font Metrics Cache
export { FontMetricsCache } from './font-metrics-cache';
export type { FontMetrics, FontMetricsCacheConfig } from './font-metrics-cache';

// Paragraph Line Cache
export { ParagraphLineCache } from './paragraph-line-cache';
export type { LineInfo, ParagraphLines } from './paragraph-line-cache';

// Cursor Renderer
export { CursorRenderer } from './cursor-renderer';
export type { CursorRendererOptions, CursorRect } from './cursor-renderer';

// Local Paragraph Layout
export { LocalParagraphLayout } from './local-paragraph-layout';
export type { LocalLayoutResult, TextRun } from './local-paragraph-layout';

// PM DOM Fallback
export { PmDomFallback } from './pm-dom-fallback';
export type { PageTransform, PmEditorView } from './pm-dom-fallback';

// Page Geometry Helper
export { PageGeometryHelper } from './page-geometry-helper';
export type { PageGeometryConfig } from './page-geometry-helper';

// Layout Scheduler
export { LayoutScheduler, Priority } from './layout-scheduler';
export type { LayoutRequest, ScheduledTask, TaskStatus, QueueStats } from './layout-scheduler';

// Layout Coordinator
export { LayoutCoordinator } from './layout-coordinator';
export type { LayoutResult, P0Executor, P1Executor, WorkerExecutor, LayoutCoordinatorDeps } from './layout-coordinator';

// Layout Worker Manager
export { LayoutWorkerManager } from './layout-worker';
export type { SerializedDoc, Range, WorkerMessage, WorkerResult, WorkerLayoutResult } from './layout-worker';

// DOM Reconciler
export { DomReconciler } from './dom-reconciler';
export type { ReconciliationResult } from './dom-reconciler';

// Layout Pipeline
export { LayoutPipeline } from './layout-pipeline';
export type { Transaction, LayoutPipelineConfig } from './layout-pipeline';

// Dirty Tracker
export { DirtyTracker } from './dirty-tracker';
export type { DirtyRange } from './dirty-tracker';

// Debounced Pass Manager
export { DebouncedPassManager } from './debounced-passes';
export type { DebouncedPass } from './debounced-passes';

// PM Position Validator
export { PmPositionValidator } from './pm-position-validator';
export type { ValidationResult, ValidationError } from './pm-position-validator';

// IME Handler
export { ImeHandler } from './ime-handler';
export type { ImeState } from './ime-handler';

// Table Handler
export { TableHandler } from './table-handler';
export type { TableLayoutState } from './table-handler';

// Track Changes Handler
export { TrackChangesHandler } from './track-changes-handler';
export type { TrackChangeSpan } from './track-changes-handler';

// Cache Warmer
export { CacheWarmer } from './cache-warmer';
export type { WarmingConfig, ParagraphWarmInfo } from './cache-warmer';

// Performance Metrics
export { PerformanceMetricsCollector, perfMetrics } from './performance-metrics';
export type { MetricSample, MetricSummary, TypingPerfMetrics, BudgetViolation } from './performance-metrics';

// Safety Net
export { SafetyNet } from './safety-net';
export type { FallbackReason, SafetyConfig } from './safety-net';

// Focus Watchdog
export { FocusWatchdog } from './focus-watchdog';
export type { FocusWatchdogConfig } from './focus-watchdog';

// Benchmarks
export { TypingPerfBenchmark } from './benchmarks';
export type { BenchmarkResult, BenchmarkScenario } from './benchmarks';

// Paragraph Hash Utilities
export {
  hashParagraphBorder,
  hashParagraphBorders,
  hashParagraphAttrs,
  hashBorderSpec,
  hashTableBorderValue,
  hashTableBorders,
  hashCellBorders,
  hasStringProp,
  hasNumberProp,
  hasBooleanProp,
  getRunStringProp,
  getRunNumberProp,
  getRunBooleanProp,
} from './paragraph-hash-utils';

export type Point = { x: number; y: number };
export type PageHit = { pageIndex: number; page: Layout['pages'][number] };
export type FragmentHit = {
  fragment: Fragment;
  block: FlowBlock;
  measure: Measure;
  pageIndex: number;
  pageY: number;
};

export type PositionHit = {
  pos: number;
  layoutEpoch: number;
  blockId: string;
  pageIndex: number;
  column: number;
  lineIndex: number;
};

export type Rect = { x: number; y: number; width: number; height: number; pageIndex: number };

/**
 * Result of hit-testing a table fragment.
 * Contains all information needed to identify the cell and paragraph at a click point.
 */
export type TableHitResult = {
  /** The table fragment that was hit */
  fragment: TableFragment;
  /** The table block from the document structure */
  block: TableBlock;
  /** The table measurement data */
  measure: TableMeasure;
  /** Index of the page containing the hit */
  pageIndex: number;
  /** Row index of the hit cell (0-based) */
  cellRowIndex: number;
  /** Column index of the hit cell (0-based) */
  cellColIndex: number;
  /** The paragraph block inside the cell */
  cellBlock: ParagraphBlock;
  /** Measurement data for the paragraph inside the cell */
  cellMeasure: ParagraphMeasure;
  /** X coordinate relative to the cell content area */
  localX: number;
  /** Y coordinate relative to the cell content area */
  localY: number;
};

type AtomicFragment = DrawingFragment | ImageFragment;

const isAtomicFragment = (fragment: Fragment): fragment is AtomicFragment => {
  return fragment.kind === 'drawing' || fragment.kind === 'image';
};

/**
 * Finds the nearest paragraph or atomic fragment to a point on a page.
 *
 * When a click lands in whitespace (no fragment hit), this snaps to the closest
 * fragment by vertical distance. Used as a fallback when hitTestFragment misses.
 */
function snapToNearestFragment(
  pageHit: PageHit,
  blocks: FlowBlock[],
  measures: Measure[],
  pageRelativePoint: Point,
): FragmentHit | null {
  const fragments = pageHit.page.fragments.filter(
    (f: Fragment | undefined): f is Fragment => f != null && typeof f === 'object',
  );
  let nearestHit: FragmentHit | null = null;
  let nearestDist = Infinity;

  for (const frag of fragments) {
    const isPara = frag.kind === 'para';
    const isAtomic = isAtomicFragment(frag);
    if (!isPara && !isAtomic) continue;

    const blockIndex = findBlockIndexByFragmentId(blocks, frag.blockId);
    if (blockIndex === -1) continue;
    const block = blocks[blockIndex];
    const measure = measures[blockIndex];
    if (!block || !measure) continue;

    let fragHeight = 0;
    if (isAtomic) {
      fragHeight = frag.height;
    } else if (isPara && block.kind === 'paragraph' && measure.kind === 'paragraph') {
      fragHeight = measure.lines
        .slice(frag.fromLine, frag.toLine)
        .reduce((sum: number, line: Line) => sum + line.lineHeight, 0);
    } else {
      continue;
    }

    const top = frag.y;
    const bottom = frag.y + fragHeight;
    let dist: number;
    if (pageRelativePoint.y < top) {
      dist = top - pageRelativePoint.y;
    } else if (pageRelativePoint.y > bottom) {
      dist = pageRelativePoint.y - bottom;
    } else {
      dist = 0;
    }

    if (dist < nearestDist) {
      nearestDist = dist;
      const pageY = Math.max(0, Math.min(pageRelativePoint.y - top, fragHeight));
      nearestHit = {
        fragment: frag,
        block,
        measure,
        pageIndex: pageHit.pageIndex,
        pageY,
      };
    }
  }

  return nearestHit;
}

const logClickStage = (_level: 'log' | 'warn' | 'error', _stage: string, _payload: Record<string, unknown>) => {
  // No-op in production. Enable for debugging click-to-position mapping.
};

const SELECTION_DEBUG_ENABLED = false;
const logSelectionDebug = (payload: Record<string, unknown>): void => {
  if (!SELECTION_DEBUG_ENABLED) return;
  try {
    console.log('[SELECTION-DEBUG]', JSON.stringify(payload));
  } catch {
    console.log('[SELECTION-DEBUG]', payload);
  }
};

/**
 * Debug flag for DOM and geometry position mapping.
 * Set to true to enable detailed logging of click-to-position operations.
 * WARNING: Should be false in production to avoid performance degradation.
 */
const DEBUG_POSITION_MAPPING = false;

/**
 * Logs position mapping debug information when DEBUG_POSITION_MAPPING is enabled.
 * @param payload - Debug data to log
 */
const logPositionDebug = (payload: Record<string, unknown>): void => {
  if (!DEBUG_POSITION_MAPPING) return;
  try {
    console.log('[CLICK-POS]', JSON.stringify(payload));
  } catch {
    console.log('[CLICK-POS]', payload);
  }
};

/**
 * Logs selection mapping debug information when DEBUG_POSITION_MAPPING is enabled.
 * @param payload - Debug data to log
 */
const logSelectionMapDebug = (payload: Record<string, unknown>): void => {
  if (!DEBUG_POSITION_MAPPING) return;
  try {
    console.log('[SELECTION-MAP]', JSON.stringify(payload));
  } catch {
    console.log('[SELECTION-MAP]', payload);
  }
};

/**
 * Extracts text content from a specific line within a paragraph block.
 *
 * This function concatenates text from all runs that contribute to the specified line,
 * handling partial runs at line boundaries and filtering out non-text runs (images, breaks).
 *
 * @param block - The flow block to extract text from (must be a paragraph block)
 * @param line - The line specification including run range (fromRun to toRun) and character offsets
 * @returns The complete text content of the line, or empty string if block is not a paragraph
 *
 * @example
 * ```typescript
 * // Line spanning runs [0, 1] with partial text from first and last run
 * const text = buildLineText(paragraphBlock, line);
 * // Returns: "Hello world" (combining partial run text)
 * ```
 */
const buildLineText = (block: FlowBlock, line: Line): string => {
  if (block.kind !== 'paragraph') return '';
  let text = '';
  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const run = block.runs[runIndex];
    if (!run || 'src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation')
      continue;
    const runText = run.text ?? '';
    const isFirstRun = runIndex === line.fromRun;
    const isLastRun = runIndex === line.toRun;
    const start = isFirstRun ? line.fromChar : 0;
    const end = isLastRun ? line.toChar : runText.length;
    text += runText.slice(start, end);
  }
  return text;
};

const blockPmRangeFromAttrs = (block: FlowBlock): { pmStart?: number; pmEnd?: number } => {
  const attrs = (block as { attrs?: Record<string, unknown> })?.attrs;
  const pmStart = typeof attrs?.pmStart === 'number' ? attrs.pmStart : undefined;
  const pmEnd = typeof attrs?.pmEnd === 'number' ? attrs.pmEnd : pmStart != null ? pmStart + 1 : undefined;
  return { pmStart, pmEnd };
};

const getAtomicPmRange = (fragment: AtomicFragment, block: FlowBlock): { pmStart?: number; pmEnd?: number } => {
  const pmStart = typeof fragment.pmStart === 'number' ? fragment.pmStart : blockPmRangeFromAttrs(block).pmStart;
  const pmEnd = typeof fragment.pmEnd === 'number' ? fragment.pmEnd : blockPmRangeFromAttrs(block).pmEnd;
  return { pmStart, pmEnd };
};

const rangesOverlap = (startA: number | undefined, endA: number | undefined, startB: number, endB: number): boolean => {
  if (startA == null) return false;
  const effectiveEndA = endA ?? startA + 1;
  return effectiveEndA > startB && startA < endB;
};

/**
 * Find the page hit given layout and a coordinate relative to the layout container.
 * Accounts for gaps between pages when calculating page boundaries.
 *
 * This function performs a spatial lookup to determine which page contains a given coordinate.
 * It handles:
 * - Per-page height variations (some pages may be taller/shorter than others)
 * - Gaps between pages (configurable spacing)
 * - Clicks in gaps (snaps to nearest page center for better UX)
 * - Edge cases (clicks outside all pages)
 *
 * **Performance:**
 * - With geometryHelper: O(1) cached lookup via binary search or linear scan of cached positions
 * - Without geometryHelper: O(n) fallback calculation where n = number of pages
 *
 * **Recommendation:** Always provide a geometryHelper for optimal performance and consistency
 * with other geometry calculations (selection rendering, cursor positioning).
 *
 * @param layout - The layout containing page data (pages, pageSize, pageGap)
 * @param point - Point in container space to test (x, y coordinates from top-left of layout container)
 * @param geometryHelper - Optional PageGeometryHelper for cached lookups. When provided, ensures
 *   consistent page position calculations across all geometry operations (click-to-position,
 *   selection highlighting, cursor rendering). Strongly recommended for performance.
 * @returns Page hit information containing pageIndex and page object, or null if point is in a gap
 *   and no nearest page can be determined (empty layout) or point is far outside all pages.
 *   When point is in a gap between pages, returns the nearest page by distance to page center.
 *
 * @example
 * ```typescript
 * // With geometry helper (recommended)
 * const helper = new PageGeometryHelper({ layout });
 * const hit = hitTestPage(layout, { x: 100, y: 550 }, helper);
 * if (hit) {
 *   console.log(`Clicked on page ${hit.pageIndex}`);
 * }
 *
 * // Without geometry helper (fallback)
 * const hit = hitTestPage(layout, { x: 100, y: 550 });
 * ```
 */
export function hitTestPage(
  layout: Layout,
  point: Point,
  geometryHelper?: import('./page-geometry-helper').PageGeometryHelper,
): PageHit | null {
  // Use geometry helper if provided for cached, accurate page positions
  if (geometryHelper) {
    const pageIndex = geometryHelper.getPageIndexAtY(point.y);
    if (pageIndex !== null) {
      return { pageIndex, page: layout.pages[pageIndex] };
    }
    const nearest = geometryHelper.getNearestPageIndex(point.y);
    if (nearest !== null) {
      return { pageIndex: nearest, page: layout.pages[nearest] };
    }
    return null;
  }

  // Fallback to inline calculation (for backward compatibility)
  const pageGap = layout.pageGap ?? 0;
  let cursorY = 0;
  let nearestIndex: number | null = null;
  let nearestDistance = Infinity;
  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    const page = layout.pages[pageIndex];
    // Use per-page height if available
    const pageHeight = page.size?.h ?? layout.pageSize.h;
    const top = cursorY;
    const bottom = top + pageHeight;
    if (point.y >= top && point.y < bottom) {
      return { pageIndex, page };
    }
    // Track nearest page by distance to center for gap hits
    const center = top + pageHeight / 2;
    const distance = Math.abs(point.y - center);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = pageIndex;
    }
    // Add gap after each page (gap appears between pages)
    cursorY = bottom + pageGap;
  }
  if (nearestIndex !== null) {
    return { pageIndex: nearestIndex, page: layout.pages[nearestIndex] };
  }
  return null;
}

/**
 * Hit-test fragments within a page for a given point (page-relative coordinates).
 */
export function hitTestFragment(
  layout: Layout,
  pageHit: PageHit,
  blocks: FlowBlock[],
  measures: Measure[],
  point: Point,
): FragmentHit | null {
  const fragments = [...pageHit.page.fragments].sort((a, b) => {
    const ay = a.kind === 'para' ? a.y : 0;
    const by = b.kind === 'para' ? b.y : 0;
    if (Math.abs(ay - by) > 0.5) return ay - by;
    const ax = a.kind === 'para' ? a.x : 0;
    const bx = b.kind === 'para' ? b.x : 0;
    return ax - bx;
  });

  for (const fragment of fragments) {
    if (fragment.kind !== 'para') continue;
    const blockIndex = findBlockIndexByFragmentId(blocks, fragment.blockId);
    if (blockIndex === -1) continue;
    const block = blocks[blockIndex];
    const measure = measures[blockIndex];
    if (!block || block.kind !== 'paragraph' || measure?.kind !== 'paragraph') continue;

    // Calculate fragment's actual height from its lines, not measure.totalHeight
    const fragmentHeight = measure.lines
      .slice(fragment.fromLine, fragment.toLine)
      .reduce((sum: number, line: Line) => sum + line.lineHeight, 0);

    const withinX = point.x >= fragment.x && point.x <= fragment.x + fragment.width;
    const withinY = point.y >= fragment.y && point.y <= fragment.y + fragmentHeight;
    if (!withinX || !withinY) {
      continue;
    }

    return {
      fragment,
      block,
      measure,
      pageIndex: pageHit.pageIndex,
      pageY: point.y - fragment.y,
    };
  }

  return null;
}

const hitTestAtomicFragment = (
  pageHit: PageHit,
  blocks: FlowBlock[],
  measures: Measure[],
  point: Point,
): FragmentHit | null => {
  for (const fragment of pageHit.page.fragments) {
    if (!isAtomicFragment(fragment)) continue;
    const withinX = point.x >= fragment.x && point.x <= fragment.x + fragment.width;
    const withinY = point.y >= fragment.y && point.y <= fragment.y + fragment.height;
    if (!withinX || !withinY) continue;

    const blockIndex = findBlockIndexByFragmentId(blocks, fragment.blockId);
    if (blockIndex === -1) continue;
    const block = blocks[blockIndex];
    const measure = measures[blockIndex];
    if (!block || !measure) continue;

    return {
      fragment,
      block,
      measure,
      pageIndex: pageHit.pageIndex,
      pageY: 0,
    };
  }
  return null;
};

/**
 * Hit-test table fragments to find the cell and paragraph at a click point.
 *
 * This function performs a multi-stage spatial lookup to map a 2D coordinate to a specific
 * paragraph within a table cell. The algorithm handles:
 * - Tables that span multiple pages (via fragments)
 * - Cells containing multiple paragraph blocks
 * - Vertical positioning within cells with padding
 * - Edge cases where clicks fall outside exact cell boundaries
 *
 * Algorithm:
 * 1. Iterate through all table fragments on the page
 * 2. Check if the point falls within the fragment's bounding box
 * 3. Find the corresponding table block and measure from the document structure
 * 4. Locate the row by accumulating row heights
 * 5. Locate the column by accumulating cell widths
 * 6. Within the cell, iterate through paragraph blocks and select the one containing the Y coordinate
 * 7. Return the paragraph block, its measure, and the local coordinates within that paragraph
 *
 * Multi-paragraph selection: When a cell contains multiple paragraphs, the function calculates
 * the vertical offset of each paragraph block and selects the one whose vertical span contains
 * the click point. If the click is below all paragraphs, the last paragraph is selected.
 *
 * @param pageHit - The page hit result containing the page and fragments
 * @param blocks - The complete array of flow blocks in the document
 * @param measures - The complete array of layout measures corresponding to the blocks
 * @param point - The 2D coordinate to hit-test (in page coordinate space)
 * @returns TableHitResult containing the fragment, block, measure, cell indices, paragraph, and local coordinates,
 *          or null if no table fragment contains the point or the cell data is invalid
 *
 * Edge cases handled:
 * - Empty tables with no rows or cells
 * - Clicks outside cell boundaries (clamped to nearest cell)
 * - Cells with no paragraph blocks
 * - Mismatched block and measure arrays
 * - Invalid cell padding values
 */
export const hitTestTableFragment = (
  pageHit: PageHit,
  blocks: FlowBlock[],
  measures: Measure[],
  point: Point,
): TableHitResult | null => {
  for (const fragment of pageHit.page.fragments) {
    if (fragment.kind !== 'table') continue;

    const tableFragment = fragment as TableFragment;
    const withinX = point.x >= tableFragment.x && point.x <= tableFragment.x + tableFragment.width;
    const withinY = point.y >= tableFragment.y && point.y <= tableFragment.y + tableFragment.height;
    if (!withinX || !withinY) continue;

    const blockIndex = blocks.findIndex((block) => block.id === tableFragment.blockId);
    if (blockIndex === -1) continue;

    const block = blocks[blockIndex];
    const measure = measures[blockIndex];
    if (!block || block.kind !== 'table' || !measure || measure.kind !== 'table') continue;

    const tableBlock = block as TableBlock;
    const tableMeasure = measure as TableMeasure;

    // Calculate local position within the table fragment
    const localX = point.x - tableFragment.x;
    const localY = point.y - tableFragment.y;

    // Find the row at localY
    let rowY = 0;
    let rowIndex = -1;
    // Bounds check: skip if table has no rows
    if (tableMeasure.rows.length === 0 || tableBlock.rows.length === 0) continue;
    for (let r = tableFragment.fromRow; r < tableFragment.toRow && r < tableMeasure.rows.length; r++) {
      const rowMeasure = tableMeasure.rows[r];
      if (localY >= rowY && localY < rowY + rowMeasure.height) {
        rowIndex = r;
        break;
      }
      rowY += rowMeasure.height;
    }

    if (rowIndex === -1) {
      // Click is below all rows, use the last row
      rowIndex = Math.min(tableFragment.toRow - 1, tableMeasure.rows.length - 1);
      if (rowIndex < tableFragment.fromRow) continue;
    }

    const rowMeasure = tableMeasure.rows[rowIndex];
    const row = tableBlock.rows[rowIndex];
    if (!rowMeasure || !row) continue;

    // Find the column at localX using column widths
    let colX = 0;
    let colIndex = -1;
    // Bounds check: skip if row has no cells
    if (rowMeasure.cells.length === 0 || row.cells.length === 0) continue;
    for (let c = 0; c < rowMeasure.cells.length; c++) {
      const cellMeasure = rowMeasure.cells[c];
      if (localX >= colX && localX < colX + cellMeasure.width) {
        colIndex = c;
        break;
      }
      colX += cellMeasure.width;
    }

    if (colIndex === -1) {
      // Click is to the right of all columns, use the last column
      colIndex = rowMeasure.cells.length - 1;
      if (colIndex < 0) continue;
    }

    const cellMeasure = rowMeasure.cells[colIndex];
    const cell = row.cells[colIndex];
    if (!cellMeasure || !cell) continue;

    // Get the first paragraph block and measure from the cell
    const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
    // Runtime validation: filter out null/undefined values instead of unsafe cast
    const rawMeasures = cellMeasure.blocks ?? (cellMeasure.paragraph ? [cellMeasure.paragraph] : []);
    const cellBlockMeasures = (Array.isArray(rawMeasures) ? rawMeasures : []).filter(
      (m): m is Measure => m != null && typeof m === 'object' && 'kind' in m,
    );

    // Find a paragraph block in the cell, respecting vertical position when multiple blocks exist
    let blockStartY = 0;
    const getBlockHeight = (m: Measure | undefined): number => {
      if (!m) return 0;
      if ('totalHeight' in m && typeof (m as { totalHeight?: number }).totalHeight === 'number') {
        return (m as { totalHeight: number }).totalHeight;
      }
      if ('height' in m && typeof (m as { height?: number }).height === 'number') {
        return (m as { height: number }).height;
      }
      return 0;
    };

    for (let i = 0; i < cellBlocks.length && i < cellBlockMeasures.length; i++) {
      const cellBlock = cellBlocks[i];
      const cellBlockMeasure = cellBlockMeasures[i];
      if (cellBlock?.kind !== 'paragraph' || cellBlockMeasure?.kind !== 'paragraph') {
        blockStartY += getBlockHeight(cellBlockMeasure);
        continue;
      }

      const blockHeight = getBlockHeight(cellBlockMeasure);
      const blockEndY = blockStartY + blockHeight;

      // Calculate position within the cell (accounting for cell padding)
      const padding = cell.attrs?.padding ?? { top: 0, left: 4, right: 4, bottom: 0 };
      const cellLocalX = localX - colX - (padding.left ?? 4);
      const cellLocalY = localY - rowY - (padding.top ?? 0);
      const paragraphBlock = cellBlock as ParagraphBlock;
      const paragraphMeasure = cellBlockMeasure as ParagraphMeasure;

      // Choose the paragraph whose vertical span contains the click; if none match, fall through to last
      const isWithinBlock = cellLocalY >= blockStartY && cellLocalY < blockEndY;
      const isLastParagraph = i === Math.min(cellBlocks.length, cellBlockMeasures.length) - 1;
      if (isWithinBlock || isLastParagraph) {
        const unclampedLocalY = cellLocalY - blockStartY;
        const localYWithinBlock = Math.max(0, Math.min(unclampedLocalY, Math.max(blockHeight, 0)));
        return {
          fragment: tableFragment,
          block: tableBlock,
          measure: tableMeasure,
          pageIndex: pageHit.pageIndex,
          cellRowIndex: rowIndex,
          cellColIndex: colIndex,
          cellBlock: paragraphBlock,
          cellMeasure: paragraphMeasure,
          localX: Math.max(0, cellLocalX),
          localY: Math.max(0, localYWithinBlock),
        };
      }

      blockStartY = blockEndY;
    }
  }

  return null;
};

/**
 * Map a coordinate click to a ProseMirror position.
 *
 * This function supports two mapping strategies:
 * 1. **DOM-based mapping** (preferred): Uses actual DOM elements with data attributes
 *    for pixel-perfect accuracy. Handles PM position gaps correctly.
 * 2. **Geometry-based mapping** (fallback): Uses layout geometry and text measurement
 *    when DOM is unavailable or mapping fails.
 *
 * To enable DOM mapping, provide the `domContainer` parameter and `clientX`/`clientY`
 * coordinates. The function will attempt DOM mapping first, falling back to geometry
 * if needed.
 *
 * **Algorithm (Geometry-based):**
 * 1. Hit-test to find the page containing the click point
 * 2. Transform container coordinates to page-relative coordinates
 * 3. Hit-test to find the fragment (paragraph, table, drawing) at the point
 * 4. For paragraphs: find line at Y, then character at X using Canvas-based text measurement
 * 5. For tables: find cell, then paragraph within cell, then character position
 * 6. For drawings/images: return the fragment's PM position range
 * 7. If no direct hit, snap to nearest fragment on the page
 *
 * **Performance:**
 * - DOM mapping: O(1) DOM query via elementFromPoint
 * - Geometry mapping: O(n) where n = number of fragments on the clicked page
 * - With geometryHelper: Page lookups are O(1) cached
 *
 * @param layout - The layout data containing pages and fragments
 * @param blocks - Array of flow blocks from the document
 * @param measures - Array of text measurements for the blocks
 * @param containerPoint - Click point in layout container space (x, y from top-left of layout container).
 *   Used for geometry-based mapping when DOM mapping is unavailable.
 * @param domContainer - Optional DOM container element. When provided with clientX/clientY, enables
 *   DOM-based mapping which is more accurate and handles PM position gaps correctly.
 * @param clientX - Optional client X coordinate (viewport space). Required for DOM mapping.
 * @param clientY - Optional client Y coordinate (viewport space). Required for DOM mapping.
 * @param geometryHelper - Optional PageGeometryHelper for cached page position lookups. Strongly
 *   recommended for performance and consistency. When provided, ensures page positions match
 *   exactly with selection rendering and cursor positioning. Without it, falls back to inline
 *   calculation which may have subtle differences from other geometry operations.
 * @returns Position hit with PM position and metadata (blockId, pageIndex, column, lineIndex),
 *   or null if mapping fails (click outside all content, invalid coordinates, etc.).
 *
 * @example
 * ```typescript
 * // DOM-based mapping (preferred)
 * const hit = clickToPosition(
 *   layout, blocks, measures,
 *   { x: containerX, y: containerY },
 *   domElement,
 *   event.clientX,
 *   event.clientY,
 *   geometryHelper
 * );
 *
 * // Geometry-based mapping (fallback)
 * const hit = clickToPosition(
 *   layout, blocks, measures,
 *   { x: containerX, y: containerY },
 *   undefined, undefined, undefined,
 *   geometryHelper
 * );
 *
 * if (hit) {
 *   view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.pos)));
 * }
 * ```
 */
const readLayoutEpochFromDom = (domContainer: HTMLElement, clientX: number, clientY: number): number | null => {
  const doc = domContainer.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.elementsFromPoint !== 'function') {
    return null;
  }

  let hitChain: Element[] = [];
  try {
    hitChain = doc.elementsFromPoint(clientX, clientY) ?? [];
  } catch {
    return null;
  }

  let latestEpoch: number | null = null;
  for (const el of hitChain) {
    if (!(el instanceof HTMLElement)) continue;
    if (!domContainer.contains(el)) continue;
    const raw = el.dataset.layoutEpoch;
    if (raw == null) continue;
    const epoch = Number(raw);
    if (!Number.isFinite(epoch)) continue;
    // Pick the newest epoch in the hit chain to avoid stale descendants blocking mapping.
    if (latestEpoch == null || epoch > latestEpoch) {
      latestEpoch = epoch;
    }
  }

  return latestEpoch;
};

export function clickToPosition(
  layout: Layout,
  blocks: FlowBlock[],
  measures: Measure[],
  containerPoint: Point,
  domContainer?: HTMLElement,
  clientX?: number,
  clientY?: number,
  geometryHelper?: import('./page-geometry-helper').PageGeometryHelper,
): PositionHit | null {
  const layoutEpoch = layout.layoutEpoch ?? 0;

  logClickStage('log', 'entry', {
    point: containerPoint,
    pages: layout.pages.length,
    hasDomContainer: domContainer != null,
  });

  // Try DOM-based mapping first if container and coordinates provided
  if (domContainer != null && clientX != null && clientY != null) {
    logClickStage('log', 'dom-attempt', { trying: 'DOM-based mapping' });
    const domPos = clickToPositionDom(domContainer, clientX, clientY);
    const domLayoutEpoch = readLayoutEpochFromDom(domContainer, clientX, clientY) ?? layoutEpoch;

    if (domPos != null) {
      logPositionDebug({
        origin: 'dom',
        pos: domPos,
        clientX,
        clientY,
      });
      // DOM mapping succeeded - we need to construct a PositionHit with metadata
      // Find the block containing this position to get blockId
      let blockId = '';
      let pageIndex = 0;
      let column = 0;
      let lineIndex = -1;

      // Search through layout to find the fragment containing this position
      for (let pi = 0; pi < layout.pages.length; pi++) {
        const page = layout.pages[pi];
        for (const fragment of page.fragments) {
          if (fragment.kind === 'para' && fragment.pmStart != null && fragment.pmEnd != null) {
            if (domPos >= fragment.pmStart && domPos <= fragment.pmEnd) {
              blockId = fragment.blockId;
              pageIndex = pi;
              column = determineColumn(layout, fragment.x);
              // Find line index if possible
              const blockIndex = findBlockIndexByFragmentId(blocks, fragment.blockId);
              if (blockIndex !== -1) {
                const measure = measures[blockIndex];
                if (measure && measure.kind === 'paragraph') {
                  // Use fragment-specific remeasured lines when present to avoid index mismatches.
                  if (fragment.lines && fragment.lines.length > 0) {
                    for (let localIndex = 0; localIndex < fragment.lines.length; localIndex++) {
                      const line = fragment.lines[localIndex];
                      if (!line) continue;
                      const range = computeLinePmRange(blocks[blockIndex], line);
                      if (range.pmStart != null && range.pmEnd != null) {
                        if (domPos >= range.pmStart && domPos <= range.pmEnd) {
                          lineIndex = fragment.fromLine + localIndex;
                          break;
                        }
                      }
                    }
                  } else {
                    for (let li = fragment.fromLine; li < fragment.toLine; li++) {
                      const line = measure.lines[li];
                      if (!line) continue;
                      const range = computeLinePmRange(blocks[blockIndex], line);
                      if (range.pmStart != null && range.pmEnd != null) {
                        if (domPos >= range.pmStart && domPos <= range.pmEnd) {
                          lineIndex = li;
                          break;
                        }
                      }
                    }
                  }
                }
              }
              logClickStage('log', 'success', {
                blockId,
                pos: domPos,
                pageIndex,
                column,
                lineIndex,
                usedMethod: 'DOM',
              });
              return { pos: domPos, layoutEpoch: domLayoutEpoch, blockId, pageIndex, column, lineIndex };
            }
          }
        }
      }

      logClickStage('log', 'success', {
        pos: domPos,
        usedMethod: 'DOM',
        note: 'position found but fragment not located',
      });
      return { pos: domPos, layoutEpoch: domLayoutEpoch, blockId: '', pageIndex: 0, column: 0, lineIndex: -1 };
    }

    logClickStage('log', 'dom-fallback', { reason: 'DOM mapping returned null, trying geometry' });
  }

  // Fallback to geometry-based mapping
  logClickStage('log', 'geometry-attempt', { trying: 'geometry-based mapping' });

  // When normalizeClientPoint produces containerPoint, it adjusts Y by the page's DOM
  // offset, making containerPoint page-relative rather than container-space. On page 1
  // the offset is ~0 so it doesn't matter, but on page 2+ this causes hitTestPage to
  // find the wrong page and pageRelativePoint to be doubly subtracted.
  //
  // Fix: when DOM info is available, determine the page from elementsFromPoint (same
  // technique normalizeClientPoint uses) and treat containerPoint as already page-relative.
  let pageHit: PageHit | null = null;
  let isContainerPointPageRelative = false;

  if (domContainer != null && clientX != null && clientY != null) {
    const pageEl = findPageElement(domContainer, clientX, clientY);
    if (pageEl) {
      const domPageIndex = Number(pageEl.dataset.pageIndex ?? 'NaN');
      if (Number.isFinite(domPageIndex) && domPageIndex >= 0 && domPageIndex < layout.pages.length) {
        pageHit = { pageIndex: domPageIndex, page: layout.pages[domPageIndex] };
        isContainerPointPageRelative = true;
      }
    }
  }

  if (!pageHit) {
    pageHit = hitTestPage(layout, containerPoint, geometryHelper);
  }

  if (!pageHit) {
    logClickStage('warn', 'no-page', {
      point: containerPoint,
    });
    return null;
  }

  // Calculate page-relative point
  let pageRelativePoint: Point;
  if (isContainerPointPageRelative) {
    // containerPoint is already page-relative (normalizeClientPoint adjusted Y by page offset)
    pageRelativePoint = containerPoint;
  } else {
    // containerPoint is in container-space, subtract page top to get page-relative
    const pageTopY = geometryHelper
      ? geometryHelper.getPageTop(pageHit.pageIndex)
      : calculatePageTopFallback(layout, pageHit.pageIndex);
    pageRelativePoint = {
      x: containerPoint.x,
      y: containerPoint.y - pageTopY,
    };
  }

  logClickStage('log', 'page-hit', {
    pageIndex: pageHit.pageIndex,
    pageRelativePoint,
  });

  let fragmentHit = hitTestFragment(layout, pageHit, blocks, measures, pageRelativePoint);

  // If no fragment was hit (e.g., whitespace), snap to nearest hit-testable fragment on the page.
  // But skip snap-to-nearest when the click is within a table fragment — otherwise the snap
  // picks a nearby paragraph and returns its position, preventing clicks in empty table cell
  // space (below text lines) from reaching hitTestTableFragment below.
  if (!fragmentHit) {
    const isWithinTableFragment = pageHit.page.fragments
      .filter((f) => f.kind === 'table')
      .some((f) => {
        const tf = f as TableFragment;
        return (
          pageRelativePoint.x >= tf.x &&
          pageRelativePoint.x <= tf.x + tf.width &&
          pageRelativePoint.y >= tf.y &&
          pageRelativePoint.y <= tf.y + tf.height
        );
      });
    if (!isWithinTableFragment) {
      fragmentHit = snapToNearestFragment(pageHit, blocks, measures, pageRelativePoint);
    }
  }

  if (fragmentHit) {
    const { fragment, block, measure, pageIndex, pageY } = fragmentHit;
    // Handle paragraph fragments
    if (fragment.kind === 'para' && measure.kind === 'paragraph' && block.kind === 'paragraph') {
      const lineIndex = findLineIndexAtY(measure, pageY, fragment.fromLine, fragment.toLine);
      if (lineIndex == null) {
        logClickStage('warn', 'no-line', {
          blockId: fragment.blockId,
          pageIndex,
          pageY,
        });
        return null;
      }
      const line = measure.lines[lineIndex];

      const isRTL = isRtlBlock(block);
      // Type guard: Validate indent structure and ensure numeric values
      const indentLeft = typeof block.attrs?.indent?.left === 'number' ? block.attrs.indent.left : 0;
      const indentRight = typeof block.attrs?.indent?.right === 'number' ? block.attrs.indent.right : 0;
      const paraIndentLeft = Number.isFinite(indentLeft) ? indentLeft : 0;
      const paraIndentRight = Number.isFinite(indentRight) ? indentRight : 0;

      const totalIndent = paraIndentLeft + paraIndentRight;
      const availableWidth = Math.max(0, fragment.width - totalIndent);

      // Validation: Warn when indents exceed fragment width (potential layout issue)
      if (totalIndent > fragment.width) {
        console.warn(
          `[clickToPosition] Paragraph indents (${totalIndent}px) exceed fragment width (${fragment.width}px) ` +
            `for block ${fragment.blockId}. This may indicate a layout miscalculation. ` +
            `Available width clamped to 0.`,
        );
      }

      // List items use textAlign: 'left' in the DOM for non-justify alignments.
      // For justify, the DOM uses textAlign: 'left' but applies word-spacing for actual justify effect.
      // We only override alignment for list items when NOT justified, so justify caret positioning works correctly.
      const markerWidth = fragment.markerWidth ?? measure.marker?.markerWidth ?? 0;
      const isListItem = markerWidth > 0;
      const paraAlignment = block.attrs?.alignment;
      const isJustified = paraAlignment === 'justify';
      const alignmentOverride = isListItem && !isJustified ? 'left' : undefined;

      const pos = mapPointToPm(block, line, pageRelativePoint.x - fragment.x, isRTL, availableWidth, alignmentOverride);
      if (pos == null) {
        logClickStage('warn', 'no-position', {
          blockId: fragment.blockId,
          lineIndex,
          isRTL,
        });
        return null;
      }

      const column = determineColumn(layout, fragment.x);
      logPositionDebug({
        origin: 'geometry',
        pos,
        blockId: fragment.blockId,
        pageIndex,
        column,
        lineIndex,
        x: pageRelativePoint.x - fragment.x,
        y: pageRelativePoint.y,
        isRTL,
      });

      logClickStage('log', 'success', {
        blockId: fragment.blockId,
        pos,
        pageIndex,
        column,
        lineIndex,
        origin: 'paragraph',
      });

      return {
        pos,
        layoutEpoch,
        blockId: fragment.blockId,
        pageIndex,
        column,
        lineIndex, // lineIndex is now already absolute (within measure.lines), no need to add fragment.fromLine
      };
    }

    // Handle atomic fragments (drawing, image)
    if (isAtomicFragment(fragment)) {
      const pmRange = getAtomicPmRange(fragment, block);
      const pos = pmRange.pmStart ?? pmRange.pmEnd ?? null;
      if (pos == null) {
        logClickStage('warn', 'atomic-without-range', {
          fragmentId: fragment.blockId,
        });
        return null;
      }

      logClickStage('log', 'success', {
        blockId: fragment.blockId,
        pos,
        pageIndex,
        column: determineColumn(layout, fragment.x),
        lineIndex: -1,
        origin: 'atomic-fragment-hit',
      });

      return {
        pos,
        layoutEpoch,
        blockId: fragment.blockId,
        pageIndex,
        column: determineColumn(layout, fragment.x),
        lineIndex: -1,
      };
    }
  }

  // Try table fragment hit testing
  const tableHit = hitTestTableFragment(pageHit, blocks, measures, pageRelativePoint);
  if (tableHit) {
    const { cellBlock, cellMeasure, localX, localY, pageIndex } = tableHit;

    // Find the line at the local Y position within the cell paragraph
    const lineIndex = findLineIndexAtY(cellMeasure, localY, 0, cellMeasure.lines.length);
    if (lineIndex != null) {
      const line = cellMeasure.lines[lineIndex];
      const isRTL = isRtlBlock(cellBlock);
      // Type guard: Validate indent structure and ensure numeric values
      const indentLeft = typeof cellBlock.attrs?.indent?.left === 'number' ? cellBlock.attrs.indent.left : 0;
      const indentRight = typeof cellBlock.attrs?.indent?.right === 'number' ? cellBlock.attrs.indent.right : 0;
      const paraIndentLeft = Number.isFinite(indentLeft) ? indentLeft : 0;
      const paraIndentRight = Number.isFinite(indentRight) ? indentRight : 0;

      const totalIndent = paraIndentLeft + paraIndentRight;
      const availableWidth = Math.max(0, tableHit.fragment.width - totalIndent);

      // Validation: Warn when indents exceed fragment width (potential layout issue)
      if (totalIndent > tableHit.fragment.width) {
        console.warn(
          `[clickToPosition:table] Paragraph indents (${totalIndent}px) exceed fragment width (${tableHit.fragment.width}px) ` +
            `for block ${tableHit.fragment.blockId}. This may indicate a layout miscalculation. ` +
            `Available width clamped to 0.`,
        );
      }

      // List items in table cells use textAlign: 'left' in the DOM for non-justify alignments.
      // For justify, we don't override so justify caret positioning works correctly.
      const cellMarkerWidth = cellMeasure.marker?.markerWidth ?? 0;
      const isListItem = cellMarkerWidth > 0;
      const cellAlignment = cellBlock.attrs?.alignment;
      const isJustified = cellAlignment === 'justify';
      const alignmentOverride = isListItem && !isJustified ? 'left' : undefined;

      const pos = mapPointToPm(cellBlock, line, localX, isRTL, availableWidth, alignmentOverride);

      if (pos != null) {
        logClickStage('log', 'success', {
          blockId: tableHit.fragment.blockId,
          pos,
          pageIndex,
          column: determineColumn(layout, tableHit.fragment.x),
          lineIndex,
          origin: 'table-cell',
        });

        return {
          pos,
          layoutEpoch,
          blockId: tableHit.fragment.blockId,
          pageIndex,
          column: determineColumn(layout, tableHit.fragment.x),
          lineIndex,
        };
      }
    }

    // Fallback: return first position in the cell if line/position mapping fails
    const firstRun = cellBlock.runs?.[0];
    if (firstRun && firstRun.pmStart != null) {
      logClickStage('log', 'success', {
        blockId: tableHit.fragment.blockId,
        pos: firstRun.pmStart,
        pageIndex,
        column: determineColumn(layout, tableHit.fragment.x),
        lineIndex: 0,
        origin: 'table-cell-fallback',
      });

      return {
        pos: firstRun.pmStart,
        layoutEpoch,
        blockId: tableHit.fragment.blockId,
        pageIndex,
        column: determineColumn(layout, tableHit.fragment.x),
        lineIndex: 0,
      };
    }

    logClickStage('warn', 'table-cell-no-position', {
      blockId: tableHit.fragment.blockId,
      cellRow: tableHit.cellRowIndex,
      cellCol: tableHit.cellColIndex,
    });
  }

  // If we still haven't found a fragment, try direct atomic fragment hit test
  // This handles cases where the atomic fragment wasn't caught by the snap-to-nearest logic
  const atomicHit = hitTestAtomicFragment(pageHit, blocks, measures, pageRelativePoint);
  if (atomicHit && isAtomicFragment(atomicHit.fragment)) {
    const { fragment, block, pageIndex } = atomicHit;
    const pmRange = getAtomicPmRange(fragment, block);
    const pos = pmRange.pmStart ?? pmRange.pmEnd ?? null;
    if (pos == null) {
      logClickStage('warn', 'atomic-without-range', {
        fragmentId: fragment.blockId,
      });
      return null;
    }

    logClickStage('log', 'success', {
      blockId: fragment.blockId,
      pos,
      pageIndex,
      column: determineColumn(layout, fragment.x),
      lineIndex: -1,
      origin: 'atomic-direct-hit',
    });

    return {
      pos,
      layoutEpoch,
      blockId: fragment.blockId,
      pageIndex,
      column: determineColumn(layout, fragment.x),
      lineIndex: -1,
    };
  }

  logClickStage('warn', 'no-fragment', {
    pageIndex: pageHit.pageIndex,
    pageRelativePoint,
  });
  return null;
}

/**
 * Find a block by fragment blockId, handling continuation fragments.
 * When paragraphs split across pages, continuation fragments get suffixed IDs
 * (e.g., "5-paragraph-1") while the blocks array uses the base ID ("5-paragraph").
 *
 * When a page break is inserted (CMD+ENTER), the paragraph splits into multiple blocks
 * with the same base ID but different PM ranges. The targetPmRange helps find the
 * correct block by checking which one contains the target range.
 *
 * @param blocks - Array of flow blocks to search through
 * @param fragmentBlockId - The block ID from the fragment (may include continuation suffix like "-1")
 * @param targetPmRange - Optional PM range {from, to} to disambiguate when multiple blocks share the same ID
 * @returns The index of the matching block, or -1 if not found
 */
function findBlockIndexByFragmentId(
  blocks: FlowBlock[],
  fragmentBlockId: string,
  targetPmRange?: { from: number; to: number },
): number {
  // Try exact match first, but skip pageBreak/sectionBreak blocks that may share IDs with continuation paragraphs.
  // This allows drawings, images, tables, and paragraphs to match while avoiding structural break blocks.
  const index = blocks.findIndex(
    (block) => block.id === fragmentBlockId && block.kind !== 'pageBreak' && block.kind !== 'sectionBreak',
  );
  if (index !== -1) {
    return index;
  }

  // If no match, try stripping continuation suffix (e.g., "5-paragraph-1" -> "5-paragraph")
  const baseBlockId = fragmentBlockId.replace(/-\d+$/, '');
  if (baseBlockId === fragmentBlockId) {
    return -1; // No suffix to strip, nothing more to try
  }

  // Find all paragraph blocks with matching base ID.
  // Note: continuation suffixes (-1, -2) are only used for paragraphs split across pages.
  const matchingIndices: number[] = [];
  blocks.forEach((block, idx) => {
    if (block.id === baseBlockId && block.kind === 'paragraph') {
      matchingIndices.push(idx);
    }
  });

  if (matchingIndices.length === 0) {
    return -1;
  }

  // If only one match, return it
  if (matchingIndices.length === 1) {
    return matchingIndices[0];
  }

  // Multiple blocks with same ID - use target PM range to disambiguate
  if (targetPmRange) {
    for (const idx of matchingIndices) {
      const block = blocks[idx];
      // Extra safety check - should always be true due to filtering above
      if (block.kind !== 'paragraph') continue;

      // Check if any run in this block overlaps the target range
      const hasOverlap = block.runs.some((run: Run) => {
        if (run.pmStart == null || run.pmEnd == null) return false;
        return run.pmEnd > targetPmRange.from && run.pmStart < targetPmRange.to;
      });
      if (hasOverlap) {
        return idx;
      }
    }
  }

  // Fallback to first matching block
  return matchingIndices[0];
}

type TableRowBlock = TableBlock['rows'][number];
type TableCellBlock = TableRowBlock['cells'][number];
type TableCellMeasure = TableMeasure['rows'][number]['cells'][number];

const DEFAULT_CELL_PADDING = { top: 0, bottom: 0, left: 4, right: 4 };

const getCellPaddingFromRow = (cellIdx: number, row?: TableRowBlock) => {
  const padding = row?.cells?.[cellIdx]?.attrs?.padding ?? {};
  return {
    top: padding.top ?? DEFAULT_CELL_PADDING.top,
    bottom: padding.bottom ?? DEFAULT_CELL_PADDING.bottom,
    left: padding.left ?? DEFAULT_CELL_PADDING.left,
    right: padding.right ?? DEFAULT_CELL_PADDING.right,
  };
};

const getCellBlocks = (cell: TableCellBlock | undefined) => {
  if (!cell) return [];
  return cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
};

const getCellMeasures = (cell: TableCellMeasure | undefined) => {
  if (!cell) return [];
  return cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
};

const sumLineHeights = (measure: ParagraphMeasure, fromLine: number, toLine: number) => {
  let height = 0;
  for (let i = fromLine; i < toLine && i < measure.lines.length; i += 1) {
    height += measure.lines[i]?.lineHeight ?? 0;
  }
  return height;
};

/**
 * Calculates cumulative Y position for a page (fallback when no geometry helper provided).
 *
 * This function provides an inline calculation alternative to PageGeometryHelper for backward
 * compatibility. It computes the Y offset of a page by summing heights and gaps of all
 * preceding pages.
 *
 * **Why This Exists:**
 * - Backward compatibility: Some callers may not have a PageGeometryHelper instance
 * - Simpler API: No need to instantiate a helper for one-off calculations
 * - Testing: Easier to test individual calculations in isolation
 *
 * **Difference from PageGeometryHelper:**
 * - PageGeometryHelper: Caches cumulative positions for O(1) lookups
 * - calculatePageTopFallback: Recalculates on every call - O(n) where n = pageIndex
 * - PageGeometryHelper: Guaranteed consistent with other geometry operations
 * - calculatePageTopFallback: May have subtle differences if layout changes between calls
 *
 * **Performance:**
 * - Time: O(n) where n = pageIndex (must iterate through all preceding pages)
 * - Space: O(1) (no cache, just accumulator variable)
 * - For documents with many pages: PageGeometryHelper is significantly faster
 * - For single-page documents or small pageIndex: Negligible difference
 *
 * **When to Use:**
 * - One-off calculations where caching overhead isn't justified
 * - Backward compatibility with code that doesn't use PageGeometryHelper
 * - Testing individual page position calculations
 *
 * **Recommendation:**
 * Use PageGeometryHelper whenever possible for better performance and consistency.
 * This fallback should only be used when a geometry helper is truly unavailable.
 *
 * @param layout - The layout containing page data
 * @param pageIndex - Zero-based index of the page to calculate Y position for
 * @returns Cumulative Y position in pixels from container top to page top
 * @private
 *
 * @example
 * ```typescript
 * // Calculate Y position of page 2 (third page)
 * // Assumes page 0 height = 1000, page 1 height = 1200, gap = 24
 * const y = calculatePageTopFallback(layout, 2);
 * // Returns: 1000 + 24 + 1200 + 24 = 2248
 * ```
 */
const calculatePageTopFallback = (layout: Layout, pageIndex: number): number => {
  const pageGap = layout.pageGap ?? 0;
  let y = 0;
  for (let i = 0; i < pageIndex; i++) {
    const pageHeight = layout.pages[i]?.size?.h ?? layout.pageSize.h;
    y += pageHeight + pageGap;
  }
  return y;
};

/**
 * Given a PM range [from, to), return selection rectangles for highlighting.
 *
 * @param layout - The layout containing page and fragment data
 * @param blocks - Array of flow blocks
 * @param measures - Array of measurements corresponding to blocks
 * @param from - Start PM position
 * @param to - End PM position
 * @param geometryHelper - Optional PageGeometryHelper for accurate Y calculations (recommended)
 * @returns Array of selection rectangles in container space
 */
export function selectionToRects(
  layout: Layout,
  blocks: FlowBlock[],
  measures: Measure[],
  from: number,
  to: number,
  geometryHelper?: import('./page-geometry-helper').PageGeometryHelper,
): Rect[] {
  if (from === to) {
    return [];
  }

  const rects: Rect[] = [];
  const debugEntries: Record<string, unknown>[] = [];

  layout.pages.forEach((page: Layout['pages'][number], pageIndex: number) => {
    // Calculate cumulative Y offset for this page
    const pageTopY = geometryHelper
      ? geometryHelper.getPageTop(pageIndex)
      : calculatePageTopFallback(layout, pageIndex);
    page.fragments.forEach((fragment: Fragment) => {
      if (fragment.kind === 'para') {
        const blockIndex = findBlockIndexByFragmentId(blocks, fragment.blockId, { from, to });
        if (blockIndex === -1) {
          return;
        }
        const block = blocks[blockIndex];
        const measure = measures[blockIndex];
        if (!block || block.kind !== 'paragraph' || measure?.kind !== 'paragraph') {
          return;
        }

        const intersectingLines = findLinesIntersectingRange(block, measure, from, to);
        intersectingLines.forEach(({ line, index }) => {
          if (index < fragment.fromLine || index >= fragment.toLine) {
            return;
          }
          const range = computeLinePmRange(block, line);
          if (range.pmStart == null || range.pmEnd == null) return;
          const sliceFrom = Math.max(range.pmStart, from);
          const sliceTo = Math.min(range.pmEnd, to);
          if (sliceFrom >= sliceTo) return;

          // Convert PM positions to character offsets properly
          // (accounts for gaps in PM positions between runs)
          const charOffsetFrom = pmPosToCharOffset(block, line, sliceFrom);
          const charOffsetTo = pmPosToCharOffset(block, line, sliceTo);
          // Detect list items by checking for marker presence
          const markerWidth = fragment.markerWidth ?? measure.marker?.markerWidth ?? 0;
          const isListItemFlag = isListItem(markerWidth, block);
          // List items use textAlign: 'left' in the DOM for non-justify alignments.
          // For justify, we don't override so justify selection rectangles are calculated correctly.
          const blockAlignment = block.attrs?.alignment;
          const isJustified = blockAlignment === 'justify';
          const alignmentOverride = isListItemFlag && !isJustified ? 'left' : undefined;
          const startX = mapPmToX(block, line, charOffsetFrom, fragment.width, alignmentOverride);
          const endX = mapPmToX(block, line, charOffsetTo, fragment.width, alignmentOverride);

          // Calculate text indent using shared utility
          const indent = extractParagraphIndent(block.attrs?.indent);
          const wordLayout = getWordLayoutConfig(block);
          const isFirstLine = index === fragment.fromLine;
          const indentAdjust = calculateTextStartIndent({
            isFirstLine,
            isListItem: isListItemFlag,
            markerWidth,
            markerTextWidth: fragment.markerTextWidth ?? measure.marker?.markerTextWidth ?? undefined,
            paraIndentLeft: indent.left,
            firstLineIndent: indent.firstLine,
            hangingIndent: indent.hanging,
            wordLayout,
          });

          const rectX = fragment.x + indentAdjust + Math.min(startX, endX);
          const rectWidth = Math.max(
            1,
            Math.min(Math.abs(endX - startX), line.width), // clamp to line width to prevent runaway widths
          );
          const lineOffset = lineHeightBeforeIndex(measure, index) - lineHeightBeforeIndex(measure, fragment.fromLine);
          const rectY = fragment.y + lineOffset;
          rects.push({
            x: rectX,
            y: rectY + pageTopY,
            width: rectWidth,
            height: line.lineHeight,
            pageIndex,
          });

          if (SELECTION_DEBUG_ENABLED) {
            const runs = block.runs.slice(line.fromRun, line.toRun + 1).map((run: Run, idx: number) => {
              const isAtomic =
                'src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation';
              const text = isAtomic ? '' : (run.text ?? '');
              return {
                idx: line.fromRun + idx,
                kind: run.kind ?? 'text',
                pmStart: run.pmStart,
                pmEnd: run.pmEnd,
                textLength: text.length,
                textPreview: text.slice(0, 30),
                fontFamily: (run as { fontFamily?: string }).fontFamily,
                fontSize: (run as { fontSize?: number }).fontSize,
              };
            });

            debugEntries.push({
              pageIndex,
              blockId: block.id,
              lineIndex: index,
              lineFromRun: line.fromRun,
              lineToRun: line.toRun,
              lineFromChar: line.fromChar,
              lineToChar: line.toChar,
              lineWidth: line.width,
              fragment: {
                x: fragment.x,
                y: fragment.y,
                width: fragment.width,
                fromLine: fragment.fromLine,
                toLine: fragment.toLine,
              },
              pmRange: range,
              sliceFrom,
              sliceTo,
              charOffsetFrom,
              charOffsetTo,
              startX,
              endX,
              rect: { x: rectX, y: rectY, width: rectWidth, height: line.lineHeight },
              runs,
              lineText: buildLineText(block, line),
              selectedText: buildLineText(block, line).slice(
                Math.min(charOffsetFrom, charOffsetTo),
                Math.max(charOffsetFrom, charOffsetTo),
              ),
              indent: (block.attrs as { indent?: unknown } | undefined)?.indent,
              marker: measure.marker,
              lineSegments: line.segments,
            });
          }
        });
        return;
      }

      if (fragment.kind === 'table') {
        const blockIndex = findBlockIndexByFragmentId(blocks, fragment.blockId, { from, to });
        if (blockIndex === -1) return;

        const block = blocks[blockIndex];
        const measure = measures[blockIndex];
        if (!block || block.kind !== 'table' || measure?.kind !== 'table') {
          return;
        }

        const tableBlock = block as TableBlock;
        const tableMeasure = measure as TableMeasure;
        const tableFragment = fragment as TableFragment;

        const rowHeights = tableMeasure.rows.map((rowMeasure: TableMeasure['rows'][number], idx: number) => {
          if (tableFragment.partialRow && tableFragment.partialRow.rowIndex === idx) {
            return tableFragment.partialRow.partialHeight;
          }
          return rowMeasure?.height ?? 0;
        });

        const calculateCellX = (cellIdx: number, cellMeasure: TableCellMeasure) => {
          const gridStart = cellMeasure.gridColumnStart ?? cellIdx;
          let x = 0;
          for (let i = 0; i < gridStart && i < tableMeasure.columnWidths.length; i += 1) {
            x += tableMeasure.columnWidths[i];
          }
          return x;
        };

        const processRow = (rowIndex: number, rowOffset: number): number => {
          const rowMeasure = tableMeasure.rows[rowIndex];
          const row = tableBlock.rows[rowIndex];
          if (!rowMeasure || !row) return rowOffset;

          const rowHeight = rowHeights[rowIndex] ?? rowMeasure.height;
          const isPartialRow = tableFragment.partialRow?.rowIndex === rowIndex;
          const partialRowData = isPartialRow ? tableFragment.partialRow : null;

          const totalColumns = Math.min(rowMeasure.cells.length, row.cells.length);

          for (let cellIdx = 0; cellIdx < totalColumns; cellIdx += 1) {
            const cellMeasure = rowMeasure.cells[cellIdx];
            const cell = row.cells[cellIdx];
            if (!cellMeasure || !cell) continue;

            const padding = getCellPaddingFromRow(cellIdx, row);
            const cellX = calculateCellX(cellIdx, cellMeasure);

            const cellBlocks = getCellBlocks(cell);
            const cellBlockMeasures = getCellMeasures(cellMeasure);

            // Map each block to its global line range within the cell
            const renderedBlocks: Array<{
              block: ParagraphBlock;
              measure: ParagraphMeasure;
              startLine: number;
              endLine: number;
              height: number;
            }> = [];

            let cumulativeLine = 0;
            for (let i = 0; i < Math.min(cellBlocks.length, cellBlockMeasures.length); i += 1) {
              const paraBlock = cellBlocks[i];
              const paraMeasure = cellBlockMeasures[i];
              if (!paraBlock || !paraMeasure || paraBlock.kind !== 'paragraph' || paraMeasure.kind !== 'paragraph') {
                continue;
              }
              const lineCount = paraMeasure.lines.length;
              const blockStart = cumulativeLine;
              const blockEnd = cumulativeLine + lineCount;
              cumulativeLine = blockEnd;

              const allowedStart = partialRowData?.fromLineByCell?.[cellIdx] ?? 0;
              const rawAllowedEnd = partialRowData?.toLineByCell?.[cellIdx];
              const allowedEnd = rawAllowedEnd == null || rawAllowedEnd === -1 ? cumulativeLine : rawAllowedEnd;

              const renderStartGlobal = Math.max(blockStart, allowedStart);
              const renderEndGlobal = Math.min(blockEnd, allowedEnd);
              if (renderStartGlobal >= renderEndGlobal) continue;

              const startLine = renderStartGlobal - blockStart;
              const endLine = renderEndGlobal - blockStart;

              let height = sumLineHeights(paraMeasure, startLine, endLine);
              const rendersWholeBlock = startLine === 0 && endLine >= lineCount;
              if (rendersWholeBlock) {
                const totalHeight = (paraMeasure as { totalHeight?: number }).totalHeight;
                if (typeof totalHeight === 'number' && totalHeight > height) {
                  height = totalHeight;
                }
                const spacingAfter = (paraBlock.attrs as { spacing?: { after?: number } } | undefined)?.spacing?.after;
                if (typeof spacingAfter === 'number' && spacingAfter > 0) {
                  height += spacingAfter;
                }
              }

              renderedBlocks.push({ block: paraBlock, measure: paraMeasure, startLine, endLine, height });
            }

            const contentHeight = renderedBlocks.reduce((acc, info) => acc + info.height, 0);
            const contentAreaHeight = Math.max(0, rowHeight - (padding.top + padding.bottom));
            const freeSpace = Math.max(0, contentAreaHeight - contentHeight);

            let verticalOffset = 0;
            const vAlign = cell.attrs?.verticalAlign;
            if (vAlign === 'center' || vAlign === 'middle') {
              verticalOffset = freeSpace / 2;
            } else if (vAlign === 'bottom') {
              verticalOffset = freeSpace;
            }

            let blockTopCursor = padding.top + verticalOffset;

            renderedBlocks.forEach((info) => {
              const paragraphMarkerWidth = info.measure.marker?.markerWidth ?? 0;
              // List items in table cells are also rendered with left alignment
              const cellIsListItem = isListItem(paragraphMarkerWidth, info.block);
              const alignmentOverride = cellIsListItem ? 'left' : undefined;
              // Extract paragraph indent for text positioning
              const cellIndent = extractParagraphIndent(
                info.block.kind === 'paragraph' ? info.block.attrs?.indent : undefined,
              );
              const cellWordLayout = getWordLayoutConfig(info.block);

              const intersectingLines = findLinesIntersectingRange(info.block, info.measure, from, to);

              intersectingLines.forEach(({ line, index }) => {
                if (index < info.startLine || index >= info.endLine) {
                  return;
                }
                const range = computeLinePmRange(info.block, line);
                if (range.pmStart == null || range.pmEnd == null) return;
                const sliceFrom = Math.max(range.pmStart, from);
                const sliceTo = Math.min(range.pmEnd, to);
                if (sliceFrom >= sliceTo) return;

                const charOffsetFrom = pmPosToCharOffset(info.block, line, sliceFrom);
                const charOffsetTo = pmPosToCharOffset(info.block, line, sliceTo);
                const availableWidth = Math.max(1, cellMeasure.width - padding.left - padding.right);
                const startX = mapPmToX(info.block, line, charOffsetFrom, availableWidth, alignmentOverride);
                const endX = mapPmToX(info.block, line, charOffsetTo, availableWidth, alignmentOverride);

                // Calculate text indent using shared utility
                const isFirstLine = index === info.startLine;
                const textIndentAdjust = calculateTextStartIndent({
                  isFirstLine,
                  isListItem: cellIsListItem,
                  markerWidth: paragraphMarkerWidth,
                  markerTextWidth: info.measure?.marker?.markerTextWidth ?? undefined,
                  paraIndentLeft: cellIndent.left,
                  firstLineIndent: cellIndent.firstLine,
                  hangingIndent: cellIndent.hanging,
                  wordLayout: cellWordLayout,
                });

                const rectX = fragment.x + cellX + padding.left + textIndentAdjust + Math.min(startX, endX);
                const rectWidth = Math.max(
                  1,
                  Math.min(Math.abs(endX - startX), line.width), // clamp to line width to prevent runaway widths
                );
                const lineOffset =
                  lineHeightBeforeIndex(info.measure, index) - lineHeightBeforeIndex(info.measure, info.startLine);
                const rectY = fragment.y + rowOffset + blockTopCursor + lineOffset;

                rects.push({
                  x: rectX,
                  y: rectY + pageTopY,
                  width: rectWidth,
                  height: line.lineHeight,
                  pageIndex,
                });
              });

              blockTopCursor += info.height;
            });
          }

          return rowOffset + rowHeight;
        };

        let rowCursor = 0;

        const repeatHeaderCount = tableFragment.repeatHeaderCount ?? 0;
        for (let r = 0; r < repeatHeaderCount && r < tableMeasure.rows.length; r += 1) {
          rowCursor = processRow(r, rowCursor);
        }

        for (let r = tableFragment.fromRow; r < tableFragment.toRow && r < tableMeasure.rows.length; r += 1) {
          rowCursor = processRow(r, rowCursor);
        }

        return;
      }

      if (isAtomicFragment(fragment)) {
        const blockIndex = findBlockIndexByFragmentId(blocks, fragment.blockId, { from, to });
        if (blockIndex === -1) return;
        const block = blocks[blockIndex];
        const pmRange = getAtomicPmRange(fragment, block);
        if (!rangesOverlap(pmRange.pmStart, pmRange.pmEnd, from, to)) return;
        rects.push({
          x: fragment.x,
          y: fragment.y + pageTopY,
          width: fragment.width,
          height: fragment.height,
          pageIndex,
        });
      }
    });
  });

  if (SELECTION_DEBUG_ENABLED && debugEntries.length > 0) {
    logSelectionDebug({
      from,
      to,
      entries: debugEntries,
    });
  }

  return rects;
}

export function getFragmentAtPosition(
  layout: Layout,
  blocks: FlowBlock[],
  measures: Measure[],
  pos: number,
): FragmentHit | null {
  // Suppress bridge debug logs

  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    const page = layout.pages[pageIndex];
    for (const fragment of page.fragments) {
      // Debug fragment checks removed to reduce noise

      const blockIndex = findBlockIndexByFragmentId(blocks, fragment.blockId);
      if (blockIndex === -1) {
        continue;
      }
      const block = blocks[blockIndex];
      const measure = measures[blockIndex];
      if (!block || !measure) continue;

      if (fragment.kind === 'para') {
        if (block.kind !== 'paragraph' || measure.kind !== 'paragraph') continue;

        if (fragment.pmStart != null && fragment.pmEnd != null && pos >= fragment.pmStart && pos <= fragment.pmEnd) {
          return {
            fragment,
            block,
            measure,
            pageIndex,
            pageY: 0,
          };
        }
        continue;
      }

      // Handle table fragments - check if position falls within any cell's content
      if (fragment.kind === 'table') {
        if (block.kind !== 'table' || measure.kind !== 'table') continue;

        const tableBlock = block as TableBlock;
        const _tableMeasure = measure as TableMeasure;
        const tableFragment = fragment as TableFragment;

        // Calculate the PM range for this table fragment (rows fromRow to toRow)
        let tableMinPos: number | null = null;
        let tableMaxPos: number | null = null;

        for (let r = tableFragment.fromRow; r < tableFragment.toRow && r < tableBlock.rows.length; r++) {
          const row = tableBlock.rows[r];
          for (const cell of row.cells) {
            const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
            for (const cellBlock of cellBlocks) {
              if (cellBlock?.kind === 'paragraph') {
                const paraBlock = cellBlock as ParagraphBlock;
                for (const run of paraBlock.runs ?? []) {
                  if (run.pmStart != null) {
                    if (tableMinPos === null || run.pmStart < tableMinPos) tableMinPos = run.pmStart;
                    if (tableMaxPos === null || run.pmStart > tableMaxPos) tableMaxPos = run.pmStart;
                  }
                  if (run.pmEnd != null) {
                    if (tableMinPos === null || run.pmEnd < tableMinPos) tableMinPos = run.pmEnd;
                    if (tableMaxPos === null || run.pmEnd > tableMaxPos) tableMaxPos = run.pmEnd;
                  }
                }
              }
            }
          }
        }

        if (tableMinPos != null && tableMaxPos != null && pos >= tableMinPos && pos <= tableMaxPos) {
          return {
            fragment,
            block,
            measure,
            pageIndex,
            pageY: 0,
          };
        }
        continue;
      }

      if (isAtomicFragment(fragment)) {
        const { pmStart, pmEnd } = getAtomicPmRange(fragment, block);
        const start = pmStart ?? pmEnd;
        const end = pmEnd ?? pmStart;
        if (start == null || end == null) {
          continue;
        }
        const rangeStart = Math.min(start, end);
        const rangeEnd = Math.max(start, end);
        if (pos >= rangeStart && pos <= rangeEnd) {
          return {
            fragment,
            block,
            measure,
            pageIndex,
            pageY: 0,
          };
        }
      }
    }
  }
  return null;
}

export function findLinesIntersectingRange(
  block: FlowBlock,
  measure: Measure,
  from: number,
  to: number,
): { line: Line; index: number }[] {
  if (block.kind !== 'paragraph' || measure.kind !== 'paragraph') {
    return [];
  }
  const hits: { line: Line; index: number }[] = [];
  measure.lines.forEach((line: Line, idx: number) => {
    const range = computeLinePmRange(block, line);
    if (range.pmStart == null || range.pmEnd == null) {
      return;
    }
    const intersects = range.pmEnd > from && range.pmStart < to;
    if (intersects) {
      hits.push({ line, index: idx });
    }
  });
  return hits;
}

/**
 * Computes the ProseMirror position range for a line within a paragraph block.
 *
 * This function calculates the start and end PM positions by iterating through all runs
 * that contribute to the line, handling partial runs at line boundaries and accounting
 * for various run types (text, images, breaks, annotations).
 *
 * **Empty Run Handling (SD-1108 Fix):**
 * Unlike `pmPosToCharOffset` which skips empty runs during position-to-character mapping,
 * this function intentionally PRESERVES empty runs to support cursor positioning in
 * zero-width content like empty table cells. Empty runs carry PM position metadata that
 * enables click-to-position mapping even when there's no visible text.
 *
 * **Why the difference?**
 * - `computeLinePmRange`: Used for spatial operations (click mapping, selection highlighting)
 *   where we need to know the PM range of ALL content, including zero-width positions.
 * - `pmPosToCharOffset`: Used for text measurement where only visible characters matter.
 *   Empty runs contribute no pixels and should be skipped during character-based calculations.
 *
 * **Algorithm:**
 * 1. Filter out atomic runs (images, line breaks, field annotations) - they have no text length
 * 2. For each text run in the line:
 *    a. If the run is empty (length 0), preserve its PM positions for cursor support
 *    b. If the run has text, calculate PM positions based on character offsets
 *    c. Handle partial runs (first/last in line) by adjusting offsets
 * 3. Return the accumulated PM range
 *
 * **Edge Cases Handled:**
 * - Empty runs (zero text length but valid PM positions) - PRESERVED for SD-1108
 * - Atomic runs (images, breaks) - skipped, don't contribute to text range
 * - Runs with missing PM data - skipped with warning logged
 * - Runs with invalid PM positions (negative, Infinity, NaN) - logged as warnings
 * - Partial runs at line boundaries - offset calculations applied
 *
 * @param block - The flow block to compute PM range for (must be a paragraph block)
 * @param line - The line specification including run range (fromRun to toRun) and character offsets
 * @returns Object containing pmStart and pmEnd positions, or empty object if block is not a paragraph
 *
 * @example
 * ```typescript
 * // Normal text run
 * const range = computeLinePmRange(paragraphBlock, line);
 * // { pmStart: 10, pmEnd: 25 }
 *
 * // Empty table cell (SD-1108 fix)
 * const emptyRange = computeLinePmRange(emptyParagraphBlock, line);
 * // { pmStart: 15, pmEnd: 15 } - zero-width but valid for cursor positioning
 * ```
 *
 * @see pmPosToCharOffset - Related function that skips empty runs during character offset calculation
 */
export function computeLinePmRange(block: FlowBlock, line: Line): { pmStart?: number; pmEnd?: number } {
  return computeLinePmRangeUnified(block, line);
}

/**
 * Convert a ProseMirror position to a character offset within a line.
 *
 * This function performs ratio-based interpolation to handle cases where the PM position
 * range doesn't match the text length (e.g., when a run has formatting marks or when
 * there are position gaps between runs due to wrapper nodes).
 *
 * Algorithm:
 * 1. Iterate through runs in the line
 * 2. For each run, calculate its PM range and character count
 * 3. If pmPos falls within the run's PM range:
 *    - Use ratio interpolation: (pmPos - runStart) / runPmRange * runCharCount
 *    - This handles cases where PM positions don't align 1:1 with characters
 * 4. Return the accumulated character offset
 *
 * Edge Cases:
 * - Position before line start: Returns 0
 * - Position after line end: Returns total character count of the line
 * - Empty runs (images, breaks): Skipped, don't contribute to character count
 * - Runs with missing PM data: Skipped
 * - Zero-length PM range: Returns current accumulated offset without adding
 *
 * Performance:
 * - Time complexity: O(n) where n is the number of runs in the line
 * - Space complexity: O(1)
 *
 * @param block - The paragraph block containing the line
 * @param line - The line containing the position
 * @param pmPos - The ProseMirror position to convert
 * @returns Character offset from start of line (0-based), or 0 if position not found
 *
 * @example
 * ```typescript
 * // Run with PM range [10, 15] containing "Hello" (5 chars)
 * // pmPos = 12 should map to character offset 2 within the run
 * const offset = pmPosToCharOffset(block, line, 12);
 * // offset = 2 (ratio: (12-10)/(15-10) * 5 = 2/5 * 5 = 2)
 * ```
 */
export function pmPosToCharOffset(block: FlowBlock, line: Line, pmPos: number): number {
  if (block.kind !== 'paragraph') return 0;

  let charOffset = 0;

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const run = block.runs[runIndex];
    if (!run) continue;

    const text =
      'src' in run || run.kind === 'lineBreak' || run.kind === 'break' || run.kind === 'fieldAnnotation'
        ? ''
        : (run.text ?? '');
    const runTextLength = text.length;
    const runPmStart = run.pmStart ?? null;
    const runPmEnd = run.pmEnd ?? (runPmStart != null ? runPmStart + runTextLength : null);

    if (runPmStart == null || runPmEnd == null || runTextLength === 0) continue;

    const isFirstRun = runIndex === line.fromRun;
    const isLastRun = runIndex === line.toRun;
    const lineStartChar = isFirstRun ? line.fromChar : 0;
    const lineEndChar = isLastRun ? line.toChar : runTextLength;
    const runSliceCharCount = lineEndChar - lineStartChar;

    // Calculate PM positions for this slice using ratio-based mapping
    // This handles cases where run's PM range doesn't equal its text length
    const runPmRange = runPmEnd - runPmStart;
    const runSlicePmStart = runPmStart + (lineStartChar / runTextLength) * runPmRange;
    const runSlicePmEnd = runPmStart + (lineEndChar / runTextLength) * runPmRange;

    // Check if pmPos falls within this run's PM range
    if (pmPos >= runSlicePmStart && pmPos <= runSlicePmEnd) {
      // Position is within this run - use ratio to calculate character offset
      const runSlicePmRange = runSlicePmEnd - runSlicePmStart;
      if (runSlicePmRange > 0) {
        const pmOffsetInSlice = pmPos - runSlicePmStart;
        const charOffsetInSlice = Math.round((pmOffsetInSlice / runSlicePmRange) * runSliceCharCount);
        const result = charOffset + Math.min(charOffsetInSlice, runSliceCharCount);
        const runText = text;
        const offsetInRun = result - charOffset - (isFirstRun ? 0 : 0);
        logSelectionMapDebug({
          kind: 'pmPosToCharOffset-hit',
          blockId: block.id,
          pmPos,
          runIndex,
          lineFromRun: line.fromRun,
          lineToRun: line.toRun,
          runPmStart,
          runPmEnd,
          runSlicePmStart,
          runSlicePmEnd,
          runSliceCharCount,
          pmOffsetInSlice,
          charOffsetInSlice,
          result,
          runTextPreview: runText.slice(Math.max(0, offsetInRun - 10), Math.min(runText.length, offsetInRun + 10)),
        });
        return result;
      }
      logSelectionMapDebug({
        kind: 'pmPosToCharOffset-zero-range',
        blockId: block.id,
        pmPos,
        runIndex,
      });
      return charOffset;
    }

    // Position is after this run - add this run's character count and continue
    if (pmPos > runSlicePmEnd) {
      charOffset += runSliceCharCount;
    }
  }

  // If we didn't find the position in any run, return the total character count
  // (position is at or past the end of the line)
  logSelectionMapDebug({
    kind: 'pmPosToCharOffset-fallback',
    blockId: block.id,
    pmPos,
    lineFromRun: line.fromRun,
    lineToRun: line.toRun,
    result: charOffset,
  });
  return charOffset;
}

const determineColumn = (layout: Layout, fragmentX: number): number => {
  const columns = layout.columns;
  if (!columns || columns.count <= 1) return 0;
  const usableWidth = layout.pageSize.w - columns.gap * (columns.count - 1);
  const columnWidth = usableWidth / columns.count;
  const span = columnWidth + columns.gap;
  const relative = fragmentX;
  const raw = Math.floor(relative / Math.max(span, 1));
  return Math.max(0, Math.min(columns.count - 1, raw));
};

/**
 * Finds the line index at a given Y offset within a paragraph measure.
 *
 * This function searches within a specified range of lines to determine which line
 * contains the given Y coordinate. It validates bounds to prevent out-of-bounds
 * access in case of corrupted layout data.
 *
 * @param measure - The paragraph measure containing line data
 * @param offsetY - The Y offset in pixels to search for
 * @param fromLine - The starting line index (inclusive)
 * @param toLine - The ending line index (exclusive)
 * @returns The line index containing the Y offset, or null if invalid
 *
 * @throws Never throws - returns null for invalid inputs
 */
const findLineIndexAtY = (measure: Measure, offsetY: number, fromLine: number, toLine: number): number | null => {
  if (measure.kind !== 'paragraph') return null;

  // Validate bounds to prevent out-of-bounds access
  const lineCount = measure.lines.length;
  if (fromLine < 0 || toLine > lineCount || fromLine >= toLine) {
    return null;
  }

  let cursor = 0;
  // Only search within the fragment's line range
  for (let i = fromLine; i < toLine; i += 1) {
    const line = measure.lines[i];
    // Guard against undefined lines (defensive check for corrupted data)
    if (!line) return null;

    const next = cursor + line.lineHeight;
    if (offsetY >= cursor && offsetY < next) {
      return i; // Return absolute line index within measure
    }
    cursor = next;
  }
  // If beyond all lines, return the last line in the fragment
  return toLine - 1;
};

const lineHeightBeforeIndex = (measure: Measure, absoluteLineIndex: number): number => {
  if (measure.kind !== 'paragraph') return 0;
  let height = 0;
  for (let i = 0; i < absoluteLineIndex; i += 1) {
    height += measure.lines[i]?.lineHeight ?? 0;
  }
  return height;
};

/**
 * Maps an X coordinate within a line to a ProseMirror position.
 *
 * This function performs spatial-to-logical position mapping for click-to-position
 * operations. It uses Canvas-based text measurement for pixel-perfect accuracy and
 * handles RTL text, justified alignment, and complex formatting.
 *
 * Algorithm:
 * 1. Validate the block is a paragraph and has valid PM range data
 * 2. Use findCharacterAtX to find the character offset at the given X coordinate
 * 3. For RTL text, reverse the character offset within the line
 * 4. Convert the character offset to a ProseMirror position
 *
 * RTL Handling:
 * - RTL text renders right-to-left but character offsets are still left-to-right
 * - The function reverses the character offset to match visual position
 * - Example: In a 10-character RTL line, visual position 2 maps to character offset 8
 *
 * @param block - The paragraph block containing the line
 * @param line - The line to map within (must be from a paragraph block)
 * @param x - The X coordinate in pixels from the start of the line (fragment-local space)
 * @param isRTL - Whether the block has right-to-left text direction
 * @param availableWidthOverride - Optional available width for justified text calculation
 *   (fragment width minus paragraph indents). When provided, ensures justify spacing
 *   matches the painter's rendering.
 * @param alignmentOverride - Optional alignment override (e.g., 'left' for list items)
 * @returns ProseMirror position at the X coordinate, or null if mapping fails
 *
 * @example
 * ```typescript
 * // LTR text: Click at x=50 in a line starting at PM position 10
 * const pos = mapPointToPm(block, line, 50, false, 200);
 * // Returns: 15 (character at pixel 50)
 *
 * // RTL text: Same click in RTL reverses the mapping
 * const posRTL = mapPointToPm(block, line, 50, true, 200);
 * // Returns: 25 (reversed character position)
 * ```
 */
const mapPointToPm = (
  block: FlowBlock,
  line: Line,
  x: number,
  isRTL: boolean,
  availableWidthOverride?: number,
  alignmentOverride?: string,
): number | null => {
  if (block.kind !== 'paragraph') return null;
  const range = computeLinePmRange(block, line);
  if (range.pmStart == null || range.pmEnd == null) return null;

  // Use shared text measurement utility for pixel-perfect accuracy
  const result = findCharacterAtX(block, line, x, range.pmStart, availableWidthOverride, alignmentOverride);

  // Handle RTL text by reversing the position
  let pmPosition = result.pmPosition;
  if (isRTL) {
    const charOffset = result.charOffset;
    const charsInLine = Math.max(1, line.toChar - line.fromChar);
    const reversedOffset = Math.max(0, Math.min(charsInLine, charsInLine - charOffset));
    pmPosition = charOffsetToPm(block, line, reversedOffset, range.pmStart);
  }

  return pmPosition;
};

/**
 * Maps a character offset within a line to an X coordinate.
 *
 * This function performs logical-to-spatial position mapping for selection highlighting
 * and caret positioning. It uses Canvas-based text measurement for pixel-perfect accuracy
 * and accounts for paragraph indents, justified alignment, and complex formatting.
 *
 * The function calculates available width by subtracting left and right paragraph indents
 * from the fragment width, ensuring that text measurements match the painter's rendering
 * constraints. This available width is critical for justified text, where extra spacing
 * is distributed proportionally.
 *
 * @param block - The paragraph block containing the line
 * @param line - The line to map within
 * @param offset - Character offset from the start of the line (0-based)
 * @param fragmentWidth - The total width of the fragment containing this line (in pixels)
 * @param alignmentOverride - Optional alignment override (e.g., 'left' for list items)
 * @returns X coordinate in pixels from the start of the line, or 0 if inputs are invalid
 *
 * @example
 * ```typescript
 * // Measure position of character 5 in a 200px wide fragment
 * const x = mapPmToX(block, line, 5, 200);
 * // Returns: 47 (pixels from line start)
 * ```
 */
const mapPmToX = (
  block: FlowBlock,
  line: Line,
  offset: number,
  fragmentWidth: number,
  alignmentOverride?: string,
): number => {
  if (fragmentWidth <= 0 || line.width <= 0) return 0;

  // Type guard: Validate indent structure and ensure numeric values
  let paraIndentLeft = 0;
  let paraIndentRight = 0;
  let effectiveLeft = 0;
  if (block.kind === 'paragraph') {
    const indentLeft = typeof block.attrs?.indent?.left === 'number' ? block.attrs.indent.left : 0;
    const indentRight = typeof block.attrs?.indent?.right === 'number' ? block.attrs.indent.right : 0;
    paraIndentLeft = Number.isFinite(indentLeft) ? indentLeft : 0;
    paraIndentRight = Number.isFinite(indentRight) ? indentRight : 0;
    effectiveLeft = paraIndentLeft;
    const wl = getWordLayoutConfig(block);
    const isListParagraph = Boolean(block.attrs?.numberingProperties) || Boolean(wl?.marker);
    if (isListParagraph) {
      const explicitTextStart =
        typeof wl?.marker?.textStartX === 'number' && Number.isFinite(wl.marker.textStartX)
          ? wl.marker.textStartX
          : typeof wl?.textStartPx === 'number' && Number.isFinite(wl.textStartPx)
            ? wl.textStartPx
            : undefined;
      if (typeof explicitTextStart === 'number' && explicitTextStart > paraIndentLeft) {
        effectiveLeft = explicitTextStart;
      }
    }
  }

  const totalIndent = effectiveLeft + paraIndentRight;
  const availableWidth = Math.max(0, fragmentWidth - totalIndent);

  // Validation: Warn when indents exceed fragment width (potential layout issue)
  if (totalIndent > fragmentWidth) {
    console.warn(
      `[mapPmToX] Paragraph indents (${totalIndent}px) exceed fragment width (${fragmentWidth}px) ` +
        `for block ${block.id}. This may indicate a layout miscalculation. ` +
        `Available width clamped to 0.`,
    );
  }

  // Use shared text measurement utility for pixel-perfect accuracy
  return measureCharacterX(block, line, offset, availableWidth, alignmentOverride);
};

const _sliceRunsForLine = (block: FlowBlock, line: Line): Run[] => {
  const result: Run[] = [];

  if (block.kind !== 'paragraph') return result;

  for (let runIndex = line.fromRun; runIndex <= line.toRun; runIndex += 1) {
    const run = block.runs[runIndex];
    if (!run) continue;

    if (run.kind === 'tab') {
      result.push(run);
      continue;
    }

    // FIXED: ImageRun handling - images are atomic units, no slicing needed
    if ('src' in run) {
      result.push(run);
      continue;
    }

    // LineBreakRun handling - line breaks are atomic units, no slicing needed
    if (run.kind === 'lineBreak') {
      result.push(run);
      continue;
    }

    // BreakRun handling - breaks are atomic units, no slicing needed
    if (run.kind === 'break') {
      result.push(run);
      continue;
    }

    // FieldAnnotationRun handling - field annotations are atomic units, no slicing needed
    if (run.kind === 'fieldAnnotation') {
      result.push(run);
      continue;
    }

    const text = run.text ?? '';
    const isFirstRun = runIndex === line.fromRun;
    const isLastRun = runIndex === line.toRun;

    if (isFirstRun || isLastRun) {
      const start = isFirstRun ? line.fromChar : 0;
      const end = isLastRun ? line.toChar : text.length;
      const slice = text.slice(start, end);
      const pmStart =
        run.pmStart != null ? run.pmStart + start : run.pmEnd != null ? run.pmEnd - (text.length - start) : undefined;
      const pmEnd =
        run.pmStart != null ? run.pmStart + end : run.pmEnd != null ? run.pmEnd - (text.length - end) : undefined;
      result.push({
        ...run,
        text: slice,
        pmStart,
        pmEnd,
      });
    } else {
      result.push(run);
    }
  }

  return result;
};

const isRtlBlock = (block: FlowBlock): boolean => {
  if (block.kind !== 'paragraph') return false;
  const attrs = block.attrs as Record<string, unknown> | undefined;
  if (!attrs) return false;
  const directionAttr = attrs.direction ?? attrs.dir ?? attrs.textDirection;
  if (typeof directionAttr === 'string' && directionAttr.toLowerCase() === 'rtl') {
    return true;
  }
  if (typeof attrs.rtl === 'boolean') {
    return attrs.rtl;
  }
  return false;
};
