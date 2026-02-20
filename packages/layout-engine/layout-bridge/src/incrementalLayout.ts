import type {
  FlowBlock,
  Layout,
  Measure,
  HeaderFooterLayout,
  SectionMetadata,
  ParagraphBlock,
  ColumnLayout,
} from '@superdoc/contracts';
import {
  layoutDocument,
  layoutHeaderFooter,
  type LayoutOptions,
  type HeaderFooterConstraints,
  computeDisplayPageNumber,
  resolvePageNumberTokens,
  type NumberingContext,
} from '@superdoc/layout-engine';
import { remeasureParagraph } from './remeasure';
import { computeDirtyRegions } from './diff';
import { MeasureCache } from './cache';
import { layoutHeaderFooterWithCache, HeaderFooterLayoutCache, type HeaderFooterBatch } from './layoutHeaderFooter';
import { FeatureFlags } from './featureFlags';
import { PageTokenLogger, HeaderFooterCacheLogger, globalMetrics } from './instrumentation';
import { HeaderFooterCacheState, invalidateHeaderFooterCache } from './cacheInvalidation';

export type HeaderFooterMeasureFn = (
  block: FlowBlock,
  constraints: { maxWidth: number; maxHeight: number },
) => Promise<Measure>;

export type HeaderFooterLayoutResult = {
  kind: 'header' | 'footer';
  type: keyof HeaderFooterBatch;
  layout: HeaderFooterLayout;
  blocks: FlowBlock[];
  measures: Measure[];
};

export type IncrementalLayoutResult = {
  layout: Layout;
  measures: Measure[];
  dirty: ReturnType<typeof computeDirtyRegions>;
  headers?: HeaderFooterLayoutResult[];
  footers?: HeaderFooterLayoutResult[];
  /**
   * Extra blocks/measures that should be added to the painter's lookup table.
   * Used for rendering non-body fragments injected into the layout (e.g., footnotes).
   */
  extraBlocks?: FlowBlock[];
  extraMeasures?: Measure[];
};

export const measureCache = new MeasureCache<Measure>();
const headerMeasureCache = new HeaderFooterLayoutCache();
const headerFooterCacheState = new HeaderFooterCacheState();

const layoutDebugEnabled =
  typeof process !== 'undefined' && typeof process.env !== 'undefined' && Boolean(process.env.SD_DEBUG_LAYOUT);

const perfLog = (...args: unknown[]): void => {
  if (!layoutDebugEnabled) return;

  console.log(...args);
};

type FootnoteReference = { id: string; pos: number };
type FootnotesLayoutInput = {
  refs: FootnoteReference[];
  blocksById: Map<string, FlowBlock[]>;
  gap?: number;
  topPadding?: number;
  dividerHeight?: number;
  separatorSpacingBefore?: number;
};

const isFootnotesLayoutInput = (value: unknown): value is FootnotesLayoutInput => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.refs)) return false;
  if (!(v.blocksById instanceof Map)) return false;
  return true;
};

const findPageIndexForPos = (layout: Layout, pos: number): number | null => {
  if (!Number.isFinite(pos)) return null;
  const fallbackRanges: Array<{ pageIndex: number; minStart: number; maxEnd: number } | null> = [];
  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex++) {
    const page = layout.pages[pageIndex];
    let minStart: number | null = null;
    let maxEnd: number | null = null;
    for (const fragment of page.fragments) {
      const pmStart = (fragment as { pmStart?: number }).pmStart;
      const pmEnd = (fragment as { pmEnd?: number }).pmEnd;
      if (pmStart == null || pmEnd == null) continue;
      if (minStart == null || pmStart < minStart) minStart = pmStart;
      if (maxEnd == null || pmEnd > maxEnd) maxEnd = pmEnd;
      if (pos >= pmStart && pos <= pmEnd) {
        return pageIndex;
      }
    }
    fallbackRanges[pageIndex] = minStart != null && maxEnd != null ? { pageIndex, minStart, maxEnd } : null;
  }

  // Fallback: pick the closest page range when exact containment isn't found.
  // This helps when pm ranges are sparse or use slightly different boundary semantics.
  let best: { pageIndex: number; distance: number } | null = null;
  for (const entry of fallbackRanges) {
    if (!entry) continue;
    const distance = pos < entry.minStart ? entry.minStart - pos : pos > entry.maxEnd ? pos - entry.maxEnd : 0;
    if (!best || distance < best.distance) {
      best = { pageIndex: entry.pageIndex, distance };
    }
  }
  if (best) return best.pageIndex;
  if (layout.pages.length > 0) return layout.pages.length - 1;
  return null;
};

const footnoteColumnKey = (pageIndex: number, columnIndex: number): string => `${pageIndex}:${columnIndex}`;

const COLUMN_EPSILON = 0.01;

type NormalizedColumns = ColumnLayout & { width: number };
type PageColumns = NormalizedColumns & { left: number; contentWidth: number };

const normalizeColumnsForFootnotes = (input: ColumnLayout | undefined, contentWidth: number): NormalizedColumns => {
  const rawCount = Number.isFinite(input?.count) ? Math.floor(input!.count) : 1;
  const count = Math.max(1, rawCount || 1);
  const gap = Math.max(0, input?.gap ?? 0);
  const totalGap = gap * (count - 1);
  const width = (contentWidth - totalGap) / count;

  if (!Number.isFinite(width) || width <= COLUMN_EPSILON) {
    return {
      count: 1,
      gap: 0,
      width: Math.max(0, contentWidth),
    };
  }

  return { count, gap, width };
};

const resolveSectionColumnsByIndex = (options: LayoutOptions, blocks?: FlowBlock[]): Map<number, ColumnLayout> => {
  const result = new Map<number, ColumnLayout>();
  let activeColumns: ColumnLayout = options.columns ?? { count: 1, gap: 0 };

  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      if (block.kind !== 'sectionBreak') continue;
      const sectionIndexRaw = (block.attrs as { sectionIndex?: number } | undefined)?.sectionIndex;
      const sectionIndex =
        typeof sectionIndexRaw === 'number' && Number.isFinite(sectionIndexRaw) ? sectionIndexRaw : result.size;
      if (block.columns) {
        activeColumns = { count: block.columns.count, gap: block.columns.gap };
      }
      result.set(sectionIndex, { ...activeColumns });
    }
  }

  if (result.size === 0) {
    result.set(0, { ...activeColumns });
  }

  return result;
};

const resolvePageColumns = (layout: Layout, options: LayoutOptions, blocks?: FlowBlock[]): Map<number, PageColumns> => {
  const sectionColumns = resolveSectionColumnsByIndex(options, blocks);
  const result = new Map<number, PageColumns>();

  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    const page = layout.pages[pageIndex];
    const pageSize = page.size ?? layout.pageSize ?? DEFAULT_PAGE_SIZE;
    const marginLeft = normalizeMargin(
      page.margins?.left,
      normalizeMargin(options.margins?.left, DEFAULT_MARGINS.left),
    );
    const marginRight = normalizeMargin(
      page.margins?.right,
      normalizeMargin(options.margins?.right, DEFAULT_MARGINS.right),
    );
    const contentWidth = pageSize.w - (marginLeft + marginRight);
    const sectionIndex = page.sectionIndex ?? 0;
    const columnsConfig = sectionColumns.get(sectionIndex) ?? options.columns ?? { count: 1, gap: 0 };
    const normalized = normalizeColumnsForFootnotes(columnsConfig, contentWidth);
    result.set(pageIndex, { ...normalized, left: marginLeft, contentWidth });
  }

  return result;
};

const findFragmentForPos = (
  page: Layout['pages'][number],
  pos: number,
): Layout['pages'][number]['fragments'][number] | null => {
  for (const fragment of page.fragments) {
    const pmStart = (fragment as { pmStart?: number }).pmStart;
    const pmEnd = (fragment as { pmEnd?: number }).pmEnd;
    if (pmStart == null || pmEnd == null) continue;
    if (pos >= pmStart && pos <= pmEnd) {
      return fragment;
    }
  }
  return null;
};

const assignFootnotesToColumns = (
  layout: Layout,
  refs: FootnoteReference[],
  pageColumns: Map<number, PageColumns>,
): Map<number, Map<number, string[]>> => {
  const result = new Map<number, Map<number, string[]>>();
  const seenByColumn = new Map<string, Set<string>>();

  for (const ref of refs) {
    const pageIndex = findPageIndexForPos(layout, ref.pos);
    if (pageIndex == null) continue;
    const columns = pageColumns.get(pageIndex);
    const page = layout.pages[pageIndex];
    let columnIndex = 0;

    if (columns && columns.count > 1 && page) {
      const fragment = findFragmentForPos(page, ref.pos);
      if (fragment && typeof fragment.x === 'number') {
        const columnStride = columns.width + columns.gap;
        const rawIndex = columnStride > 0 ? Math.floor((fragment.x - columns.left) / columnStride) : 0;
        columnIndex = Math.max(0, Math.min(columns.count - 1, rawIndex));
      }
    }

    const key = footnoteColumnKey(pageIndex, columnIndex);
    let seen = seenByColumn.get(key);
    if (!seen) {
      seen = new Set();
      seenByColumn.set(key, seen);
    }
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);

    const pageMap = result.get(pageIndex) ?? new Map<number, string[]>();
    const list = pageMap.get(columnIndex) ?? [];
    list.push(ref.id);
    pageMap.set(columnIndex, list);
    result.set(pageIndex, pageMap);
  }

  return result;
};

const resolveFootnoteMeasurementWidth = (options: LayoutOptions, blocks?: FlowBlock[]): number => {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const margins = {
    right: normalizeMargin(options.margins?.right, DEFAULT_MARGINS.right),
    left: normalizeMargin(options.margins?.left, DEFAULT_MARGINS.left),
  };
  let width = pageSize.w - (margins.left + margins.right);
  let activeColumns: ColumnLayout = options.columns ?? { count: 1, gap: 0 };
  let activePageSize = pageSize;
  let activeMargins = { ...margins };

  const resolveColumnWidth = (): number => {
    const contentWidth = activePageSize.w - (activeMargins.left + activeMargins.right);
    const normalized = normalizeColumnsForFootnotes(activeColumns, contentWidth);
    return normalized.width;
  };

  width = resolveColumnWidth();

  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      if (block.kind !== 'sectionBreak') continue;
      activePageSize = block.pageSize ?? activePageSize;
      activeMargins = {
        right: normalizeMargin(block.margins?.right, activeMargins.right),
        left: normalizeMargin(block.margins?.left, activeMargins.left),
      };
      if (block.columns) {
        activeColumns = { count: block.columns.count, gap: block.columns.gap };
      }
      const w = resolveColumnWidth();
      if (w > 0 && w < width) width = w;
    }
  }

  if (!Number.isFinite(width) || width <= 0) return 0;
  return width;
};

const MIN_FOOTNOTE_BODY_HEIGHT = 1;
const DEFAULT_FOOTNOTE_SEPARATOR_SPACING_BEFORE = 12;
const MAX_FOOTNOTE_LAYOUT_PASSES = 4;

const computeMaxFootnoteReserve = (layoutForPages: Layout, pageIndex: number, baseReserve = 0): number => {
  const page = layoutForPages.pages?.[pageIndex];
  if (!page) return 0;
  const pageSize = page.size ?? layoutForPages.pageSize ?? DEFAULT_PAGE_SIZE;
  const topMargin = normalizeMargin(page.margins?.top, DEFAULT_MARGINS.top);
  const bottomWithReserve = normalizeMargin(page.margins?.bottom, DEFAULT_MARGINS.bottom);
  const baseReserveSafe = Number.isFinite(baseReserve) ? Math.max(0, baseReserve) : 0;
  const bottomMargin = Math.max(0, bottomWithReserve - baseReserveSafe);
  const availableForBody = pageSize.h - topMargin - bottomMargin;
  if (!Number.isFinite(availableForBody)) return 0;
  return Math.max(0, availableForBody - MIN_FOOTNOTE_BODY_HEIGHT);
};

type FootnoteRange =
  | {
      kind: 'paragraph';
      blockId: string;
      fromLine: number;
      toLine: number;
      totalLines: number;
      height: number;
      spacingAfter: number;
    }
  | {
      kind: 'list-item';
      blockId: string;
      itemId: string;
      fromLine: number;
      toLine: number;
      totalLines: number;
      height: number;
      spacingAfter: number;
    }
  | {
      kind: 'table' | 'image' | 'drawing';
      blockId: string;
      height: number;
    };

type FootnoteSlice = {
  id: string;
  pageIndex: number;
  columnIndex: number;
  isContinuation: boolean;
  ranges: FootnoteRange[];
  totalHeight: number;
};

type FootnoteLayoutPlan = {
  slicesByPage: Map<number, FootnoteSlice[]>;
  reserves: number[];
  hasContinuationByColumn: Map<string, boolean>;
  separatorSpacingBefore: number;
};

const sumLineHeights = (
  lines: Array<{ lineHeight?: number }> | undefined,
  fromLine: number,
  toLine: number,
): number => {
  if (!lines || fromLine >= toLine) return 0;
  let total = 0;
  for (let i = fromLine; i < toLine; i += 1) {
    total += lines[i]?.lineHeight ?? 0;
  }
  return total;
};

const getParagraphSpacingAfter = (block: ParagraphBlock): number => {
  const spacing = block.attrs?.spacing as Record<string, unknown> | undefined;
  const value = spacing?.after ?? spacing?.lineSpaceAfter;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
};

const resolveSeparatorSpacingBefore = (
  rangesByFootnoteId: Map<string, FootnoteRange[]>,
  measuresById: Map<string, Measure>,
  explicitValue: number | undefined,
  fallbackValue: number,
): number => {
  if (typeof explicitValue === 'number' && Number.isFinite(explicitValue)) {
    return Math.max(0, explicitValue);
  }

  for (const ranges of rangesByFootnoteId.values()) {
    for (const range of ranges) {
      if (range.kind === 'paragraph') {
        const measure = measuresById.get(range.blockId);
        if (measure?.kind !== 'paragraph') continue;
        const lineHeight = measure.lines?.[range.fromLine]?.lineHeight ?? measure.lines?.[0]?.lineHeight;
        if (typeof lineHeight === 'number' && Number.isFinite(lineHeight) && lineHeight > 0) {
          return lineHeight;
        }
      }

      if (range.kind === 'list-item') {
        const measure = measuresById.get(range.blockId);
        if (measure?.kind !== 'list') continue;
        const itemMeasure = measure.items.find((item) => item.itemId === range.itemId);
        const lineHeight =
          itemMeasure?.paragraph?.lines?.[range.fromLine]?.lineHeight ?? itemMeasure?.paragraph?.lines?.[0]?.lineHeight;
        if (typeof lineHeight === 'number' && Number.isFinite(lineHeight) && lineHeight > 0) {
          return lineHeight;
        }
      }
    }
  }

  return Math.max(0, fallbackValue);
};

const getRangeRenderHeight = (range: FootnoteRange): number => {
  if (range.kind === 'paragraph' || range.kind === 'list-item') {
    const spacing = range.toLine >= range.totalLines ? range.spacingAfter : 0;
    return range.height + spacing;
  }
  return range.height;
};

const buildFootnoteRanges = (blocks: FlowBlock[], measuresById: Map<string, Measure>): FootnoteRange[] => {
  const ranges: FootnoteRange[] = [];

  blocks.forEach((block) => {
    const measure = measuresById.get(block.id);
    if (!measure) return;

    if (block.kind === 'paragraph') {
      if (measure.kind !== 'paragraph') return;
      const lineCount = measure.lines?.length ?? 0;
      if (lineCount === 0) return;
      ranges.push({
        kind: 'paragraph',
        blockId: block.id,
        fromLine: 0,
        toLine: lineCount,
        totalLines: lineCount,
        height: sumLineHeights(measure.lines, 0, lineCount),
        spacingAfter: getParagraphSpacingAfter(block as ParagraphBlock),
      });
      return;
    }

    if (block.kind === 'list') {
      if (measure.kind !== 'list') return;
      block.items.forEach((item) => {
        const itemMeasure = measure.items.find((entry) => entry.itemId === item.id);
        if (!itemMeasure) return;
        const lineCount = itemMeasure.paragraph.lines?.length ?? 0;
        if (lineCount === 0) return;
        ranges.push({
          kind: 'list-item',
          blockId: block.id,
          itemId: item.id,
          fromLine: 0,
          toLine: lineCount,
          totalLines: lineCount,
          height: sumLineHeights(itemMeasure.paragraph.lines, 0, lineCount),
          spacingAfter: getParagraphSpacingAfter(item.paragraph),
        });
      });
      return;
    }

    if (block.kind === 'table' && measure.kind === 'table') {
      const height = Math.max(0, measure.totalHeight ?? 0);
      if (height > 0) {
        ranges.push({ kind: 'table', blockId: block.id, height });
      }
      return;
    }

    if (block.kind === 'image' && measure.kind === 'image') {
      const height = Math.max(0, measure.height ?? 0);
      if (height > 0) {
        ranges.push({ kind: 'image', blockId: block.id, height });
      }
      return;
    }

    if (block.kind === 'drawing' && measure.kind === 'drawing') {
      const height = Math.max(0, measure.height ?? 0);
      if (height > 0) {
        ranges.push({ kind: 'drawing', blockId: block.id, height });
      }
    }
  });

  return ranges;
};

const splitRangeAtHeight = (
  range: FootnoteRange,
  availableHeight: number,
  measuresById: Map<string, Measure>,
): { fitted: FootnoteRange | null; remaining: FootnoteRange | null } => {
  if (availableHeight <= 0) return { fitted: null, remaining: range };
  if (range.kind !== 'paragraph') {
    return getRangeRenderHeight(range) <= availableHeight
      ? { fitted: range, remaining: null }
      : { fitted: null, remaining: range };
  }

  const measure = measuresById.get(range.blockId);
  if (!measure || measure.kind !== 'paragraph' || !measure.lines) {
    return getRangeRenderHeight(range) <= availableHeight
      ? { fitted: range, remaining: null }
      : { fitted: null, remaining: range };
  }

  let accumulatedHeight = 0;
  let splitLine = range.fromLine;

  for (let i = range.fromLine; i < range.toLine; i += 1) {
    const lineHeight = measure.lines[i]?.lineHeight ?? 0;
    if (accumulatedHeight + lineHeight > availableHeight) break;
    accumulatedHeight += lineHeight;
    splitLine = i + 1;
  }

  if (splitLine === range.fromLine) {
    return { fitted: null, remaining: range };
  }

  const fitted: FootnoteRange = {
    ...range,
    toLine: splitLine,
    height: sumLineHeights(measure.lines, range.fromLine, splitLine),
  };

  if (splitLine >= range.toLine) {
    return getRangeRenderHeight(fitted) <= availableHeight
      ? { fitted, remaining: null }
      : { fitted: null, remaining: range };
  }

  const remaining: FootnoteRange = {
    ...range,
    fromLine: splitLine,
    height: sumLineHeights(measure.lines, splitLine, range.toLine),
  };
  return { fitted, remaining };
};

const forceFitFirstRange = (
  range: FootnoteRange,
  measuresById: Map<string, Measure>,
): { fitted: FootnoteRange | null; remaining: FootnoteRange | null } => {
  if (range.kind !== 'paragraph') {
    return { fitted: range, remaining: null };
  }

  const measure = measuresById.get(range.blockId);
  if (!measure || measure.kind !== 'paragraph' || !measure.lines?.length) {
    return { fitted: range, remaining: null };
  }

  const nextLine = Math.min(range.fromLine + 1, range.toLine);
  const fitted: FootnoteRange = {
    ...range,
    toLine: nextLine,
    height: sumLineHeights(measure.lines, range.fromLine, nextLine),
  };

  if (nextLine >= range.toLine) {
    return { fitted, remaining: null };
  }

  const remaining: FootnoteRange = {
    ...range,
    fromLine: nextLine,
    height: sumLineHeights(measure.lines, nextLine, range.toLine),
  };

  return { fitted, remaining };
};

const fitFootnoteContent = (
  id: string,
  inputRanges: FootnoteRange[],
  availableHeight: number,
  pageIndex: number,
  columnIndex: number,
  isContinuation: boolean,
  measuresById: Map<string, Measure>,
  forceFirstRange: boolean,
): { slice: FootnoteSlice; remainingRanges: FootnoteRange[] } => {
  const fittedRanges: FootnoteRange[] = [];
  let remainingRanges: FootnoteRange[] = [];
  let usedHeight = 0;
  const maxHeight = Math.max(0, availableHeight);

  for (let index = 0; index < inputRanges.length; index += 1) {
    const range = inputRanges[index];
    const remainingSpace = maxHeight - usedHeight;
    const rangeHeight = getRangeRenderHeight(range);

    if (rangeHeight <= remainingSpace) {
      fittedRanges.push(range);
      usedHeight += rangeHeight;
      continue;
    }

    if (range.kind === 'paragraph') {
      const split = splitRangeAtHeight(range, remainingSpace, measuresById);
      if (split.fitted && getRangeRenderHeight(split.fitted) <= remainingSpace) {
        fittedRanges.push(split.fitted);
        usedHeight += getRangeRenderHeight(split.fitted);
      }
      if (split.remaining) {
        remainingRanges = [split.remaining, ...inputRanges.slice(index + 1)];
      } else {
        remainingRanges = inputRanges.slice(index + 1);
      }
      break;
    }

    remainingRanges = [range, ...inputRanges.slice(index + 1)];
    break;
  }

  if (fittedRanges.length === 0 && forceFirstRange && inputRanges.length > 0) {
    const forced = forceFitFirstRange(inputRanges[0], measuresById);
    if (forced.fitted) {
      fittedRanges.push(forced.fitted);
      usedHeight = getRangeRenderHeight(forced.fitted);
      remainingRanges = [];
      if (forced.remaining) {
        remainingRanges.push(forced.remaining);
      }
      remainingRanges.push(...inputRanges.slice(1));
    }
  }

  return {
    slice: {
      id,
      pageIndex,
      columnIndex,
      isContinuation,
      ranges: fittedRanges,
      totalHeight: usedHeight,
    },
    remainingRanges,
  };
};

/**
 * Performs incremental layout of document blocks with header/footer support.
 *
 * This function orchestrates the complete layout pipeline including:
 * - Dirty region detection and selective cache invalidation
 * - Block measurement with caching
 * - Header/footer pre-layout to prevent body content overlap
 * - Document pagination with header/footer height awareness
 * - Page number token resolution with convergence iteration
 * - Final header/footer layout with section-aware numbering
 *
 * The function supports two modes for header/footer specification:
 * 1. **Variant-based** (headerBlocks/footerBlocks): Headers/footers organized by variant type
 *    ('default', 'first', 'even', 'odd'). Used for single-section documents or when all
 *    sections share the same header/footer variants.
 * 2. **Relationship ID-based** (headerBlocksByRId/footerBlocksByRId): Headers/footers organized
 *    by relationship ID. Used for multi-section documents where each section may have unique
 *    headers/footers referenced by their relationship IDs.
 *
 * Both modes can coexist - the function will extract header/footer heights from both sources
 * to ensure body content doesn't overlap with header/footer content.
 *
 * @param previousBlocks - Previous version of flow blocks (used for dirty region detection)
 * @param _previousLayout - Previous layout result (currently unused, reserved for future optimization)
 * @param nextBlocks - Current version of flow blocks to layout
 * @param options - Layout options including page size, margins, columns, and section metadata
 * @param measureBlock - Async function to measure a block's dimensions given constraints
 * @param headerFooter - Optional header/footer configuration with two modes:
 *   - headerBlocks/footerBlocks: Variant-based headers/footers organized by type
 *     ('default', 'first', 'even', 'odd'). Use this for simple documents with consistent
 *     headers/footers across all sections.
 *   - headerBlocksByRId/footerBlocksByRId: Relationship ID-based headers/footers organized
 *     by unique relationship ID (Map<string, FlowBlock[]>). Use this for complex multi-section
 *     documents where each section references specific headers/footers by their relationship IDs.
 *   - constraints: Header/footer layout constraints (width, height)
 *   - measure: Optional custom measurement function for header/footer blocks
 * @returns Layout result containing:
 *   - layout: Final paginated document layout with page breaks and positioning
 *   - measures: Measurements for all blocks (parallel to nextBlocks array)
 *   - dirty: Dirty region information indicating which blocks changed
 *   - headers: Optional array of header layout results (one per variant type)
 *   - footers: Optional array of footer layout results (one per variant type)
 * @throws Error if measurement constraints are invalid (non-positive width or height)
 *
 * @example
 * ```typescript
 * // Single-section document with variant-based headers
 * const result = await incrementalLayout(
 *   previousBlocks,
 *   previousLayout,
 *   nextBlocks,
 *   { pageSize: { w: 612, h: 792 }, margins: { top: 72, right: 72, bottom: 72, left: 72 } },
 *   measureBlock,
 *   {
 *     headerBlocks: {
 *       default: [headerBlock1, headerBlock2],
 *       first: [firstPageHeaderBlock]
 *     },
 *     constraints: { width: 468, height: 72 }
 *   }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Multi-section document with relationship ID-based headers
 * const headersByRId = new Map([
 *   ['rId1', [section1HeaderBlock]],
 *   ['rId2', [section2HeaderBlock]]
 * ]);
 * const result = await incrementalLayout(
 *   previousBlocks,
 *   previousLayout,
 *   nextBlocks,
 *   { pageSize: { w: 612, h: 792 }, sectionMetadata: [...] },
 *   measureBlock,
 *   {
 *     headerBlocksByRId: headersByRId,
 *     constraints: { width: 468, height: 72 }
 *   }
 * );
 * ```
 */
export async function incrementalLayout(
  previousBlocks: FlowBlock[],
  _previousLayout: Layout | null,
  nextBlocks: FlowBlock[],
  options: LayoutOptions,
  measureBlock: (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => Promise<Measure>,
  headerFooter?: {
    headerBlocks?: HeaderFooterBatch;
    footerBlocks?: HeaderFooterBatch;
    headerBlocksByRId?: Map<string, FlowBlock[]>;
    footerBlocksByRId?: Map<string, FlowBlock[]>;
    constraints: HeaderFooterConstraints;
    measure?: HeaderFooterMeasureFn;
  },
  previousMeasures?: Measure[] | null,
): Promise<IncrementalLayoutResult> {
  // Dirty region computation
  const dirtyStart = performance.now();
  const dirty = computeDirtyRegions(previousBlocks, nextBlocks);
  const dirtyTime = performance.now() - dirtyStart;

  if (dirty.deletedBlockIds.length > 0) {
    measureCache.invalidate(dirty.deletedBlockIds);
  }

  // Perf summary emitted at the end of the function.

  const { measurementWidth, measurementHeight } = resolveMeasurementConstraints(options, nextBlocks);

  if (measurementWidth <= 0 || measurementHeight <= 0) {
    throw new Error('incrementalLayout: invalid measurement constraints resolved from options');
  }

  const hasPreviousMeasures = Array.isArray(previousMeasures) && previousMeasures.length === previousBlocks.length;
  const previousConstraints = hasPreviousMeasures ? resolveMeasurementConstraints(options, previousBlocks) : null;
  const canReusePreviousMeasures =
    hasPreviousMeasures &&
    previousConstraints?.measurementWidth === measurementWidth &&
    previousConstraints?.measurementHeight === measurementHeight;
  const previousMeasuresById = canReusePreviousMeasures
    ? new Map(previousBlocks.map((block, index) => [block.id, previousMeasures![index]]))
    : null;

  const measureStart = performance.now();
  const constraints = { maxWidth: measurementWidth, maxHeight: measurementHeight };
  const measures: Measure[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  let reusedMeasures = 0;
  let cacheLookupTime = 0;
  let actualMeasureTime = 0;

  for (const block of nextBlocks) {
    if (block.kind === 'sectionBreak') {
      measures.push({ kind: 'sectionBreak' });
      continue;
    }

    if (canReusePreviousMeasures && dirty.stableBlockIds.has(block.id)) {
      const previousMeasure = previousMeasuresById?.get(block.id);
      if (previousMeasure) {
        measures.push(previousMeasure);
        reusedMeasures++;
        continue;
      }
    }

    // Time the cache lookup (includes hashRuns computation)
    const lookupStart = performance.now();
    const cached = measureCache.get(block, measurementWidth, measurementHeight);
    cacheLookupTime += performance.now() - lookupStart;

    if (cached) {
      measures.push(cached);
      cacheHits++;
      continue;
    }

    // Time the actual DOM measurement
    const measureBlockStart = performance.now();
    const measurement = await measureBlock(block, constraints);
    actualMeasureTime += performance.now() - measureBlockStart;

    measureCache.set(block, measurementWidth, measurementHeight, measurement);
    measures.push(measurement);
    cacheMisses++;
  }
  const measureEnd = performance.now();
  const totalMeasureTime = measureEnd - measureStart;

  perfLog(
    `[Perf] 4.1 Measure all blocks: ${totalMeasureTime.toFixed(2)}ms (${cacheMisses} measured, ${cacheHits} cached, ${reusedMeasures} reused)`,
  );

  // Pre-layout headers to get their actual content heights BEFORE body layout.
  // This prevents header content from overlapping with body content when headers
  // exceed their allocated margin space.
  /**
   * Actual measured header content heights per variant type extracted from pre-layout.
   * Keys correspond to header variant types: 'default', 'first', 'even', 'odd'.
   * Values are the actual content heights in pixels, guaranteed to be finite and non-negative.
   * Undefined if headers are not present.
   */
  let headerContentHeights: Partial<Record<'default' | 'first' | 'even' | 'odd', number>> | undefined;

  /**
   * Actual measured header content heights per relationship ID.
   * Used for multi-section documents where each section may have unique headers.
   * Keys are relationship IDs (e.g., 'rId6', 'rId7').
   * Values are the actual content heights in pixels.
   */
  let headerContentHeightsByRId: Map<string, number> | undefined;

  // Check if we have headers via either headerBlocks (by variant) or headerBlocksByRId (by relationship ID)
  const hasHeaderBlocks = headerFooter?.headerBlocks && Object.keys(headerFooter.headerBlocks).length > 0;
  const hasHeaderBlocksByRId = headerFooter?.headerBlocksByRId && headerFooter.headerBlocksByRId.size > 0;

  if (headerFooter?.constraints && (hasHeaderBlocks || hasHeaderBlocksByRId)) {
    const hfPreStart = performance.now();
    const measureFn = headerFooter.measure ?? measureBlock;

    // Invalidate header/footer cache if content or constraints changed
    invalidateHeaderFooterCache(
      headerMeasureCache,
      headerFooterCacheState,
      headerFooter.headerBlocks,
      headerFooter.footerBlocks,
      headerFooter.constraints,
      options.sectionMetadata,
    );

    /**
     * Placeholder page count used during header pre-layout for height measurement.
     * The actual page count is not yet known at this stage, but it doesn't affect
     * header height calculations. A value of 1 is sufficient as a placeholder.
     */
    const HEADER_PRELAYOUT_PLACEHOLDER_PAGE_COUNT = 1;

    /**
     * Type guard to check if a key is a valid header variant type.
     * Ensures type safety when extracting header heights from the pre-layout results.
     *
     * @param key - The key to validate
     * @returns True if the key is one of the valid header variant types
     */
    type HeaderVariantType = 'default' | 'first' | 'even' | 'odd';
    const isValidHeaderType = (key: string): key is HeaderVariantType => {
      return ['default', 'first', 'even', 'odd'].includes(key);
    };

    headerContentHeights = {};

    // Extract heights from headerBlocks (by variant)
    if (hasHeaderBlocks && headerFooter.headerBlocks) {
      const preHeaderLayouts = await layoutHeaderFooterWithCache(
        headerFooter.headerBlocks,
        headerFooter.constraints,
        measureFn,
        headerMeasureCache,
        HEADER_PRELAYOUT_PLACEHOLDER_PAGE_COUNT,
        undefined, // No page resolver needed for height calculation
      );

      // Extract actual content heights from each variant
      for (const [type, value] of Object.entries(preHeaderLayouts)) {
        if (!isValidHeaderType(type)) continue;
        if (value?.layout && typeof value.layout.height === 'number') {
          const height = value.layout.height;
          if (Number.isFinite(height) && height >= 0) {
            headerContentHeights[type] = height;
          }
        }
      }
    }

    // Also extract heights from headerBlocksByRId (for multi-section documents)
    // Store each rId's height separately for per-page margin calculation
    if (hasHeaderBlocksByRId && headerFooter.headerBlocksByRId) {
      headerContentHeightsByRId = new Map<string, number>();
      for (const [rId, blocks] of headerFooter.headerBlocksByRId) {
        if (!blocks || blocks.length === 0) continue;
        // Measure blocks to get height
        const measureConstraints = {
          maxWidth: headerFooter.constraints.width,
          maxHeight: headerFooter.constraints.height,
        };
        const measures = await Promise.all(blocks.map((block) => measureFn(block, measureConstraints)));
        // Layout to get actual height
        const layout = layoutHeaderFooter(blocks, measures, {
          width: headerFooter.constraints.width,
          height: headerFooter.constraints.height,
        });
        if (layout.height > 0) {
          // Store height by rId for per-page margin calculation
          headerContentHeightsByRId.set(rId, layout.height);
        }
      }
    }

    const hfPreEnd = performance.now();
    perfLog(`[Perf] 4.1.5 Pre-layout headers for height: ${(hfPreEnd - hfPreStart).toFixed(2)}ms`);
  }

  // Pre-layout footers to get their actual content heights BEFORE body layout.
  // This prevents footer content from overlapping with body content when footers
  // exceed their allocated margin space.
  /**
   * Actual measured footer content heights per variant type extracted from pre-layout.
   * Keys correspond to footer variant types: 'default', 'first', 'even', 'odd'.
   * Values are the actual content heights in pixels, guaranteed to be finite and non-negative.
   * Undefined if footer pre-layout fails or footers are not present.
   */
  let footerContentHeights: Partial<Record<'default' | 'first' | 'even' | 'odd', number>> | undefined;

  /**
   * Actual measured footer content heights per relationship ID.
   * Used for multi-section documents where each section may have unique footers.
   * Keys are relationship IDs (e.g., 'rId8', 'rId9').
   * Values are the actual content heights in pixels.
   */
  let footerContentHeightsByRId: Map<string, number> | undefined;

  // Check if we have footers via either footerBlocks (by variant) or footerBlocksByRId (by relationship ID)
  const hasFooterBlocks = headerFooter?.footerBlocks && Object.keys(headerFooter.footerBlocks).length > 0;
  const hasFooterBlocksByRId = headerFooter?.footerBlocksByRId && headerFooter.footerBlocksByRId.size > 0;

  if (headerFooter?.constraints && (hasFooterBlocks || hasFooterBlocksByRId)) {
    const footerPreStart = performance.now();
    const measureFn = headerFooter.measure ?? measureBlock;

    // Cache invalidation already happened during header pre-layout (if headers exist)
    // or needs to happen now if only footers are present
    if (!hasHeaderBlocks && !hasHeaderBlocksByRId) {
      invalidateHeaderFooterCache(
        headerMeasureCache,
        headerFooterCacheState,
        headerFooter.headerBlocks,
        headerFooter.footerBlocks,
        headerFooter.constraints,
        options.sectionMetadata,
      );
    }

    /**
     * Placeholder page count used during footer pre-layout for height measurement.
     * The actual page count is not yet known at this stage, but it doesn't affect
     * footer height calculations. A value of 1 is sufficient as a placeholder.
     */
    const FOOTER_PRELAYOUT_PLACEHOLDER_PAGE_COUNT = 1;

    /**
     * Type guard to check if a key is a valid footer variant type.
     * Ensures type safety when extracting footer heights from the pre-layout results.
     *
     * @param key - The key to validate
     * @returns True if the key is one of the valid footer variant types
     */
    type FooterVariantType = 'default' | 'first' | 'even' | 'odd';
    const isValidFooterType = (key: string): key is FooterVariantType => {
      return ['default', 'first', 'even', 'odd'].includes(key);
    };

    footerContentHeights = {};

    try {
      // Extract heights from footerBlocks (by variant)
      if (hasFooterBlocks && headerFooter.footerBlocks) {
        const preFooterLayouts = await layoutHeaderFooterWithCache(
          headerFooter.footerBlocks,
          headerFooter.constraints,
          measureFn,
          headerMeasureCache,
          FOOTER_PRELAYOUT_PLACEHOLDER_PAGE_COUNT,
          undefined, // No page resolver needed for height calculation
        );

        // Extract actual content heights from each variant
        for (const [type, value] of Object.entries(preFooterLayouts)) {
          if (!isValidFooterType(type)) continue;
          if (value?.layout && typeof value.layout.height === 'number') {
            const height = value.layout.height;
            if (Number.isFinite(height) && height >= 0) {
              footerContentHeights[type] = height;
            }
          }
        }
      }

      // Also extract heights from footerBlocksByRId (for multi-section documents)
      // Store each rId's height separately for per-page margin calculation
      if (hasFooterBlocksByRId && headerFooter.footerBlocksByRId) {
        footerContentHeightsByRId = new Map<string, number>();
        for (const [rId, blocks] of headerFooter.footerBlocksByRId) {
          if (!blocks || blocks.length === 0) continue;
          // Measure blocks to get height
          const measureConstraints = {
            maxWidth: headerFooter.constraints.width,
            maxHeight: headerFooter.constraints.height,
          };
          const measures = await Promise.all(blocks.map((block) => measureFn(block, measureConstraints)));
          // Layout to get actual height
          const layout = layoutHeaderFooter(blocks, measures, {
            width: headerFooter.constraints.width,
            height: headerFooter.constraints.height,
          });
          if (layout.height > 0) {
            // Store height by rId for per-page margin calculation
            footerContentHeightsByRId.set(rId, layout.height);
          }
        }
      }
    } catch (error) {
      console.error('[Layout] Footer pre-layout failed:', error);
      footerContentHeights = undefined;
    }

    const footerPreEnd = performance.now();
    perfLog(`[Perf] 4.1.6 Pre-layout footers for height: ${(footerPreEnd - footerPreStart).toFixed(2)}ms`);
  }

  const layoutStart = performance.now();
  let layout = layoutDocument(nextBlocks, measures, {
    ...options,
    headerContentHeights, // Pass header heights to prevent overlap (per-variant)
    footerContentHeights, // Pass footer heights to prevent overlap (per-variant)
    headerContentHeightsByRId, // Pass header heights by rId for per-page margin calculation
    footerContentHeightsByRId, // Pass footer heights by rId for per-page margin calculation
    remeasureParagraph: (block: FlowBlock, maxWidth: number, firstLineIndent?: number) =>
      remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent),
  });
  const layoutEnd = performance.now();
  const layoutTime = layoutEnd - layoutStart;
  perfLog(`[Perf] 4.2 Layout document (pagination): ${layoutTime.toFixed(2)}ms`);

  const pageCount = layout.pages.length;

  // Two-pass convergence loop for page number token resolution.
  // Steps: paginate -> build numbering context -> resolve PAGE/NUMPAGES tokens
  //        -> remeasure affected blocks -> re-paginate -> repeat until stable
  const maxIterations = 3;
  let currentBlocks = nextBlocks;
  let currentMeasures = measures;
  let iteration = 0;

  const pageTokenStart = performance.now();
  let totalAffectedBlocks = 0;
  let totalRemeasureTime = 0;
  let totalRelayoutTime = 0;
  let converged = true;

  // Only run token resolution if feature flag is enabled
  if (FeatureFlags.BODY_PAGE_TOKENS) {
    while (iteration < maxIterations) {
      // Build numbering context from current layout
      const sections = options.sectionMetadata ?? [];
      const numberingCtx = buildNumberingContext(layout, sections);

      // Log iteration start
      PageTokenLogger.logIterationStart(iteration, layout.pages.length);

      // Resolve page number tokens
      const tokenResult = resolvePageNumberTokens(layout, currentBlocks, currentMeasures, numberingCtx);

      // Check for convergence
      if (tokenResult.affectedBlockIds.size === 0) {
        perfLog(`[Perf] 4.3 Page token resolution converged after ${iteration} iterations`);
        break;
      }

      perfLog(`[Perf] 4.3.${iteration + 1} Page tokens resolved: ${tokenResult.affectedBlockIds.size} blocks affected`);

      // Log affected blocks
      const blockSamples = Array.from(tokenResult.affectedBlockIds).slice(0, 5) as string[];
      PageTokenLogger.logAffectedBlocks(iteration, tokenResult.affectedBlockIds, blockSamples);

      totalAffectedBlocks += tokenResult.affectedBlockIds.size;

      // Apply updated blocks
      currentBlocks = currentBlocks.map((block) => tokenResult.updatedBlocks.get(block.id) ?? block);

      // Invalidate cache for affected blocks
      measureCache.invalidate(Array.from(tokenResult.affectedBlockIds));

      // Re-measure affected blocks
      const remeasureStart = performance.now();
      currentMeasures = await remeasureAffectedBlocks(
        currentBlocks,
        currentMeasures,
        tokenResult.affectedBlockIds,
        constraints,
        measureBlock,
      );
      const remeasureEnd = performance.now();
      const remeasureTime = remeasureEnd - remeasureStart;
      totalRemeasureTime += remeasureTime;
      perfLog(`[Perf] 4.3.${iteration + 1}.1 Re-measure: ${remeasureTime.toFixed(2)}ms`);
      PageTokenLogger.logRemeasure(tokenResult.affectedBlockIds.size, remeasureTime);

      // Check if page count has stabilized
      const oldPageCount = layout.pages.length;

      // Re-run pagination with updated measures
      const relayoutStart = performance.now();
      layout = layoutDocument(currentBlocks, currentMeasures, {
        ...options,
        headerContentHeights, // Pass header heights to prevent overlap (per-variant)
        footerContentHeights, // Pass footer heights to prevent overlap (per-variant)
        headerContentHeightsByRId, // Pass header heights by rId for per-page margin calculation
        footerContentHeightsByRId, // Pass footer heights by rId for per-page margin calculation
        remeasureParagraph: (block: FlowBlock, maxWidth: number, firstLineIndent?: number) =>
          remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent),
      });
      const relayoutEnd = performance.now();
      const relayoutTime = relayoutEnd - relayoutStart;
      totalRelayoutTime += relayoutTime;
      perfLog(`[Perf] 4.3.${iteration + 1}.2 Re-layout: ${relayoutTime.toFixed(2)}ms`);

      const newPageCount = layout.pages.length;

      // Early exit if page count is stable (common case: no change or minor text adjustment)
      if (newPageCount === oldPageCount && iteration > 0) {
        perfLog(`[Perf] 4.3 Page count stable at ${newPageCount} - breaking convergence loop`);
        break;
      }

      iteration++;
    }

    if (iteration >= maxIterations) {
      converged = false;
      console.warn(
        `[incrementalLayout] Page token resolution did not converge after ${maxIterations} iterations - stopping`,
      );
    }
  }

  const pageTokenEnd = performance.now();
  const totalTokenTime = pageTokenEnd - pageTokenStart;

  if (iteration > 0) {
    perfLog(`[Perf] 4.3 Total page token resolution time: ${totalTokenTime.toFixed(2)}ms`);

    // Log convergence status
    PageTokenLogger.logConvergence(iteration, converged, totalTokenTime);

    // Record metrics for monitoring
    globalMetrics.recordPageTokenMetrics({
      totalTimeMs: totalTokenTime,
      iterations: iteration,
      affectedBlocks: totalAffectedBlocks,
      remeasureTimeMs: totalRemeasureTime,
      relayoutTimeMs: totalRelayoutTime,
      converged,
    });
  }

  // Footnotes: reserve space per page and inject footnote fragments into the layout.
  // 1) Assign footnote refs to pages using the current layout.
  // 2) Measure footnote blocks and compute per-page reserved height.
  // 3) Relayout with per-page bottom margin reserves, then inject fragments into the reserved band.
  let extraBlocks: FlowBlock[] | undefined;
  let extraMeasures: Measure[] | undefined;
  const footnotesInput = isFootnotesLayoutInput(options.footnotes) ? options.footnotes : null;
  if (footnotesInput && footnotesInput.refs.length > 0 && footnotesInput.blocksById.size > 0) {
    const gap = typeof footnotesInput.gap === 'number' && Number.isFinite(footnotesInput.gap) ? footnotesInput.gap : 2;
    const topPadding =
      typeof footnotesInput.topPadding === 'number' && Number.isFinite(footnotesInput.topPadding)
        ? footnotesInput.topPadding
        : 6;
    const dividerHeight =
      typeof footnotesInput.dividerHeight === 'number' && Number.isFinite(footnotesInput.dividerHeight)
        ? footnotesInput.dividerHeight
        : 6;
    const safeGap = Math.max(0, gap);
    const safeTopPadding = Math.max(0, topPadding);
    const safeDividerHeight = Math.max(0, dividerHeight);
    const continuationDividerHeight = safeDividerHeight;
    const continuationDividerWidthFactor = 0.3;

    const footnoteWidth = resolveFootnoteMeasurementWidth(options, currentBlocks);
    if (footnoteWidth > 0) {
      const footnoteConstraints = { maxWidth: footnoteWidth, maxHeight: measurementHeight };

      const collectFootnoteIdsByColumn = (idsByColumn: Map<number, Map<number, string[]>>): Set<string> => {
        const ids = new Set<string>();
        idsByColumn.forEach((columns) => {
          columns.forEach((list) => {
            list.forEach((id) => ids.add(id));
          });
        });
        return ids;
      };

      const measureFootnoteBlocks = async (ids: Set<string>) => {
        const needed = new Map<string, FlowBlock>();
        ids.forEach((id) => {
          const blocks = footnotesInput.blocksById.get(id) ?? [];
          blocks.forEach((block) => {
            if (block?.id && !needed.has(block.id)) {
              needed.set(block.id, block);
            }
          });
        });

        const blocks = Array.from(needed.values());
        const measuresById = new Map<string, Measure>();
        await Promise.all(
          blocks.map(async (block) => {
            const cached = measureCache.get(block, footnoteConstraints.maxWidth, footnoteConstraints.maxHeight);
            if (cached) {
              measuresById.set(block.id, cached);
              return;
            }
            const measurement = await measureBlock(block, footnoteConstraints);
            measureCache.set(block, footnoteConstraints.maxWidth, footnoteConstraints.maxHeight, measurement);
            measuresById.set(block.id, measurement);
          }),
        );
        return { blocks, measuresById };
      };

      const computeFootnoteLayoutPlan = (
        layoutForPages: Layout,
        idsByColumn: Map<number, Map<number, string[]>>,
        measuresById: Map<string, Measure>,
        baseReserves: number[] = [],
        pageColumns: Map<number, PageColumns>,
      ): FootnoteLayoutPlan => {
        const pageCount = layoutForPages.pages.length;
        const slicesByPage = new Map<number, FootnoteSlice[]>();
        const reserves: number[] = new Array(pageCount).fill(0);
        const hasContinuationByColumn = new Map<string, boolean>();
        const rangesByFootnoteId = new Map<string, FootnoteRange[]>();
        const cappedPages = new Set<number>();

        const allIds = collectFootnoteIdsByColumn(idsByColumn);
        allIds.forEach((id) => {
          const blocks = footnotesInput.blocksById.get(id) ?? [];
          rangesByFootnoteId.set(id, buildFootnoteRanges(blocks, measuresById));
        });

        const separatorSpacingBefore = resolveSeparatorSpacingBefore(
          rangesByFootnoteId,
          measuresById,
          footnotesInput.separatorSpacingBefore,
          DEFAULT_FOOTNOTE_SEPARATOR_SPACING_BEFORE,
        );
        const safeSeparatorSpacingBefore = Math.max(0, separatorSpacingBefore);

        let pendingByColumn = new Map<number, Array<{ id: string; ranges: FootnoteRange[] }>>();

        for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
          const baseReserve = Number.isFinite(baseReserves?.[pageIndex]) ? Math.max(0, baseReserves[pageIndex]) : 0;
          const maxReserve = computeMaxFootnoteReserve(layoutForPages, pageIndex, baseReserve);
          const columns = pageColumns.get(pageIndex);
          const columnCount = Math.max(1, Math.floor(columns?.count ?? 1));

          const pendingForPage = new Map<number, Array<{ id: string; ranges: FootnoteRange[] }>>();
          pendingByColumn.forEach((entries, columnIndex) => {
            const targetIndex = columnIndex < columnCount ? columnIndex : Math.max(0, columnCount - 1);
            const list = pendingForPage.get(targetIndex) ?? [];
            list.push(...entries);
            pendingForPage.set(targetIndex, list);
          });
          pendingByColumn = new Map();

          const pageSlices: FootnoteSlice[] = [];
          let pageReserve = 0;

          for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
            let usedHeight = 0;
            const columnSlices: FootnoteSlice[] = [];
            const nextPending: Array<{ id: string; ranges: FootnoteRange[] }> = [];
            let stopPlacement = false;
            const columnKey = footnoteColumnKey(pageIndex, columnIndex);

            const placeFootnote = (
              id: string,
              ranges: FootnoteRange[],
              isContinuation: boolean,
            ): { placed: boolean; remaining: FootnoteRange[] } => {
              if (!ranges || ranges.length === 0) {
                return { placed: false, remaining: [] };
              }

              const isFirstSlice = columnSlices.length === 0;
              const separatorBefore = isFirstSlice ? safeSeparatorSpacingBefore : 0;
              const separatorHeight = isFirstSlice
                ? isContinuation
                  ? continuationDividerHeight
                  : safeDividerHeight
                : 0;
              const overhead = isFirstSlice ? separatorBefore + separatorHeight + safeTopPadding : 0;
              const gapBefore = !isFirstSlice ? safeGap : 0;
              const availableHeight = Math.max(0, maxReserve - usedHeight - overhead - gapBefore);
              const { slice, remainingRanges } = fitFootnoteContent(
                id,
                ranges,
                availableHeight,
                pageIndex,
                columnIndex,
                isContinuation,
                measuresById,
                isFirstSlice && maxReserve > 0,
              );

              if (slice.ranges.length === 0) {
                return { placed: false, remaining: ranges };
              }

              if (isFirstSlice) {
                usedHeight += overhead;
                if (isContinuation) {
                  hasContinuationByColumn.set(columnKey, true);
                }
              }
              if (gapBefore > 0) {
                usedHeight += gapBefore;
              }

              usedHeight += slice.totalHeight;
              columnSlices.push(slice);
              return { placed: true, remaining: remainingRanges };
            };

            const pending = pendingForPage.get(columnIndex) ?? [];
            for (const entry of pending) {
              if (stopPlacement) {
                nextPending.push(entry);
                continue;
              }
              if (!entry.ranges || entry.ranges.length === 0) continue;
              const result = placeFootnote(entry.id, entry.ranges, true);
              if (!result.placed) {
                nextPending.push(entry);
                stopPlacement = true;
                continue;
              }
              if (result.remaining.length > 0) {
                nextPending.push({ id: entry.id, ranges: result.remaining });
              }
            }

            if (!stopPlacement) {
              const ids = idsByColumn.get(pageIndex)?.get(columnIndex) ?? [];
              for (let idIndex = 0; idIndex < ids.length; idIndex += 1) {
                const id = ids[idIndex];
                const ranges = rangesByFootnoteId.get(id) ?? [];
                if (ranges.length === 0) continue;
                const result = placeFootnote(id, ranges, false);
                if (!result.placed) {
                  nextPending.push({ id, ranges });
                  for (let remainingIndex = idIndex + 1; remainingIndex < ids.length; remainingIndex += 1) {
                    const remainingId = ids[remainingIndex];
                    const remainingRanges = rangesByFootnoteId.get(remainingId) ?? [];
                    nextPending.push({ id: remainingId, ranges: remainingRanges });
                  }
                  stopPlacement = true;
                  break;
                }
                if (result.remaining.length > 0) {
                  nextPending.push({ id, ranges: result.remaining });
                }
              }
            }

            if (columnSlices.length > 0) {
              const rawReserve = Math.max(0, Math.ceil(usedHeight));
              const cappedReserve = Math.min(rawReserve, maxReserve);
              if (cappedReserve < rawReserve) {
                cappedPages.add(pageIndex);
              }
              pageReserve = Math.max(pageReserve, cappedReserve);
              pageSlices.push(...columnSlices);
            }

            if (nextPending.length > 0) {
              pendingByColumn.set(columnIndex, nextPending);
            }
          }

          if (pageSlices.length > 0) {
            slicesByPage.set(pageIndex, pageSlices);
          }
          reserves[pageIndex] = pageReserve;
        }

        if (cappedPages.size > 0) {
          console.warn('[layout] Footnote reserve capped to preserve body area', {
            pages: Array.from(cappedPages),
          });
        }
        if (pendingByColumn.size > 0) {
          const pendingIds = new Set<string>();
          pendingByColumn.forEach((entries) => entries.forEach((entry) => pendingIds.add(entry.id)));
          console.warn('[layout] Footnote content truncated: extends beyond document pages', {
            ids: Array.from(pendingIds),
          });
        }

        return { slicesByPage, reserves, hasContinuationByColumn, separatorSpacingBefore: safeSeparatorSpacingBefore };
      };

      const injectFragments = (
        layoutForPages: Layout,
        plan: FootnoteLayoutPlan,
        measuresById: Map<string, Measure>,
        reservesByPageIndex: number[],
        blockById: Map<string, FlowBlock>,
        pageColumns: Map<number, PageColumns>,
      ) => {
        const decorativeBlocks: FlowBlock[] = [];
        const decorativeMeasures: Measure[] = [];

        for (let pageIndex = 0; pageIndex < layoutForPages.pages.length; pageIndex++) {
          const page = layoutForPages.pages[pageIndex];
          page.footnoteReserved = Math.max(0, reservesByPageIndex[pageIndex] ?? plan.reserves[pageIndex] ?? 0);
          const slices = plan.slicesByPage.get(pageIndex) ?? [];
          if (slices.length === 0) continue;
          if (!page.margins) continue;

          const pageSize = page.size ?? layoutForPages.pageSize;
          const marginLeft = normalizeMargin(
            page.margins.left,
            normalizeMargin(options.margins?.left, DEFAULT_MARGINS.left),
          );
          const marginRight = normalizeMargin(
            page.margins.right,
            normalizeMargin(options.margins?.right, DEFAULT_MARGINS.right),
          );
          const pageContentWidth = pageSize.w - (marginLeft + marginRight);
          const fallbackColumns = normalizeColumnsForFootnotes(
            options.columns ?? { count: 1, gap: 0 },
            pageContentWidth,
          );
          const columns = pageColumns.get(pageIndex) ?? {
            ...fallbackColumns,
            left: marginLeft,
            contentWidth: pageContentWidth,
          };
          const bandTopY = pageSize.h - (page.margins.bottom ?? 0);

          const slicesByColumn = new Map<number, FootnoteSlice[]>();
          slices.forEach((slice) => {
            const columnIndex = Number.isFinite(slice.columnIndex) ? slice.columnIndex : 0;
            const list = slicesByColumn.get(columnIndex) ?? [];
            list.push(slice);
            slicesByColumn.set(columnIndex, list);
          });

          slicesByColumn.forEach((columnSlices, rawColumnIndex) => {
            if (columnSlices.length === 0) return;
            const columnIndex = Math.max(0, Math.min(columns.count - 1, rawColumnIndex));
            const columnStride = columns.width + columns.gap;
            const columnX = columns.left + columnIndex * columnStride;
            const contentWidth = Math.min(columns.width, footnoteWidth);
            if (!Number.isFinite(contentWidth) || contentWidth <= 0) return;

            const columnKey = footnoteColumnKey(pageIndex, columnIndex);
            const isContinuation = plan.hasContinuationByColumn.get(columnKey) ?? false;

            // Optional visible separator line (Word-like). Uses a 1px filled rect.
            let cursorY = bandTopY + Math.max(0, plan.separatorSpacingBefore);
            const separatorHeight = isContinuation ? continuationDividerHeight : safeDividerHeight;
            const separatorWidth = isContinuation
              ? Math.max(0, contentWidth * continuationDividerWidthFactor)
              : contentWidth;
            if (separatorHeight > 0 && separatorWidth > 0) {
              const separatorId = isContinuation
                ? `footnote-continuation-separator-page-${page.number}-col-${columnIndex}`
                : `footnote-separator-page-${page.number}-col-${columnIndex}`;
              decorativeBlocks.push({
                kind: 'drawing',
                id: separatorId,
                drawingKind: 'vectorShape',
                geometry: { width: separatorWidth, height: separatorHeight },
                shapeKind: 'rect',
                fillColor: '#000000',
                strokeColor: null,
                strokeWidth: 0,
              });
              decorativeMeasures.push({
                kind: 'drawing',
                drawingKind: 'vectorShape',
                width: separatorWidth,
                height: separatorHeight,
                scale: 1,
                naturalWidth: separatorWidth,
                naturalHeight: separatorHeight,
                geometry: { width: separatorWidth, height: separatorHeight },
              });
              page.fragments.push({
                kind: 'drawing',
                blockId: separatorId,
                drawingKind: 'vectorShape',
                x: columnX,
                y: cursorY,
                width: separatorWidth,
                height: separatorHeight,
                geometry: { width: separatorWidth, height: separatorHeight },
                scale: 1,
              });
              cursorY += separatorHeight;
            }
            cursorY += safeTopPadding;

            columnSlices.forEach((slice, sliceIndex) => {
              slice.ranges.forEach((range) => {
                if (range.kind === 'paragraph') {
                  const measure = measuresById.get(range.blockId);
                  if (!measure || measure.kind !== 'paragraph') return;
                  const marker = measure.marker;
                  page.fragments.push({
                    kind: 'para',
                    blockId: range.blockId,
                    fromLine: range.fromLine,
                    toLine: range.toLine,
                    x: columnX,
                    y: cursorY,
                    width: contentWidth,
                    continuesFromPrev: range.fromLine > 0,
                    continuesOnNext: range.toLine < range.totalLines,
                    ...(marker?.markerWidth != null ? { markerWidth: marker.markerWidth } : {}),
                    ...(marker?.markerTextWidth != null ? { markerTextWidth: marker.markerTextWidth } : {}),
                    ...(marker?.gutterWidth != null ? { markerGutter: marker.gutterWidth } : {}),
                  });
                  cursorY += getRangeRenderHeight(range);
                  return;
                }

                if (range.kind === 'list-item') {
                  const measure = measuresById.get(range.blockId);
                  const block = blockById.get(range.blockId);
                  if (!measure || measure.kind !== 'list') return;
                  if (!block || block.kind !== 'list') return;
                  const itemMeasure = measure.items.find((entry) => entry.itemId === range.itemId);
                  if (!itemMeasure) return;
                  const indentLeft = Number.isFinite(itemMeasure.indentLeft) ? itemMeasure.indentLeft : 0;
                  const markerWidth = Number.isFinite(itemMeasure.markerWidth) ? itemMeasure.markerWidth : 0;
                  const itemWidth = Math.max(0, contentWidth - indentLeft - markerWidth);
                  page.fragments.push({
                    kind: 'list-item',
                    blockId: range.blockId,
                    itemId: range.itemId,
                    fromLine: range.fromLine,
                    toLine: range.toLine,
                    x: columnX + indentLeft + markerWidth,
                    y: cursorY,
                    width: itemWidth,
                    markerWidth,
                    continuesFromPrev: range.fromLine > 0,
                    continuesOnNext: range.toLine < range.totalLines,
                  });
                  cursorY += getRangeRenderHeight(range);
                  return;
                }

                if (range.kind === 'table') {
                  const measure = measuresById.get(range.blockId);
                  const block = blockById.get(range.blockId);
                  if (!measure || measure.kind !== 'table') return;
                  if (!block || block.kind !== 'table') return;
                  const tableWidthRaw = Math.max(0, measure.totalWidth ?? 0);
                  let tableWidth = Math.min(contentWidth, tableWidthRaw);
                  let tableX = columnX;
                  const justification =
                    typeof block.attrs?.justification === 'string' ? block.attrs.justification : undefined;
                  if (justification === 'center') {
                    tableX = columnX + Math.max(0, (contentWidth - tableWidth) / 2);
                  } else if (justification === 'right' || justification === 'end') {
                    tableX = columnX + Math.max(0, contentWidth - tableWidth);
                  } else {
                    const indentValue = (block.attrs?.tableIndent as { width?: unknown } | undefined)?.width;
                    const indent = typeof indentValue === 'number' && Number.isFinite(indentValue) ? indentValue : 0;
                    tableX += indent;
                    tableWidth = Math.max(0, tableWidth - indent);
                  }
                  // Rescale column widths when table was clamped to section width.
                  // This happens in mixed-orientation docs where measurement uses the
                  // widest section but rendering is per-section (SD-1859).
                  let fragmentColumnWidths: number[] | undefined;
                  if (
                    tableWidthRaw > tableWidth &&
                    measure.columnWidths &&
                    measure.columnWidths.length > 0 &&
                    tableWidthRaw > 0
                  ) {
                    const scale = tableWidth / tableWidthRaw;
                    fragmentColumnWidths = measure.columnWidths.map((w: number) => Math.max(1, Math.round(w * scale)));
                    const scaledSum = fragmentColumnWidths.reduce((a: number, b: number) => a + b, 0);
                    const target = Math.round(tableWidth);
                    if (scaledSum !== target && fragmentColumnWidths.length > 0) {
                      fragmentColumnWidths[fragmentColumnWidths.length - 1] = Math.max(
                        1,
                        fragmentColumnWidths[fragmentColumnWidths.length - 1] + (target - scaledSum),
                      );
                    }
                  }

                  page.fragments.push({
                    kind: 'table',
                    blockId: range.blockId,
                    fromRow: 0,
                    toRow: block.rows.length,
                    x: tableX,
                    y: cursorY,
                    width: tableWidth,
                    height: Math.max(0, measure.totalHeight ?? 0),
                    columnWidths: fragmentColumnWidths,
                  });
                  cursorY += getRangeRenderHeight(range);
                  return;
                }

                if (range.kind === 'image') {
                  const measure = measuresById.get(range.blockId);
                  if (!measure || measure.kind !== 'image') return;
                  page.fragments.push({
                    kind: 'image',
                    blockId: range.blockId,
                    x: columnX,
                    y: cursorY,
                    width: Math.min(contentWidth, Math.max(0, measure.width ?? 0)),
                    height: Math.max(0, measure.height ?? 0),
                  });
                  cursorY += getRangeRenderHeight(range);
                  return;
                }

                if (range.kind === 'drawing') {
                  const measure = measuresById.get(range.blockId);
                  const block = blockById.get(range.blockId);
                  if (!measure || measure.kind !== 'drawing') return;
                  if (!block || block.kind !== 'drawing') return;
                  page.fragments.push({
                    kind: 'drawing',
                    blockId: range.blockId,
                    drawingKind: block.drawingKind,
                    x: columnX,
                    y: cursorY,
                    width: Math.min(contentWidth, Math.max(0, measure.width ?? 0)),
                    height: Math.max(0, measure.height ?? 0),
                    geometry: measure.geometry,
                    scale: measure.scale,
                  });
                  cursorY += getRangeRenderHeight(range);
                }
              });

              if (sliceIndex < columnSlices.length - 1) {
                cursorY += safeGap;
              }
            });
          });
        }

        return { decorativeBlocks, decorativeMeasures };
      };

      const resolveFootnoteAssignments = (layoutForPages: Layout) => {
        const columns = resolvePageColumns(layoutForPages, options, currentBlocks);
        const idsByColumn = assignFootnotesToColumns(layoutForPages, footnotesInput.refs, columns);
        return { columns, idsByColumn };
      };

      const relayout = (footnoteReservedByPageIndex: number[]) =>
        layoutDocument(currentBlocks, currentMeasures, {
          ...options,
          footnoteReservedByPageIndex,
          headerContentHeights,
          footerContentHeights,
          remeasureParagraph: (block: FlowBlock, maxWidth: number, firstLineIndent?: number) =>
            remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent),
        });

      // Pass 1: assign + reserve from current layout.
      let { columns: pageColumns, idsByColumn } = resolveFootnoteAssignments(layout);
      let { measuresById } = await measureFootnoteBlocks(collectFootnoteIdsByColumn(idsByColumn));
      let plan = computeFootnoteLayoutPlan(layout, idsByColumn, measuresById, [], pageColumns);
      let reserves = plan.reserves;

      // Relayout with footnote reserves and iterate until reserves and page count stabilize,
      // so each page gets the correct reserve (avoids "too much" on one page and "not enough" on another).
      if (reserves.some((h) => h > 0)) {
        let reservesStabilized = false;
        const seenReserveKeys = new Set<string>([reserves.join(',')]);
        for (let pass = 0; pass < MAX_FOOTNOTE_LAYOUT_PASSES; pass += 1) {
          layout = relayout(reserves);
          ({ columns: pageColumns, idsByColumn } = resolveFootnoteAssignments(layout));
          ({ measuresById } = await measureFootnoteBlocks(collectFootnoteIdsByColumn(idsByColumn)));
          plan = computeFootnoteLayoutPlan(layout, idsByColumn, measuresById, reserves, pageColumns);
          const nextReserves = plan.reserves;
          const reservesStable =
            nextReserves.length === reserves.length &&
            nextReserves.every((h, i) => (reserves[i] ?? 0) === h) &&
            reserves.every((h, i) => (nextReserves[i] ?? 0) === h);
          if (reservesStable) {
            reserves = nextReserves;
            reservesStabilized = true;
            break;
          }
          // Detect oscillation: if we've produced a reserve vector we already tried,
          // the loop will never converge. Break early to avoid wasted relayout passes.
          const nextKey = nextReserves.join(',');
          if (seenReserveKeys.has(nextKey)) {
            break;
          }
          seenReserveKeys.add(nextKey);
          // Only update reserves when we will do another layout pass; otherwise layout
          // would be built with the previous reserves while reserves would be nextReserves,
          // and the plan/injection phase could place footnotes in the wrong band.
          if (pass < MAX_FOOTNOTE_LAYOUT_PASSES - 1) {
            reserves = nextReserves;
          }
        }
        if (!reservesStabilized) {
          console.warn(
            `[incrementalLayout] Footnote reserve loop did not converge (max ${MAX_FOOTNOTE_LAYOUT_PASSES} passes); layout may have suboptimal footnote placement.`,
          );
        }

        let { columns: finalPageColumns, idsByColumn: finalIdsByColumn } = resolveFootnoteAssignments(layout);
        let { blocks: finalBlocks, measuresById: finalMeasuresById } = await measureFootnoteBlocks(
          collectFootnoteIdsByColumn(finalIdsByColumn),
        );
        let finalPlan = computeFootnoteLayoutPlan(
          layout,
          finalIdsByColumn,
          finalMeasuresById,
          reserves,
          finalPageColumns,
        );
        const finalReserves = finalPlan.reserves;
        let reservesAppliedToLayout = reserves;
        const reservesDiffer =
          finalReserves.length !== reserves.length ||
          finalReserves.some((h, i) => (reserves[i] ?? 0) !== h) ||
          reserves.some((h, i) => (finalReserves[i] ?? 0) !== h);
        if (reservesDiffer) {
          layout = relayout(finalReserves);
          reservesAppliedToLayout = finalReserves;
          ({ columns: finalPageColumns, idsByColumn: finalIdsByColumn } = resolveFootnoteAssignments(layout));
          ({ blocks: finalBlocks, measuresById: finalMeasuresById } = await measureFootnoteBlocks(
            collectFootnoteIdsByColumn(finalIdsByColumn),
          ));
          finalPlan = computeFootnoteLayoutPlan(
            layout,
            finalIdsByColumn,
            finalMeasuresById,
            reservesAppliedToLayout,
            finalPageColumns,
          );
        }
        const blockById = new Map<string, FlowBlock>();
        finalBlocks.forEach((block) => {
          blockById.set(block.id, block);
        });
        const injected = injectFragments(
          layout,
          finalPlan,
          finalMeasuresById,
          reservesAppliedToLayout,
          blockById,
          finalPageColumns,
        );

        const alignedBlocks: FlowBlock[] = [];
        const alignedMeasures: Measure[] = [];
        finalBlocks.forEach((block) => {
          const measure = finalMeasuresById.get(block.id);
          if (!measure) return;
          alignedBlocks.push(block);
          alignedMeasures.push(measure);
        });
        extraBlocks = injected ? alignedBlocks.concat(injected.decorativeBlocks) : alignedBlocks;
        extraMeasures = injected ? alignedMeasures.concat(injected.decorativeMeasures) : alignedMeasures;
      }
    }
  }

  let headers: HeaderFooterLayoutResult[] | undefined;
  let footers: HeaderFooterLayoutResult[] | undefined;

  if (headerFooter?.constraints && (headerFooter.headerBlocks || headerFooter.footerBlocks)) {
    const hfStart = performance.now();

    const measureFn = headerFooter.measure ?? measureBlock;

    // Invalidate header/footer cache if content or constraints changed
    invalidateHeaderFooterCache(
      headerMeasureCache,
      headerFooterCacheState,
      headerFooter.headerBlocks,
      headerFooter.footerBlocks,
      headerFooter.constraints,
      options.sectionMetadata,
    );

    // Build numbering context from final layout for header/footer token resolution
    const sections = options.sectionMetadata ?? [];
    const numberingCtx = buildNumberingContext(layout, sections);

    // Create page resolver for section-aware header/footer numbering
    // Only use page resolver if feature flag is enabled
    const pageResolver = FeatureFlags.HEADER_FOOTER_PAGE_TOKENS
      ? (pageNumber: number): { displayText: string; totalPages: number } => {
          const pageIndex = pageNumber - 1;
          const displayInfo = numberingCtx.displayPages[pageIndex];
          return {
            displayText: displayInfo?.displayText ?? String(pageNumber),
            totalPages: numberingCtx.totalPages,
          };
        }
      : undefined;

    if (headerFooter.headerBlocks) {
      const headerLayouts = await layoutHeaderFooterWithCache(
        headerFooter.headerBlocks,
        headerFooter.constraints,
        measureFn,
        headerMeasureCache,
        FeatureFlags.HEADER_FOOTER_PAGE_TOKENS ? undefined : numberingCtx.totalPages, // Fallback for backward compat
        pageResolver, // Use page resolver for section-aware numbering
      );
      headers = serializeHeaderFooterResults('header', headerLayouts);
    }
    if (headerFooter.footerBlocks) {
      const footerLayouts = await layoutHeaderFooterWithCache(
        headerFooter.footerBlocks,
        headerFooter.constraints,
        measureFn,
        headerMeasureCache,
        FeatureFlags.HEADER_FOOTER_PAGE_TOKENS ? undefined : numberingCtx.totalPages, // Fallback for backward compat
        pageResolver, // Use page resolver for section-aware numbering
      );
      footers = serializeHeaderFooterResults('footer', footerLayouts);
    }

    const hfEnd = performance.now();
    perfLog(`[Perf] 4.4 Header/footer layout: ${(hfEnd - hfStart).toFixed(2)}ms`);

    // Record header/footer cache metrics
    const cacheStats = headerMeasureCache.getStats();
    globalMetrics.recordHeaderFooterCacheMetrics(cacheStats);
    HeaderFooterCacheLogger.logStats(cacheStats);
  }

  return {
    layout,
    measures: currentMeasures,
    dirty,
    headers,
    footers,
    extraBlocks,
    extraMeasures,
  };
}

const DEFAULT_PAGE_SIZE = { w: 612, h: 792 };
const DEFAULT_MARGINS = { top: 72, right: 72, bottom: 72, left: 72 };

/**
 * Normalizes a margin value, using a fallback for undefined or non-finite values.
 * Prevents NaN content sizes when margin properties are partially defined.
 *
 * @param value - The margin value to normalize (may be undefined)
 * @param fallback - The default margin value to use if value is invalid
 * @returns The normalized margin value (guaranteed to be finite)
 */
export const normalizeMargin = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback;

/**
 * Resolves the maximum measurement constraints (width and height) needed for measuring blocks
 * across all sections in a document.
 *
 * This function scans the entire document (including all section breaks) to determine the
 * widest column configuration and tallest content area that will be encountered during layout.
 * All blocks must be measured at these maximum constraints to ensure they fit correctly when
 * placed in any section, preventing remeasurement during pagination.
 *
 * Why maximum constraints are needed:
 * - Documents can have multiple sections with different page sizes, margins, and column counts
 * - Each section may have a different effective column width (e.g., 2 columns vs 3 columns)
 * - Blocks measured too narrow will overflow when placed in wider sections
 * - Blocks measured at maximum width will fit in all sections (may have extra space in narrower ones)
 *
 * Algorithm:
 * 1. Start with base content width/height from options.pageSize and options.margins
 * 2. Calculate base column width from options.columns (if multi-column)
 * 3. Scan all sectionBreak blocks to find maximum column width and content height
 * 4. For each section: compute content area, calculate column width, track maximum
 * 5. Return the widest column width and tallest content height found
 *
 * Column width calculation:
 * - Single column: contentWidth (no gap subtraction)
 * - Multi-column: (contentWidth - totalGap) / columnCount
 * - Total gap = gap * (columnCount - 1)
 *
 * @param options - Layout options containing default page size, margins, and columns
 * @param blocks - Optional array of flow blocks to scan for section breaks
 *   If not provided, only base constraints from options are used
 * @returns Object containing:
 *   - measurementWidth: Maximum column width in pixels (guaranteed positive)
 *   - measurementHeight: Maximum content height in pixels (guaranteed positive)
 *
 * @throws Error if resolved constraints are non-positive (indicates invalid configuration)
 *
 * @example
 * ```typescript
 * // Document with two sections: single column and 2-column
 * const options = {
 *   pageSize: { w: 612, h: 792 }, // Letter size
 *   margins: { top: 72, right: 72, bottom: 72, left: 72 },
 *   columns: { count: 1, gap: 0 }
 * };
 * const blocks = [
 *   // ... content blocks ...
 *   {
 *     kind: 'sectionBreak',
 *     columns: { count: 2, gap: 48 },
 *     // ... other section properties ...
 *   }
 * ];
 * const constraints = resolveMeasurementConstraints(options, blocks);
 * // Returns: { measurementWidth: 468, measurementHeight: 648 }
 * // 468px = (612 - 72 - 72) width, single column (wider than 2-column: 234px)
 * // All blocks measured at 468px will fit in both sections
 * ```
 */
export function resolveMeasurementConstraints(
  options: LayoutOptions,
  blocks?: FlowBlock[],
): {
  measurementWidth: number;
  measurementHeight: number;
} {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const margins = {
    top: normalizeMargin(options.margins?.top, DEFAULT_MARGINS.top),
    right: normalizeMargin(options.margins?.right, DEFAULT_MARGINS.right),
    bottom: normalizeMargin(options.margins?.bottom, DEFAULT_MARGINS.bottom),
    left: normalizeMargin(options.margins?.left, DEFAULT_MARGINS.left),
  };
  const baseContentWidth = pageSize.w - (margins.left + margins.right);
  const baseContentHeight = pageSize.h - (margins.top + margins.bottom);

  const computeColumnWidth = (contentWidth: number, columns?: { count: number; gap?: number }): number => {
    if (!columns || columns.count <= 1) return contentWidth;
    const gap = Math.max(0, columns.gap ?? 0);
    const totalGap = gap * (columns.count - 1);
    return (contentWidth - totalGap) / columns.count;
  };

  let measurementWidth = computeColumnWidth(baseContentWidth, options.columns);
  let measurementHeight = baseContentHeight;

  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      if (block.kind !== 'sectionBreak') continue;
      const sectionPageSize = block.pageSize ?? pageSize;
      const sectionMargins = {
        top: normalizeMargin(block.margins?.top, margins.top),
        right: normalizeMargin(block.margins?.right, margins.right),
        bottom: normalizeMargin(block.margins?.bottom, margins.bottom),
        left: normalizeMargin(block.margins?.left, margins.left),
      };
      const contentWidth = sectionPageSize.w - (sectionMargins.left + sectionMargins.right);
      const contentHeight = sectionPageSize.h - (sectionMargins.top + sectionMargins.bottom);
      if (contentWidth <= 0 || contentHeight <= 0) continue;
      const columnWidth = computeColumnWidth(contentWidth, block.columns ?? options.columns);
      if (columnWidth > measurementWidth) {
        measurementWidth = columnWidth;
      }
      if (contentHeight > measurementHeight) {
        measurementHeight = contentHeight;
      }
    }
  }

  return {
    measurementWidth,
    measurementHeight,
  };
}

const serializeHeaderFooterResults = (
  kind: 'header' | 'footer',
  batch: Awaited<ReturnType<typeof layoutHeaderFooterWithCache>>,
): HeaderFooterLayoutResult[] => {
  const results: HeaderFooterLayoutResult[] = [];
  Object.entries(batch).forEach(([type, value]) => {
    if (!value) return;
    results.push({
      kind,
      type: type as keyof HeaderFooterBatch,
      layout: value.layout,
      blocks: value.blocks,
      measures: value.measures,
    });
  });
  return results;
};

/**
 * Builds numbering context from layout and section metadata.
 *
 * Creates display page information for each page using section-aware numbering
 * (restart, format, etc.). This context is used for page token resolution.
 *
 * @param layout - Current layout with pages
 * @param sections - Section metadata array
 * @returns Numbering context with total pages and display page info
 */
function buildNumberingContext(layout: Layout, sections: SectionMetadata[]): NumberingContext {
  const totalPages = layout.pages.length;
  const displayPages = computeDisplayPageNumber(layout.pages, sections);

  return {
    totalPages,
    displayPages,
  };
}

/**
 * Re-measures affected blocks after token resolution.
 *
 * For each affected block, re-measures it using the measureBlock function
 * and updates the measures array. Unaffected blocks keep their cached measurements.
 *
 * @param blocks - Current blocks array (with resolved tokens)
 * @param measures - Current measures array (parallel to blocks)
 * @param affectedBlockIds - Set of block IDs that need re-measurement
 * @param constraints - Measurement constraints (width, height)
 * @param measureBlock - Function to measure a block
 * @returns Updated measures array with re-measured blocks
 */
async function remeasureAffectedBlocks(
  blocks: FlowBlock[],
  measures: Measure[],
  affectedBlockIds: Set<string>,
  constraints: { maxWidth: number; maxHeight: number },
  measureBlock: (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => Promise<Measure>,
): Promise<Measure[]> {
  const updatedMeasures: Measure[] = [...measures];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Only re-measure affected blocks
    if (!affectedBlockIds.has(block.id)) {
      continue;
    }

    try {
      // Re-measure the block
      const newMeasure = await measureBlock(block, constraints);

      // Update in the measures array
      updatedMeasures[i] = newMeasure;

      // Cache the new measurement
      measureCache.set(block, constraints.maxWidth, constraints.maxHeight, newMeasure);
    } catch (error) {
      // Error handling per plan: log warning, keep prior layout for block
      console.warn(`[incrementalLayout] Failed to re-measure block ${block.id} after token resolution:`, error);
      // Keep the old measure - don't update updatedMeasures[i]
    }
  }

  return updatedMeasures;
}
