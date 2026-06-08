import type {
  FlowBlock,
  FootnotePageLedger,
  Layout,
  Measure,
  HeaderFooterLayout,
  SectionMetadata,
  ParagraphBlock,
  ColumnLayout,
  SectionBreakBlock,
  NormalizedColumnLayout,
  PageNumberChapterSeparator,
  PageNumberFormat,
} from '@superdoc/contracts';
import {
  cloneColumnLayout,
  formatSectionPageNumberText,
  getColumnGeometry,
  getColumnX,
  normalizeColumnLayout,
  rescaleColumnWidths,
} from '@superdoc/contracts';
import type { FontMeasureContext } from '@superdoc/font-system';
import {
  layoutDocument,
  type LayoutOptions,
  type HeaderFooterConstraints,
  computeDisplayPageNumber,
  resolvePageNumberTokens,
  type NumberingContext,
  buildChapterContextByPage,
  type ChapterPageInfo,
  normalizeChapterMarkerText,
  SEMANTIC_PAGE_HEIGHT_PX,
  SINGLE_COLUMN_DEFAULT,
  resolveTableFrame,
} from '@superdoc/layout-engine';
import { remeasureParagraph } from './remeasure';
import { computeDirtyRegions } from './diff';
import { MeasureCache } from './cache';
import {
  layoutHeaderFooterWithCache,
  HeaderFooterLayoutCache,
  type HeaderFooterBatch,
  type PageResolver,
} from './layoutHeaderFooter';
import {
  buildSectionAwareHeaderFooterLayoutKey,
  buildSectionAwareHeaderFooterMeasurementGroups,
} from './sectionAwareHeaderFooter';
import { FeatureFlags } from './featureFlags';
import { PageTokenLogger, HeaderFooterCacheLogger, globalMetrics } from './instrumentation';
import { HeaderFooterCacheState, invalidateHeaderFooterCache } from './cacheInvalidation';
import { getPreferredReserveCandidates, getPreferredReserveTrialTargets, scoreFootnoteWindow } from './footnote-scorer';

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
  /** Effective layout width when table grid widths exceed section content width (SD-1837). */
  effectiveWidth?: number;
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

type NormalizedColumns = NormalizedColumnLayout;
type PageColumns = NormalizedColumns & { left: number; contentWidth: number };

// TODO: Footnotes are measured against the widest column width for the section.
// If a footnote ultimately lands in a narrower column, its wrapping can be slightly off.
const resolveMaxColumnWidth = (contentWidth: number, columns?: ColumnLayout): number => {
  if (!columns || columns.count <= 1) return contentWidth;
  const normalized = normalizeColumnsForFootnotes(columns, contentWidth);
  return normalized.width;
};

const normalizeColumnsForFootnotes = (input: ColumnLayout | undefined, contentWidth: number): NormalizedColumns => {
  return normalizeColumnLayout(input, contentWidth, COLUMN_EPSILON);
};

const ooXmlSectionColumns = (columns?: ColumnLayout): ColumnLayout => cloneColumnLayout(columns);

const resolveSectionColumnsByIndex = (options: LayoutOptions, blocks?: FlowBlock[]): Map<number, ColumnLayout> => {
  const result = new Map<number, ColumnLayout>();
  let activeColumns: ColumnLayout = cloneColumnLayout(options.columns);

  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      if (block.kind !== 'sectionBreak') continue;
      const sectionIndexRaw = (block.attrs as { sectionIndex?: number } | undefined)?.sectionIndex;
      const sectionIndex =
        typeof sectionIndexRaw === 'number' && Number.isFinite(sectionIndexRaw) ? sectionIndexRaw : result.size;
      activeColumns = ooXmlSectionColumns(block.columns);
      result.set(sectionIndex, cloneColumnLayout(activeColumns));
    }
  }

  if (result.size === 0) {
    result.set(0, cloneColumnLayout(activeColumns));
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
    const columnsConfig = sectionColumns.get(sectionIndex) ?? options.columns ?? SINGLE_COLUMN_DEFAULT;
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
      if (fragment?.kind === 'table' && typeof fragment.columnIndex === 'number') {
        columnIndex = Math.max(0, Math.min(columns.count - 1, fragment.columnIndex));
      } else if (fragment && typeof fragment.x === 'number') {
        // Geometry-derived midpoint assignment: assign the ref to the column whose right edge plus
        // half its own gap the fragment falls before. Per-column widths/gaps come from the resolved
        // geometry, preserving the prior midpoint rule. The old uniform-stride branch was unreachable
        // for count>1 (normalized columns always carry widths). (SD-2629 4c)
        const geometry = getColumnGeometry(columns);
        columnIndex = Math.max(0, geometry.length - 1);
        for (const col of geometry) {
          if (fragment.x < columns.left + col.x + col.width + col.gapAfter / 2) {
            columnIndex = col.index;
            break;
          }
        }
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
  let activeColumns: ColumnLayout = cloneColumnLayout(options.columns);
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
      activeColumns = ooXmlSectionColumns(block.columns);
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
  // SD-2656: in the bodyMaxY-anchored band architecture, the actual band
  // capacity is `pageH - bottomMargin - bodyMaxY`. Using this as the planner's
  // maxReserve forces the planner to split (continuation) any fn body that
  // can't fit under body's actual position — which is what Word does.
  // Falls back to the legacy calc for pages without recorded bodyMaxY.
  const bodyMaxY = (page as { bodyMaxY?: number }).bodyMaxY;
  if (typeof bodyMaxY === 'number' && Number.isFinite(bodyMaxY) && bodyMaxY > topMargin) {
    return Math.max(0, pageSize.h - bottomMargin - bodyMaxY);
  }
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
  // SD-2656 Phase 0: per-page ledger data captured during planning. The
  // planner is the only place that knows mandatorySlices vs continuationSlices
  // vs extendedSlices and the continuation in/out queues — surface that here
  // so injectFragments can attach it to each Page object.
  ledgersByPage: Map<number, FootnotePageLedgerDraft>;
};

/**
 * Planner-emitted per-page ledger fragments. Combined with the applied body
 * reserve at injection time to form the full FootnotePageLedger.
 */
type FootnotePageLedgerDraft = {
  anchorIds: string[];
  mandatorySliceIds: string[];
  continuationSliceIds: string[];
  extendedSliceIds: string[];
  continuationIn: Array<{ id: string; remainingRangeCount: number; remainingHeightPx: number }>;
  continuationOut: Array<{ id: string; remainingRangeCount: number; remainingHeightPx: number }>;
  mandatoryReservePx: number;
  /** SD-2656 Phase 7: Word-like preferred reserve = full(non-last) + full(last) + overhead. */
  preferredReservePx: number;
  actualBandHeightPx: number;
  /** Number of measured lines rendered for the last anchor on this page (0 if no cluster). */
  lastAnchorRenderedLines: number;
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
    // SD-2656: when all lines fit, return the fitted range regardless of
    // spacingAfter. spacingAfter is the gap to the *next* paragraph; for
    // the last item placed in a band slice it shouldn't be charged against
    // the available height. Without this, a single-fn band whose body lines
    // fit exactly but whose post-paragraph spacing pushes the total over
    // the limit gets force-split (1 line placed + 3 lines continuation),
    // which is what caused the reference fixture's last fn to drip across 2 pages.
    if (fitted.height <= availableHeight) {
      return { fitted, remaining: null };
    }
    return { fitted: null, remaining: range };
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
      if (split.fitted) {
        // SD-2656: charge only the fitted *body* height (no spacingAfter)
        // when the fitted range completes the input — it's the last item in
        // this band slice, so trailing paragraph spacing is wasted. This
        // matches the relaxed check inside splitRangeAtHeight above.
        const fittedBodyHeight = split.fitted.height;
        const fittedFullHeight = getRangeRenderHeight(split.fitted);
        const charged = !split.remaining ? fittedBodyHeight : fittedFullHeight;
        if (charged <= remainingSpace) {
          fittedRanges.push(split.fitted);
          usedHeight += charged;
        }
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
  // Narrow runtime context (deliberately NOT on LayoutOptions): the per-document FontMeasureContext -
  // the SAME object whose `resolvePhysical` is bound into the measureBlock callback - plus the
  // signature the previous measures were taken with. Only `fontContext.fontSignature` is read here:
  // for the measure-cache keys (so two documents with different `fonts.map` cannot share a measure)
  // and to invalidate previous-measure reuse when this document's mapping changed since the prior
  // render. Passing the whole context rather than a separate signature string keys every cache off
  // the same object that supplies the resolver, so signature and resolver can never drift apart.
  fontRuntime?: { fontContext?: FontMeasureContext; previousFontSignature?: string },
): Promise<IncrementalLayoutResult> {
  const fontSignature = fontRuntime?.fontContext?.fontSignature ?? '';
  const previousFontSignature = fontRuntime?.previousFontSignature ?? '';
  const isSemanticFlow = options.flowMode === 'semantic';

  // In semantic mode, neutralize paginated-only inputs so downstream code
  // doesn't need per-step guards.
  if (isSemanticFlow) {
    headerFooter = undefined;
    nextBlocks = rewriteSectionBreaksForSemanticFlow(nextBlocks, options);
  }

  // Dirty region computation
  const dirty = computeDirtyRegions(previousBlocks, nextBlocks);

  if (dirty.deletedBlockIds.length > 0) {
    measureCache.invalidate(dirty.deletedBlockIds);
  }

  // Perf summary emitted at the end of the function.

  // Per-section constraints: each block is measured at its own section's content width.
  // This prevents text clipping in mixed-orientation documents (SD-1962) where the old
  // global-max approach measured all blocks at the widest section's width, causing line
  // breaks to be too wide for narrower sections.
  const perSectionConstraints = computePerSectionConstraints(options, nextBlocks);

  // Global max constraints are still used for cache invalidation comparison.
  const { measurementWidth, measurementHeight } = resolveMeasurementConstraints(options, nextBlocks);

  if (measurementWidth <= 0 || measurementHeight <= 0) {
    throw new Error('incrementalLayout: invalid measurement constraints resolved from options');
  }

  const hasPreviousMeasures = Array.isArray(previousMeasures) && previousMeasures.length === previousBlocks.length;
  // In semantic mode, the options-level semantic.contentWidth can change between
  // renders (container resize) while the block content stays the same. Since
  // previousConstraints is re-derived from the current options (not the options
  // that produced the previous measures), it would incorrectly match the current
  // constraints even when the previous measures were taken at a different width.
  // Disable previous-pass measure reuse in semantic mode; the width-keyed
  // measureCache still provides fast lookups for unchanged blocks.
  const previousConstraints =
    hasPreviousMeasures && !isSemanticFlow ? resolveMeasurementConstraints(options, previousBlocks) : null;
  const canReusePreviousMeasures =
    hasPreviousMeasures &&
    // A mapping change (different signature) makes the prior measures stale even for unchanged
    // blocks; this reuse path bypasses the measure-cache key, so it must check the signature too.
    fontSignature === previousFontSignature &&
    previousConstraints?.measurementWidth === measurementWidth &&
    previousConstraints?.measurementHeight === measurementHeight;
  const previousPerSectionConstraints = canReusePreviousMeasures
    ? computePerSectionConstraints(options, previousBlocks)
    : null;
  const previousMeasuresById = canReusePreviousMeasures
    ? new Map(previousBlocks.map((block, index) => [block.id, previousMeasures![index]]))
    : null;
  const previousConstraintsById = canReusePreviousMeasures
    ? new Map(previousBlocks.map((block, index) => [block.id, previousPerSectionConstraints![index]]))
    : null;

  const measureStart = performance.now();
  const measures: Measure[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  let reusedMeasures = 0;
  let cacheLookupTime = 0;
  let actualMeasureTime = 0;

  for (let blockIndex = 0; blockIndex < nextBlocks.length; blockIndex++) {
    const block = nextBlocks[blockIndex];
    if (block.kind === 'sectionBreak') {
      measures.push({ kind: 'sectionBreak' });
      continue;
    }

    // Use per-section constraints for this block's measurement.
    const sectionConstraints = perSectionConstraints[blockIndex];
    const blockMeasureWidth = sectionConstraints.maxWidth;
    const blockMeasureHeight = sectionConstraints.maxHeight;

    if (canReusePreviousMeasures && dirty.stableBlockIds.has(block.id)) {
      const previousMeasure = previousMeasuresById?.get(block.id);
      const previousBlockConstraints = previousConstraintsById?.get(block.id);
      if (
        previousMeasure &&
        previousBlockConstraints?.maxWidth === blockMeasureWidth &&
        previousBlockConstraints?.maxHeight === blockMeasureHeight
      ) {
        measures.push(previousMeasure);
        reusedMeasures++;
        continue;
      }
    }

    // Time the cache lookup (includes hashRuns computation)
    const lookupStart = performance.now();
    const cached = measureCache.get(block, blockMeasureWidth, blockMeasureHeight, fontSignature);
    cacheLookupTime += performance.now() - lookupStart;

    if (cached) {
      measures.push(cached);
      cacheHits++;
      continue;
    }

    // Time the actual DOM measurement
    const measureBlockStart = performance.now();
    const measurement = await measureBlock(block, sectionConstraints);
    actualMeasureTime += performance.now() - measureBlockStart;

    measureCache.set(block, blockMeasureWidth, blockMeasureHeight, measurement, fontSignature);
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
  let headerContentHeightsBySectionRef: Map<string, number> | undefined;

  // Check if we have headers via either headerBlocks (by variant) or headerBlocksByRId (by relationship ID)
  const hasHeaderBlocks = headerFooter?.headerBlocks && Object.keys(headerFooter.headerBlocks).length > 0;
  const hasHeaderBlocksByRId = headerFooter?.headerBlocksByRId && headerFooter.headerBlocksByRId.size > 0;
  const sectionMetadata = options.sectionMetadata ?? [];

  const measureHeightsByReference = async (
    kind: 'header' | 'footer',
    blocksByRId: Map<string, FlowBlock[]> | undefined,
    constraints: HeaderFooterConstraints,
    measureFn: HeaderFooterMeasureFn,
    pageResolver?: PageResolver,
  ): Promise<{
    heightsByRId?: Map<string, number>;
    heightsBySectionRef?: Map<string, number>;
  }> => {
    if (!blocksByRId || blocksByRId.size === 0) {
      return {};
    }

    const heightsByRId = new Map<string, number>();
    const heightsBySectionRef = new Map<string, number>();
    const sectionAwareGroups = buildSectionAwareHeaderFooterMeasurementGroups(
      kind,
      blocksByRId,
      sectionMetadata,
      constraints,
    );

    if (sectionAwareGroups.length > 0) {
      for (const group of sectionAwareGroups) {
        const blocks = blocksByRId.get(group.rId);
        if (!blocks || blocks.length === 0) continue;

        const layouts = await layoutHeaderFooterWithCache(
          { default: blocks },
          group.sectionConstraints,
          measureFn,
          headerMeasureCache,
          1,
          pageResolver,
          kind,
        );
        const layout = layouts.default?.layout;
        if (!layout || !(layout.height > 0)) continue;

        const nextHeight = Math.max(0, layout.height);
        const currentHeight = heightsByRId.get(group.rId) ?? 0;
        if (nextHeight > currentHeight) {
          heightsByRId.set(group.rId, nextHeight);
        }

        for (const sectionIndex of group.sectionIndices) {
          heightsBySectionRef.set(buildSectionAwareHeaderFooterLayoutKey(group.rId, sectionIndex), nextHeight);
        }
      }

      return {
        heightsByRId: heightsByRId.size > 0 ? heightsByRId : undefined,
        heightsBySectionRef: heightsBySectionRef.size > 0 ? heightsBySectionRef : undefined,
      };
    }

    for (const [rId, blocks] of blocksByRId) {
      if (!blocks || blocks.length === 0) continue;

      const layouts = await layoutHeaderFooterWithCache(
        { default: blocks },
        constraints,
        measureFn,
        headerMeasureCache,
        1,
        pageResolver,
        kind,
      );
      const layout = layouts.default?.layout;
      if (layout && layout.height > 0) {
        heightsByRId.set(rId, layout.height);
      }
    }

    return {
      heightsByRId: heightsByRId.size > 0 ? heightsByRId : undefined,
    };
  };

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
    const prelayoutPageResolver = buildConservativePrelayoutPageResolver(nextBlocks, sectionMetadata);

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
        prelayoutPageResolver,
        'header',
        fontSignature,
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
      const measuredHeights = await measureHeightsByReference(
        'header',
        headerFooter.headerBlocksByRId,
        headerFooter.constraints,
        measureFn,
        prelayoutPageResolver,
      );
      headerContentHeightsByRId = measuredHeights.heightsByRId;
      headerContentHeightsBySectionRef = measuredHeights.heightsBySectionRef;
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
  let footerContentHeightsBySectionRef: Map<string, number> | undefined;

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
    const prelayoutPageResolver = buildConservativePrelayoutPageResolver(nextBlocks, sectionMetadata);

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
          prelayoutPageResolver,
          'footer',
          fontSignature,
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
        const measuredHeights = await measureHeightsByReference(
          'footer',
          headerFooter.footerBlocksByRId,
          headerFooter.constraints,
          measureFn,
          prelayoutPageResolver,
        );
        footerContentHeightsByRId = measuredHeights.heightsByRId;
        footerContentHeightsBySectionRef = measuredHeights.heightsBySectionRef;
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
    headerContentHeightsBySectionRef, // Pass header heights by rId+section for exact page-specific margin calculation
    headerContentHeightsByRId, // Pass header heights by rId for per-page margin calculation
    footerContentHeightsBySectionRef, // Pass footer heights by rId+section for exact page-specific margin calculation
    footerContentHeightsByRId, // Pass footer heights by rId for per-page margin calculation
    remeasureParagraph: (block: FlowBlock, maxWidth: number, firstLineIndent?: number) =>
      remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent),
  });
  const layoutEnd = performance.now();
  const layoutTime = layoutEnd - layoutStart;
  perfLog(`[Perf] 4.2 Layout document (pagination): ${layoutTime.toFixed(2)}ms`);

  // Two-pass convergence loop for page number token resolution.
  // Steps: paginate -> build numbering context -> resolve PAGE/NUMPAGES tokens
  //        -> remeasure affected blocks -> re-paginate -> repeat until stable
  const maxIterations = 3;
  let currentBlocks = nextBlocks;
  let currentMeasures = measures;
  let iteration = 0;
  // Chapter context only reads stable paragraph style/marker metadata; PAGE
  // token convergence clones run text but does not change those block attrs.
  const chapterBlockById = buildBlockById(currentBlocks);
  const chapterContextCache: ChapterContextCache = {};

  const pageTokenStart = performance.now();
  let totalAffectedBlocks = 0;
  let totalRemeasureTime = 0;
  let totalRelayoutTime = 0;
  let converged = true;

  // Only run token resolution if feature flag is enabled
  if (!isSemanticFlow && FeatureFlags.BODY_PAGE_TOKENS) {
    while (iteration < maxIterations) {
      // Build numbering context from current layout
      const sections = options.sectionMetadata ?? [];
      const numberingCtx = buildNumberingContext(layout, sections, chapterBlockById, chapterContextCache);

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

      // Re-measure affected blocks using per-section constraints
      const remeasureStart = performance.now();
      const currentPerSectionConstraints = computePerSectionConstraints(options, currentBlocks);
      currentMeasures = await remeasureAffectedBlocks(
        currentBlocks,
        currentMeasures,
        tokenResult.affectedBlockIds,
        currentPerSectionConstraints,
        measureBlock,
        fontSignature,
        measureCache,
      );
      const remeasureEnd = performance.now();
      const remeasureTime = remeasureEnd - remeasureStart;
      totalRemeasureTime += remeasureTime;
      perfLog(`[Perf] 4.3.${iteration + 1}.1 Re-measure: ${remeasureTime.toFixed(2)}ms`);
      PageTokenLogger.logRemeasure(tokenResult.affectedBlockIds.size, remeasureTime);

      // Re-run pagination with updated measures
      const relayoutStart = performance.now();
      layout = layoutDocument(currentBlocks, currentMeasures, {
        ...options,
        headerContentHeights, // Pass header heights to prevent overlap (per-variant)
        footerContentHeights, // Pass footer heights to prevent overlap (per-variant)
        headerContentHeightsBySectionRef, // Pass header heights by rId+section for exact page-specific margin calculation
        headerContentHeightsByRId, // Pass header heights by rId for per-page margin calculation
        footerContentHeightsBySectionRef, // Pass footer heights by rId+section for exact page-specific margin calculation
        footerContentHeightsByRId, // Pass footer heights by rId for per-page margin calculation
        remeasureParagraph: (block: FlowBlock, maxWidth: number, firstLineIndent?: number) =>
          remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent),
      });
      const relayoutEnd = performance.now();
      const relayoutTime = relayoutEnd - relayoutStart;
      totalRelayoutTime += relayoutTime;
      perfLog(`[Perf] 4.3.${iteration + 1}.2 Re-layout: ${relayoutTime.toFixed(2)}ms`);

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
  if (!isSemanticFlow && footnotesInput && footnotesInput.refs.length > 0 && footnotesInput.blocksById.size > 0) {
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
    // §17.11.23 w:separator — "spans part of the width text extents"
    // §17.11.1  w:continuationSeparator — "spans the width of the main story's text extents"
    const SEPARATOR_DEFAULT_WIDTH_FACTOR = 0.5;

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
            const cached = measureCache.get(
              block,
              footnoteConstraints.maxWidth,
              footnoteConstraints.maxHeight,
              fontSignature,
            );
            if (cached) {
              measuresById.set(block.id, cached);
              return;
            }
            const measurement = await measureBlock(block, footnoteConstraints);
            measureCache.set(
              block,
              footnoteConstraints.maxWidth,
              footnoteConstraints.maxHeight,
              measurement,
              fontSignature,
            );
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
        // SD-2656 Phase 0: per-page ledger drafts captured during planning.
        const ledgersByPage = new Map<number, FootnotePageLedgerDraft>();

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

          // SD-1680: cap placement to the footnote demand on this page (capped by maxReserve).
          // Demand = sum of measured heights of all footnote refs anchored here, plus the
          // separator/padding/gap overhead they would incur when stacked. Capping placement
          // at `min(demand, maxReserve)` (rather than `baseReserve`) decouples the plan's
          // placement from the body's prior-pass reserve: the plan reports how much band
          // the footnotes actually need, the body grows its reserve to match on the next
          // pass, and placement never exceeds maxReserve so footnotes cannot render past
          // the page's bottom margin.
          // SD-2656: placement ceiling = maxReserve (the actual band capacity
          // left by the body after its ordered-cluster reservation).
          const placementCeiling = maxReserve;

          // SD-2656: per-footnote full and first-line heights, used to
          // estimate next-page cluster demand for the carry-forward bump.
          const fullHeightOf = (id: string): number => {
            const ranges = rangesByFootnoteId.get(id) ?? [];
            let total = 0;
            ranges.forEach((range) => {
              const spacingAfter = 'spacingAfter' in range ? (range.spacingAfter ?? 0) : 0;
              total += range.height + spacingAfter;
            });
            return total;
          };
          const firstLineOf = (id: string): number => {
            const measured = firstLineHeightById.get(id);
            if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) {
              return measured;
            }
            const ranges = rangesByFootnoteId.get(id) ?? [];
            return ranges.length > 0 ? ranges[0].height : 0;
          };

          const pendingForPage = new Map<number, Array<{ id: string; ranges: FootnoteRange[] }>>();
          pendingByColumn.forEach((entries, columnIndex) => {
            const targetIndex = columnIndex < columnCount ? columnIndex : Math.max(0, columnCount - 1);
            const list = pendingForPage.get(targetIndex) ?? [];
            list.push(...entries);
            pendingForPage.set(targetIndex, list);
          });
          // SD-2656 Phase 0: capture continuationIn for the ledger BEFORE we
          // start placing on this page (pendingForPage will be consumed by
          // placement).
          const continuationInForPage: Array<{ id: string; remainingRangeCount: number; remainingHeightPx: number }> =
            [];
          pendingForPage.forEach((entries) => {
            entries.forEach((entry) => {
              let total = 0;
              entry.ranges.forEach((range) => {
                const spacingAfter = 'spacingAfter' in range ? (range.spacingAfter ?? 0) : 0;
                total += range.height + spacingAfter;
              });
              continuationInForPage.push({
                id: entry.id,
                remainingRangeCount: entry.ranges.length,
                remainingHeightPx: total,
              });
            });
          });
          pendingByColumn = new Map();

          const pageSlices: FootnoteSlice[] = [];
          let pageReserve = 0;

          for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
            let usedHeight = 0;
            const columnSlices: FootnoteSlice[] = [];
            const nextPending: Array<{ id: string; ranges: FootnoteRange[] }> = [];
            const columnKey = footnoteColumnKey(pageIndex, columnIndex);

            // SD-2656: planner enforcement of the ordered-cluster rule. For
            // new anchors that are NOT the last on this page, partial
            // placement is forbidden — they must fit fully, otherwise the
            // body reserved space for `full(non-last)` that the planner
            // would waste on a single line. For the LAST anchor (and for
            // incoming continuations), forceFirst keeps the existing
            // behavior (place at least one slice when budget allows).
            const placeFootnote = (
              id: string,
              ranges: FootnoteRange[],
              isContinuation: boolean,
              isLastOnPage: boolean,
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
              const availableHeight = Math.max(0, placementCeiling - usedHeight - overhead - gapBefore);
              // SD-2656: forceFirst applies whenever the anchor is allowed to
              // split — i.e. the LAST anchor on the cluster (rule), or a
              // continuation draining leftover space. Not gated on
              // isFirstSlice — the last anchor is usually placed AFTER its
              // non-last siblings, so it's rarely the first slice on the
              // column. Without this, fn N on a cluster of [A..N-1, N] fails
              // to render its first line and the rule "last anchor renders
              // at least firstLine" is violated.
              const allowForceFirst = (isLastOnPage || isContinuation) && placementCeiling > 0;
              const { slice, remainingRanges } = fitFootnoteContent(
                id,
                ranges,
                availableHeight,
                pageIndex,
                columnIndex,
                isContinuation,
                measuresById,
                allowForceFirst,
              );

              if (slice.ranges.length === 0) {
                return { placed: false, remaining: ranges };
              }
              // Non-last new anchor that only partially fit: refuse the
              // placement entirely. The whole anchor defers to the next page
              // so the rule "non-last anchors complete on their page" holds.
              if (!isLastOnPage && !isContinuation && remainingRanges.length > 0) {
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

            // SD-2656: reserve cluster room BEFORE placing continuations, so
            // a huge incoming continuation can't eat the band and starve the
            // current page's cluster. Continuations render at the TOP of the
            // band (Word's order) because we place them first onto
            // columnSlices, but their availableHeight is capped at
            // (placementCeiling - clusterReserve).
            const ids = idsByColumn.get(pageIndex)?.get(columnIndex) ?? [];
            const lastIdx = ids.length - 1;
            let clusterReserve = 0;
            for (let i = 0; i < ids.length; i += 1) {
              const isLast = i === lastIdx;
              clusterReserve += isLast ? firstLineOf(ids[i]) : fullHeightOf(ids[i]);
              if (i > 0) clusterReserve += safeGap;
            }

            // Continuations first (visual top). Pretend cluster's room is
            // already used so placeFootnote sees the lowered ceiling.
            usedHeight += clusterReserve;
            const pending = pendingForPage.get(columnIndex) ?? [];
            for (let pendingIdx = 0; pendingIdx < pending.length; pendingIdx += 1) {
              const entry = pending[pendingIdx];
              if (!entry.ranges || entry.ranges.length === 0) continue;
              const result = placeFootnote(entry.id, entry.ranges, true, false);
              if (!result.placed) {
                // Continuation doesn't fit alongside the cluster reservation
                // — defer this and all later continuations to preserve order.
                for (let deferIdx = pendingIdx; deferIdx < pending.length; deferIdx += 1) {
                  nextPending.push(pending[deferIdx]);
                }
                break;
              }
              if (result.remaining.length > 0) {
                nextPending.push({ id: entry.id, ranges: result.remaining });
              }
            }
            usedHeight -= clusterReserve;

            // New anchors second (visual bottom).
            for (let idIndex = 0; idIndex < ids.length; idIndex += 1) {
              const id = ids[idIndex];
              const ranges = rangesByFootnoteId.get(id) ?? [];
              if (ranges.length === 0) continue;
              const isLastOnPage = idIndex === lastIdx;
              const result = placeFootnote(id, ranges, false, isLastOnPage);
              if (!result.placed) {
                nextPending.push({ id, ranges });
                for (let remainingIndex = idIndex + 1; remainingIndex < ids.length; remainingIndex += 1) {
                  const remainingId = ids[remainingIndex];
                  const remainingRanges = rangesByFootnoteId.get(remainingId) ?? [];
                  nextPending.push({ id: remainingId, ranges: remainingRanges });
                }
                break;
              }
              if (result.remaining.length > 0) {
                nextPending.push({ id, ranges: result.remaining });
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
          // SD-2656: MAX with any pre-existing value (set by an earlier
          // page's pending-continuation bump) so we don't overwrite the
          // bumped reserve.
          reserves[pageIndex] = Math.max(reserves[pageIndex] ?? 0, pageReserve);

          // SD-2656 Phase 0: build the per-page ledger draft. The planner is
          // the only place that knows which slices were placed as
          // continuations vs new anchors and what continuationOut carries to
          // the next page. injectFragments combines this with the applied
          // body reserve to populate page.footnoteLedger.
          {
            const idsOnPage = (() => {
              const out: string[] = [];
              for (let cIdx = 0; cIdx < columnCount; cIdx += 1) {
                const colIds = idsByColumn.get(pageIndex)?.get(cIdx) ?? [];
                for (const id of colIds) if (!out.includes(id)) out.push(id);
              }
              return out;
            })();

            // Slice classification: mandatorySlice = first placed slice of
            // each new anchor (the rule's "render at least firstLine of
            // last + full of non-last" is satisfied by the union of these);
            // extendedSlice = subsequent slices of the same new anchor;
            // continuationSlice = isContinuation slices (from prior pages).
            const seenNewAnchor = new Set<string>();
            const mandatorySliceIds: string[] = [];
            const continuationSliceIds: string[] = [];
            const extendedSliceIds: string[] = [];
            let actualBandHeight = 0;
            const safeSepBefore = Math.max(0, separatorSpacingBefore);
            const overheadBase = safeSepBefore + safeDividerHeight + safeTopPadding;
            for (const slice of pageSlices) {
              if (slice.isContinuation) {
                continuationSliceIds.push(slice.id);
              } else if (!seenNewAnchor.has(slice.id)) {
                mandatorySliceIds.push(slice.id);
                seenNewAnchor.add(slice.id);
              } else {
                extendedSliceIds.push(slice.id);
              }
              actualBandHeight += slice.totalHeight;
            }
            if (pageSlices.length > 0) {
              actualBandHeight += overheadBase + safeGap * Math.max(0, pageSlices.length - 1);
            }

            // Mandatory reserve = full of non-last + firstLine of last for
            // the page's anchor cluster (regardless of how the planner
            // actually placed them — this is what the rule requires).
            let mandatoryReserve = 0;
            // SD-2656 Phase 7: Preferred reserve = full of every anchor on the
            // cluster (Word-like — last anchor also renders fully when room
            // exists). Body slicer may choose this when safe.
            let preferredReserve = 0;
            // SD-2656 (post-Vivienne Carlsbad p22): Any continuation flowing
            // INTO this page (from a prior page's spill) must also fit on this
            // page — it can't move anywhere else. Include it in BOTH reserves
            // so the scorer's preferred target is large enough to actually
            // fit the full cluster alongside the carry-over content.
            let continuationInHeight = 0;
            for (const entry of continuationInForPage) {
              continuationInHeight += entry.remainingHeightPx;
            }
            if (continuationInHeight > 0) {
              mandatoryReserve += continuationInHeight;
              preferredReserve += continuationInHeight;
              if (idsOnPage.length > 0) {
                mandatoryReserve += safeGap;
                preferredReserve += safeGap;
              }
            }
            if (idsOnPage.length > 0) {
              for (let i = 0; i < idsOnPage.length; i += 1) {
                const isLast = i === idsOnPage.length - 1;
                mandatoryReserve += isLast ? firstLineOf(idsOnPage[i]) : fullHeightOf(idsOnPage[i]);
                preferredReserve += fullHeightOf(idsOnPage[i]);
                if (i > 0) {
                  mandatoryReserve += safeGap;
                  preferredReserve += safeGap;
                }
              }
              mandatoryReserve += overheadBase;
              preferredReserve += overheadBase;
            } else if (continuationInHeight > 0) {
              // Continuation-only page (no new anchors). Still needs overhead.
              mandatoryReserve += overheadBase;
              preferredReserve += overheadBase;
            }

            // SD-2656 Phase 7: how many measured lines of the last anchor we
            // actually rendered. Used to flag "mandatory-only" pages where
            // Word would have rendered more of the last footnote.
            let lastAnchorRenderedLines = 0;
            if (idsOnPage.length > 0) {
              const lastId = idsOnPage[idsOnPage.length - 1];
              for (const slice of pageSlices) {
                if (slice.id !== lastId || slice.isContinuation) continue;
                for (const range of slice.ranges) {
                  // Only paragraph and list-item ranges have line tracking;
                  // table/image/drawing footnote ranges are single blocks.
                  if (range.kind === 'paragraph' || range.kind === 'list-item') {
                    lastAnchorRenderedLines += Math.max(0, range.toLine - range.fromLine);
                  } else {
                    lastAnchorRenderedLines += 1;
                  }
                }
              }
            }

            // continuationOut: what we just deferred to the next page.
            const continuationOut: Array<{ id: string; remainingRangeCount: number; remainingHeightPx: number }> = [];
            pendingByColumn.forEach((entries) => {
              entries.forEach((entry) => {
                let total = 0;
                entry.ranges.forEach((range) => {
                  const spacingAfter = 'spacingAfter' in range ? (range.spacingAfter ?? 0) : 0;
                  total += range.height + spacingAfter;
                });
                continuationOut.push({
                  id: entry.id,
                  remainingRangeCount: entry.ranges.length,
                  remainingHeightPx: total,
                });
              });
            });

            ledgersByPage.set(pageIndex, {
              anchorIds: idsOnPage,
              mandatorySliceIds,
              continuationSliceIds,
              extendedSliceIds,
              continuationIn: continuationInForPage,
              continuationOut,
              mandatoryReservePx: Math.ceil(mandatoryReserve),
              preferredReservePx: Math.ceil(preferredReserve),
              actualBandHeightPx: Math.ceil(actualBandHeight),
              lastAnchorRenderedLines,
            });
          }

          // SD-2656 Phase 3: bounded continuation draining.
          //
          // The carry-forward bump gives the next page enough room for
          //   (a) its own cluster (mandatory by the rule), AND
          //   (b) the portion of the inbound continuation that can
          //       realistically fit alongside (a) on the next page.
          //
          // Previously we summed continuationDemand + nextClusterDemand
          // capped at physical body area. That over-reserved when the
          // continuation chain was longer than one page: the next page
          // couldn't drain ALL of it anyway, so reserving the whole chain
          // just inflated dead reserve. Overflow now propagates naturally:
          // any continuation beyond next-page capacity stays in
          // pendingByColumn and lands on page+2, page+3, etc.
          if (pageIndex + 1 < pageCount) {
            let continuationDemand = 0;
            pendingByColumn.forEach((entries) => {
              entries.forEach((entry) => {
                entry.ranges.forEach((range) => {
                  const spacingAfter = 'spacingAfter' in range ? (range.spacingAfter ?? 0) : 0;
                  continuationDemand += range.height + spacingAfter;
                });
              });
            });
            // Next page's mandatory cluster demand (ordered minimum).
            let nextClusterDemand = 0;
            for (let cIdx = 0; cIdx < columnCount; cIdx += 1) {
              const idsNext = idsByColumn.get(pageIndex + 1)?.get(cIdx) ?? [];
              if (idsNext.length === 0) continue;
              let columnCluster = 0;
              for (let i = 0; i < idsNext.length; i += 1) {
                const isLast = i === idsNext.length - 1;
                columnCluster += isLast ? firstLineOf(idsNext[i]) : fullHeightOf(idsNext[i]);
                if (i > 0) columnCluster += safeGap;
              }
              if (columnCluster > nextClusterDemand) nextClusterDemand = columnCluster;
            }
            if (continuationDemand > 0 || nextClusterDemand > 0) {
              const overhead = safeSeparatorSpacingBefore + continuationDividerHeight + safeTopPadding;
              const nextPage = layoutForPages.pages?.[pageIndex + 1];
              const nextPageSize = nextPage?.size ?? layoutForPages.pageSize ?? DEFAULT_PAGE_SIZE;
              const nextTop = normalizeMargin(nextPage?.margins?.top, DEFAULT_MARGINS.top);
              const nextBottomRaw = normalizeMargin(nextPage?.margins?.bottom, DEFAULT_MARGINS.bottom);
              const physicalContentHeight = Math.max(0, nextPageSize.h - nextTop - nextBottomRaw);
              const minBodyHeight = MIN_FOOTNOTE_BODY_HEIGHT * 20;
              const nextPageMaxBand = Math.max(0, physicalContentHeight - minBodyHeight);
              // The band has a single overhead block (separator + padding)
              // whether or not we have a cluster.
              const overheadForBand = nextClusterDemand > 0 || continuationDemand > 0 ? overhead : 0;
              // Mandatory cluster room (cluster slices only, no overhead).
              const clusterRoomPx =
                nextClusterDemand > 0 ? Math.min(nextClusterDemand, Math.max(0, nextPageMaxBand - overheadForBand)) : 0;
              // Continuation room = whatever's left after cluster + overhead.
              const continuationRoomPx = Math.max(0, nextPageMaxBand - overheadForBand - clusterRoomPx);
              const continuationToReservePx = Math.min(continuationDemand, continuationRoomPx);
              // Final reserve: cluster + continuation + single overhead block,
              // clamped at the physical band cap.
              const finalReserve = Math.min(clusterRoomPx + continuationToReservePx + overheadForBand, nextPageMaxBand);
              reserves[pageIndex + 1] = Math.max(reserves[pageIndex + 1] ?? 0, Math.ceil(finalReserve));
            }
          }
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

        return {
          slicesByPage,
          reserves,
          hasContinuationByColumn,
          separatorSpacingBefore: safeSeparatorSpacingBefore,
          ledgersByPage,
        };
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
          // SD-2656 Phase 0: attach the per-page ledger. Combine the planner
          // draft with the applied body reserve we just stamped. This is the
          // single source of truth that Phase 1+ will read.
          const draft = plan.ledgersByPage.get(pageIndex);
          if (draft) {
            page.footnoteLedger = {
              pageIndex,
              anchorIds: draft.anchorIds,
              mandatorySliceIds: draft.mandatorySliceIds,
              continuationSliceIds: draft.continuationSliceIds,
              extendedSliceIds: draft.extendedSliceIds,
              continuationIn: draft.continuationIn,
              continuationOut: draft.continuationOut,
              mandatoryReservePx: draft.mandatoryReservePx,
              preferredReservePx: draft.preferredReservePx,
              actualBandHeightPx: draft.actualBandHeightPx,
              appliedBodyReservePx: page.footnoteReserved ?? 0,
              deadReservePx: Math.max(0, (page.footnoteReserved ?? 0) - draft.actualBandHeightPx),
              lastAnchorRenderedLines: draft.lastAnchorRenderedLines,
            };
          }
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
            options.columns ?? SINGLE_COLUMN_DEFAULT,
            pageContentWidth,
          );
          const columns = pageColumns.get(pageIndex) ?? {
            ...fallbackColumns,
            left: marginLeft,
            contentWidth: pageContentWidth,
          };
          // SD-2656: Word anchors the footnote band to the page's bottom
          // margin (band bottom = pageH - originalBottomMargin), with any
          // slack appearing as whitespace BETWEEN body and band. Our previous
          // approach (band top = bodyMaxY) inverted that — whitespace landed
          // BELOW the band instead, visibly different from Word on every
          // page with a non-full band. We bottom-anchor per column, with
          // bodyMaxY as a safety floor for the dense case (band would
          // otherwise overlap body when planner-placed content fills the
          // available reserve).
          //
          // `page.margins.bottom` is the convergence-inflated value (original
          // + reserve). The original bottom margin is therefore margins.bottom
          // minus the per-page reserve we just stashed.
          const physicalBottomMargin = Math.max(0, (page.margins.bottom ?? 0) - (page.footnoteReserved ?? 0));
          const pageBottomLimit = pageSize.h - physicalBottomMargin;
          const bodyMaxYValue = (page as { bodyMaxY?: number }).bodyMaxY;
          const bodyMaxY =
            typeof bodyMaxYValue === 'number' && Number.isFinite(bodyMaxYValue)
              ? bodyMaxYValue
              : pageSize.h - (page.margins.bottom ?? 0);

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
            const columnX = getColumnX(getColumnGeometry(columns), columnIndex, columns.left);
            // Placement width stays uniform (= the measurement width); per-column footnote
            // measurement is a deliberate follow-up, not this pass. (SD-2629 4c; do not narrow here)
            const contentWidth = Math.min(columns.width, footnoteWidth);
            if (!Number.isFinite(contentWidth) || contentWidth <= 0) return;

            const columnKey = footnoteColumnKey(pageIndex, columnIndex);
            const isContinuation = plan.hasContinuationByColumn.get(columnKey) ?? false;

            // SD-2656: compute this column's total band height so we can
            // bottom-anchor it (Word-style). totalBandHeight matches the
            // planner's demand calc: separator-before + divider + top-padding
            // + sum(slice heights) + gap-between-slices.
            const colSeparatorHeight = isContinuation ? continuationDividerHeight : safeDividerHeight;
            let colTotalBandHeight = Math.max(0, plan.separatorSpacingBefore) + colSeparatorHeight + safeTopPadding;
            for (let s = 0; s < columnSlices.length; s += 1) {
              colTotalBandHeight += columnSlices[s].totalHeight;
              if (s > 0) colTotalBandHeight += safeGap;
            }
            const bandTopY = Math.max(bodyMaxY, pageBottomLimit - colTotalBandHeight);

            // Optional visible separator line (Word-like). Uses a 1px filled rect.
            let cursorY = bandTopY + Math.max(0, plan.separatorSpacingBefore);
            const separatorHeight = isContinuation ? continuationDividerHeight : safeDividerHeight;
            const separatorWidth = isContinuation
              ? contentWidth
              : Math.max(0, contentWidth * SEPARATOR_DEFAULT_WIDTH_FACTOR);
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
                  const tableWidthRaw = Math.max(0, measure.totalWidth ?? contentWidth);
                  const { x: tableX, width: tableWidth } = resolveTableFrame(
                    columnX,
                    contentWidth,
                    tableWidthRaw,
                    block.attrs,
                  );
                  // Rescale column widths only when the resolved fragment width is narrower
                  // than the measured table width. Today that primarily happens for
                  // percentage-width tables rendered in a narrower section (SD-1859),
                  // while non-percent wide tables keep their measured overflow width.
                  const fragmentColumnWidths = rescaleColumnWidths(
                    measure.columnWidths,
                    measure.totalWidth,
                    tableWidth,
                  );

                  page.fragments.push({
                    kind: 'table',
                    blockId: range.blockId,
                    columnIndex,
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

      // SD-3049: per-footnote total body height; accounting mirrors `computeFootnoteLayoutPlan`.
      // SD-2656: alongside the total, compute the first valid line/run height
      // so the body slicer can apply the ordered-cluster demand model.
      let bodyHeightById = new Map<string, number>();
      let firstLineHeightById = new Map<string, number>();
      const refreshBodyHeights = (measures: Map<string, Measure>) => {
        const totalMap = new Map<string, number>();
        const firstLineMap = new Map<string, number>();
        footnotesInput.blocksById.forEach((blocks, footnoteId) => {
          let total = 0;
          let firstLine = 0;
          for (const block of blocks) {
            const measure = measures.get(block.id);
            if (!measure) continue;
            if (measure.kind === 'paragraph') {
              const measureH = (measure as { totalHeight?: number }).totalHeight;
              if (typeof measureH === 'number' && Number.isFinite(measureH)) total += measureH;
              const spacing = (block as { attrs?: { spacing?: { after?: number; lineSpaceAfter?: number } } }).attrs
                ?.spacing;
              const after = spacing?.after ?? spacing?.lineSpaceAfter;
              if (typeof after === 'number' && Number.isFinite(after) && after > 0) total += after;
              // SD-2656: first paragraph's first line is the first valid run.
              if (firstLine === 0) {
                const lines = (measure as { lines?: Array<{ lineHeight?: number }> }).lines;
                const lh = lines && lines.length > 0 ? lines[0].lineHeight : undefined;
                if (typeof lh === 'number' && Number.isFinite(lh) && lh > 0) firstLine = lh;
              }
            } else if (measure.kind === 'image' || measure.kind === 'drawing') {
              const measureH = (measure as { height?: number }).height;
              if (typeof measureH === 'number' && Number.isFinite(measureH)) total += measureH;
              // SD-2656: atomic content — first "line" is the whole thing.
              if (firstLine === 0 && typeof measureH === 'number' && Number.isFinite(measureH)) firstLine = measureH;
            } else if (measure.kind === 'table') {
              const measureH = (measure as { totalHeight?: number }).totalHeight;
              if (typeof measureH === 'number' && Number.isFinite(measureH)) total += measureH;
              if (firstLine === 0 && typeof measureH === 'number' && Number.isFinite(measureH)) firstLine = measureH;
            } else if (measure.kind === 'list' && block.kind === 'list') {
              for (const item of block.items) {
                const itemMeasure = measure.items.find((entry) => entry.itemId === item.id);
                if (!itemMeasure?.paragraph?.lines) continue;
                for (const line of itemMeasure.paragraph.lines) total += line.lineHeight ?? 0;
                total += getParagraphSpacingAfter(item.paragraph);
              }
              // SD-2656: first list item's first line.
              if (firstLine === 0) {
                const firstItem = measure.items[0];
                const lh = firstItem?.paragraph?.lines?.[0]?.lineHeight;
                if (typeof lh === 'number' && Number.isFinite(lh) && lh > 0) firstLine = lh;
              }
            }
          }
          if (total > 0) totalMap.set(footnoteId, total);
          if (firstLine > 0) firstLineMap.set(footnoteId, firstLine);
        });
        bodyHeightById = totalMap;
        firstLineHeightById = firstLineMap;
      };

      // SD-2656: thread the planner's data-driven band overhead values
      // (topPadding, dividerHeight, gap, separatorSpacingBefore) through
      // `footnotes` so the layout-engine's body slicer computes the SAME
      // `bandOverhead(refs)` budget the planner uses to size the band.
      // Otherwise the slicer falls back to defaults that drift on docs with
      // custom separator dimensions, packing body onto a page whose band
      // can't actually fit the refs.
      const relayout = (footnoteReservedByPageIndex: number[], plannerSeparatorSpacingBefore?: number) =>
        layoutDocument(currentBlocks, currentMeasures, {
          ...options,
          footnoteReservedByPageIndex,
          footnotes: {
            ...footnotesInput,
            bodyHeightById,
            firstLineHeightById,
            ...(typeof plannerSeparatorSpacingBefore === 'number' && Number.isFinite(plannerSeparatorSpacingBefore)
              ? { separatorSpacingBefore: plannerSeparatorSpacingBefore }
              : {}),
          },
          headerContentHeights,
          footerContentHeights,
          headerContentHeightsBySectionRef,
          headerContentHeightsByRId,
          footerContentHeightsBySectionRef,
          footerContentHeightsByRId,
          remeasureParagraph: (block: FlowBlock, maxWidth: number, firstLineIndent?: number) =>
            remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent),
        });

      // SD-3049: every reachable footnote id, computed once. Used to keep
      // `bodyHeightById` complete across convergence iterations even when refs
      // migrate between pages — the assigned-by-column subset can drop ids
      // mid-loop, which would zero their entries and cause oscillation.
      const allFootnoteIds = new Set(footnotesInput.refs.map((ref) => ref.id));

      // Pass 1: assign + reserve from current layout. Pre-measure ALL footnote
      // bodies (the cache makes the assigned-only subset essentially free).
      let { columns: pageColumns, idsByColumn } = resolveFootnoteAssignments(layout);
      let { measuresById } = await measureFootnoteBlocks(allFootnoteIds);
      refreshBodyHeights(measuresById);
      let plan = computeFootnoteLayoutPlan(layout, idsByColumn, measuresById, [], pageColumns);
      let reserves = plan.reserves;

      // Relayout with footnote reserves and iterate until reserves and page count stabilize,
      // so each page gets the correct reserve (avoids "too much" on one page and "not enough" on another).
      if (reserves.some((h) => h > 0)) {
        let reservesStabilized = false;
        const seenReserveVectors: number[][] = [reserves.slice()];
        for (let pass = 0; pass < MAX_FOOTNOTE_LAYOUT_PASSES; pass += 1) {
          layout = relayout(reserves, plan.separatorSpacingBefore);
          ({ columns: pageColumns, idsByColumn } = resolveFootnoteAssignments(layout));
          // SD-3049: measure the full set each iteration so `bodyHeightById`
          // stays complete; refs migrating between pages must not drop their
          // measured demand from the per-block lookup.
          ({ measuresById } = await measureFootnoteBlocks(allFootnoteIds));
          refreshBodyHeights(measuresById);
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
          // Reserves are oscillating. Break out; the post-reserve grow loop
          // below (which is monotonic and has its own cycle detector) will
          // bump any under-reserved pages to the current plan's demand.
          // Merging history here would carry over large demands from early
          // passes that the current layout no longer anchors, leading to
          // wasted reserved space on pages that never get any footnote.
          if (seenReserveVectors.some((v) => v.join(',') === nextReserves.join(','))) break;
          seenReserveVectors.push(nextReserves.slice());
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
        let reservesAppliedToLayout = reserves;

        const vectorsEqual = (a: number[], b: number[]): boolean => {
          for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
            if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
          }
          return true;
        };
        const applyReserves = async (target: number[]) => {
          // Planner sized the band with the measured separator spacing; the
          // body slicer must match or it packs too much and the band overflows.
          layout = relayout(target, finalPlan.separatorSpacingBefore);
          reservesAppliedToLayout = target;
          ({ columns: finalPageColumns, idsByColumn: finalIdsByColumn } = resolveFootnoteAssignments(layout));
          ({ blocks: finalBlocks, measuresById: finalMeasuresById } = await measureFootnoteBlocks(allFootnoteIds));
          refreshBodyHeights(finalMeasuresById);
          finalPlan = computeFootnoteLayoutPlan(
            layout,
            finalIdsByColumn,
            finalMeasuresById,
            reservesAppliedToLayout,
            finalPageColumns,
          );
        };
        const buildFootnoteLedgers = (plan: FootnoteLayoutPlan, appliedReserves: number[], pageCount: number) => {
          const ledgers: FootnotePageLedger[] = [];
          for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
            const draft = plan.ledgersByPage.get(pageIndex);
            if (!draft) continue;
            const appliedBodyReservePx = Math.max(0, appliedReserves[pageIndex] ?? plan.reserves[pageIndex] ?? 0);
            ledgers.push({
              pageIndex,
              anchorIds: draft.anchorIds,
              mandatorySliceIds: draft.mandatorySliceIds,
              continuationSliceIds: draft.continuationSliceIds,
              extendedSliceIds: draft.extendedSliceIds,
              continuationIn: draft.continuationIn,
              continuationOut: draft.continuationOut,
              mandatoryReservePx: draft.mandatoryReservePx,
              preferredReservePx: draft.preferredReservePx,
              actualBandHeightPx: draft.actualBandHeightPx,
              appliedBodyReservePx,
              deadReservePx: Math.max(0, appliedBodyReservePx - draft.actualBandHeightPx),
              lastAnchorRenderedLines: draft.lastAnchorRenderedLines,
            });
          }
          return ledgers;
        };
        const capReserveForRelayout = (
          requestedReserve: number,
          pageIndex: number,
          referenceLayout: Layout,
          referenceReserves: number[],
        ): number => {
          const requested = Number.isFinite(requestedReserve) ? Math.max(0, requestedReserve) : 0;
          const page = referenceLayout.pages?.[pageIndex];
          if (!page) return requested;

          const pageSize = page.size ?? referenceLayout.pageSize ?? DEFAULT_PAGE_SIZE;
          const topMargin = normalizeMargin(page.margins?.top, DEFAULT_MARGINS.top);
          const bottomWithReserve = normalizeMargin(page.margins?.bottom, DEFAULT_MARGINS.bottom);
          const currentReserve = Number.isFinite(referenceReserves[pageIndex])
            ? Math.max(0, referenceReserves[pageIndex])
            : 0;
          const physicalBottomMargin = Math.max(0, bottomWithReserve - currentReserve);
          const physicalContentHeight = pageSize.h - topMargin - physicalBottomMargin;
          if (!Number.isFinite(physicalContentHeight)) return requested;

          return Math.min(requested, Math.max(0, physicalContentHeight - MIN_FOOTNOTE_BODY_HEIGHT));
        };
        // Grow-only convergence: ensures every page reserves at least as much
        // as its plan demands, so footnotes never render past the page bottom.
        // Monotonic (reserves only increase) and safe under oscillation. Needs
        // several passes for growth on one page to propagate to the pages it
        // spills into. If a target cycles back to one we've tried, we merge
        // element-wise with the last applied target to force progress.
        const growReserves = async (maxPasses: number): Promise<boolean> => {
          const seen: number[][] = [reservesAppliedToLayout.slice()];
          for (let pass = 0; pass < maxPasses; pass += 1) {
            const target = reservesAppliedToLayout.slice();
            const plan = finalPlan.reserves;
            let grew = false;
            for (let i = 0; i < Math.max(target.length, plan.length); i += 1) {
              if ((plan[i] ?? 0) > (target[i] ?? 0)) {
                target[i] = plan[i];
                grew = true;
              }
            }
            if (!grew) return true;
            let next = target;
            if (seen.some((prev) => vectorsEqual(prev, target))) {
              const last = seen[seen.length - 1];
              next = target.map((v, i) => Math.max(v, last[i] ?? 0));
              if (vectorsEqual(next, reservesAppliedToLayout)) return true;
            }
            await applyReserves(next);
            seen.push(next);
          }
          return false;
        };

        const GROW_MAX_PASSES = 10;
        const PREFERRED_RESERVE_MAX_CANDIDATES = 12;
        const PREFERRED_RESERVE_MAX_ACCEPTED_CANDIDATES = PREFERRED_RESERVE_MAX_CANDIDATES;
        const PREFERRED_RESERVE_WINDOW_AHEAD = 3;

        // SD-2656: scored preferred-reserve trials.
        //
        // Ordered-minimum reserve is the correctness floor. Word sometimes
        // spends more space on the last anchor's footnote, but applying that
        // locally in the body slicer caused large downstream drift. This pass
        // tries one candidate at a time after the mandatory layout has already
        // stabilized, then keeps the candidate only if the page-window scorer
        // proves the result is globally safe. The scorer guards both the local
        // page window and the full document, so we can try candidates while
        // still rejecting changes that create late-document slack.
        const runPreferredReserveTrials = async () => {
          let acceptedPreferredTrials = 0;
          let rejectedPreferredTrials = 0;
          const rejectedPreferredPages = new Set<number>();

          for (let candidatePass = 0; candidatePass < PREFERRED_RESERVE_MAX_CANDIDATES; candidatePass += 1) {
            const beforeLayout = layout;
            const beforePlan = finalPlan;
            const beforeReserves = reservesAppliedToLayout.slice();
            const beforeLedgers = buildFootnoteLedgers(beforePlan, beforeReserves, beforeLayout.pages.length);
            const candidate = getPreferredReserveCandidates(beforeLedgers).find(
              (entry) => !rejectedPreferredPages.has(entry.pageIndex),
            );
            if (!candidate) break;

            const targetReserves = getPreferredReserveTrialTargets(candidate, beforeReserves[candidate.pageIndex] ?? 0);
            let acceptedCandidate = false;

            for (const targetReserve of targetReserves) {
              const trialReserves = beforeReserves.slice();
              const cappedPreferredReserve = capReserveForRelayout(
                targetReserve,
                candidate.pageIndex,
                beforeLayout,
                beforeReserves,
              );
              trialReserves[candidate.pageIndex] = Math.max(
                trialReserves[candidate.pageIndex] ?? 0,
                cappedPreferredReserve,
              );

              await applyReserves(trialReserves);
              const trialConverged = await growReserves(GROW_MAX_PASSES);
              const afterLedgers = buildFootnoteLedgers(finalPlan, reservesAppliedToLayout, layout.pages.length);
              const score = scoreFootnoteWindow({
                beforeLayout,
                afterLayout: layout,
                candidatePageIndex: candidate.pageIndex,
                candidateAnchorId: candidate.anchorIds[candidate.anchorIds.length - 1],
                beforeLedger: beforeLedgers,
                afterLedger: afterLedgers,
                windowAhead: PREFERRED_RESERVE_WINDOW_AHEAD,
              });

              if (trialConverged && score.accept) {
                if (layoutDebugEnabled) {
                  console.log('[incrementalLayout] Accepted footnote preferred-reserve trial', {
                    pageIndex: candidate.pageIndex,
                    targetReserve,
                    score,
                  });
                }
                acceptedPreferredTrials += 1;
                acceptedCandidate = true;
                break;
              }

              if (layoutDebugEnabled) {
                console.log('[incrementalLayout] Rejected footnote preferred-reserve trial', {
                  pageIndex: candidate.pageIndex,
                  targetReserve,
                  trialConverged,
                  score,
                });
              }

              await applyReserves(beforeReserves);
            }

            if (acceptedCandidate) {
              if (acceptedPreferredTrials >= PREFERRED_RESERVE_MAX_ACCEPTED_CANDIDATES) break;
              continue;
            }

            rejectedPreferredTrials += 1;
            rejectedPreferredPages.add(candidate.pageIndex);
          }

          if (layoutDebugEnabled && (acceptedPreferredTrials > 0 || rejectedPreferredTrials > 0)) {
            console.log('[incrementalLayout] Footnote preferred-reserve trials', {
              accepted: acceptedPreferredTrials,
              rejected: rejectedPreferredTrials,
            });
          }
        };

        // Fast path for well-converged docs: if every page's current reserve
        // already satisfies the plan and no page is carrying dead reserve,
        // skip both the initial grow and the tighten loop entirely. Avoids
        // up to ~20 unnecessary relayouts on documents without oscillation.
        const TIGHTEN_SLACK_PX = 8;
        const needsWork = (() => {
          const plan = finalPlan.reserves;
          const applied = reservesAppliedToLayout;
          const len = Math.max(plan.length, applied.length);
          for (let i = 0; i < len; i += 1) {
            const a = applied[i] ?? 0;
            const p = plan[i] ?? 0;
            if (p > a) return true; // under-reserved — grow must bump
            if (a >= TIGHTEN_SLACK_PX && p === 0) return true; // dead reserve — tighten can reclaim
            // SD-2656 Phase 4: dead reserve where plan > 0 (e.g. bump-inflated
            // continuation page where final demand is much smaller).
            if (a >= TIGHTEN_SLACK_PX && a - p > TIGHTEN_SLACK_PX) return true;
          }
          return false;
        })();

        if (needsWork) {
          if (!(await growReserves(GROW_MAX_PASSES))) {
            console.warn(
              '[incrementalLayout] Footnote post-reserve loop did not converge; some pages may have footnotes overflowing the reserved band.',
            );
          }

          // SD-2656 Phase 4: opportunistic tighten — pages whose body reserved
          // significantly more than the planner now needs. Two cases:
          //
          //   (a) planned === 0: footnote content shifted off this page in
          //       an earlier pass. The reserve is fully dead — tighten to 0.
          //
          //   (b) planned > 0 but applied >> planned: previous pass's bump
          //       (e.g. for a continuation that was longer then than now)
          //       was preserved by the grow-only loop and never shrank back.
          //       Tighten to planned so body reclaims the dead space; grow
          //       will bump back up if the new bodyMaxY changes plan demand.
          //
          // Revert iff regrow can't stabilize or page count grows (safety net
          // for cluster spills induced by absorbing body content).
          const MAX_TIGHTEN_ITERATIONS = 8;
          for (let iteration = 0; iteration < MAX_TIGHTEN_ITERATIONS; iteration += 1) {
            const pagesToTighten: Array<{ i: number; target: number }> = [];
            for (let i = 0; i < reservesAppliedToLayout.length; i += 1) {
              const applied = reservesAppliedToLayout[i] ?? 0;
              const planned = finalPlan.reserves[i] ?? 0;
              if (applied < TIGHTEN_SLACK_PX) continue;
              if (planned === 0) {
                pagesToTighten.push({ i, target: 0 });
              } else if (applied - planned > TIGHTEN_SLACK_PX) {
                pagesToTighten.push({ i, target: planned });
              }
            }
            if (pagesToTighten.length === 0) break;
            const safeApplied = reservesAppliedToLayout.slice();
            const safePageCount = layout.pages.length;
            const tightened = reservesAppliedToLayout.slice();
            for (const { i, target } of pagesToTighten) tightened[i] = target;
            await applyReserves(tightened);
            if (!(await growReserves(GROW_MAX_PASSES)) || layout.pages.length > safePageCount) {
              await applyReserves(safeApplied);
              break;
            }
          }
        }

        // Absorb one-line footnote widows by bumping their reserve to
        // preferred. The scorer would reject this as a page-count regression;
        // for one-line tails the cost is bounded and Word's pagination always
        // absorbs them.
        const ONE_LINE_TAIL_PX = 24;
        const runWidowOrphanAbsorb = async () => {
          const ledgers = buildFootnoteLedgers(finalPlan, reservesAppliedToLayout, layout.pages.length);
          const target = reservesAppliedToLayout.slice();
          let bumped = 0;
          for (const ledger of ledgers) {
            const tailPx = ledger.continuationOut.reduce((s, e) => s + (e.remainingHeightPx || 0), 0);
            if (tailPx <= 0 || tailPx > ONE_LINE_TAIL_PX) continue;
            const requested = capReserveForRelayout(
              ledger.preferredReservePx,
              ledger.pageIndex,
              layout,
              reservesAppliedToLayout,
            );
            if (requested > (target[ledger.pageIndex] ?? 0)) {
              target[ledger.pageIndex] = requested;
              bumped += 1;
            }
          }
          if (bumped === 0) return;
          const safeApplied = reservesAppliedToLayout.slice();
          await applyReserves(target);
          if (!(await growReserves(GROW_MAX_PASSES))) {
            await applyReserves(safeApplied);
          }
        };
        await runWidowOrphanAbsorb();
        await runPreferredReserveTrials();

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
  const sections = options.sectionMetadata ?? [];
  const numberingCtx = buildNumberingContext(layout, sections, chapterBlockById, chapterContextCache);
  applyNumberingContextToLayout(layout, numberingCtx);

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

    // Create page resolver for section-aware header/footer numbering
    // Only use page resolver if feature flag is enabled
    const pageResolver = FeatureFlags.HEADER_FOOTER_PAGE_TOKENS
      ? (
          pageNumber: number,
        ): {
          displayText: string;
          displayNumber: number;
          totalPages: number;
          sectionPageCount: number;
          pageFormat?: PageNumberFormat;
          chapterNumberText?: string;
          chapterSeparator?: PageNumberChapterSeparator;
        } => {
          const pageIndex = pageNumber - 1;
          const displayInfo = numberingCtx.displayPages[pageIndex];
          return {
            displayText: displayInfo?.displayText ?? String(pageNumber),
            displayNumber: displayInfo?.displayNumber ?? pageNumber,
            totalPages: numberingCtx.totalPages,
            sectionPageCount: displayInfo?.sectionPageCount ?? numberingCtx.totalPages ?? 1,
            pageFormat: displayInfo?.pageFormat,
            chapterNumberText: displayInfo?.chapterNumberText,
            chapterSeparator: displayInfo?.chapterSeparator,
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
        'header',
        fontSignature,
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
        'footer',
        fontSignature,
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
 * Rewrites section break blocks so that `layoutDocument` uses the semantic page
 * dimensions instead of the per-section DOCX page sizes. Without this, each
 * section break carries its original narrow DOCX `pageSize` / `margins` /
 * `columns`, and `layoutDocument` would switch `activePageSize` to those values
 * — defeating the semantic flow's container-width–based layout.
 *
 * Only the block-level layout properties are overridden; everything else
 * (numbering, header/footer refs, vAlign, orientation) is preserved.
 */
function rewriteSectionBreaksForSemanticFlow(blocks: FlowBlock[], options: LayoutOptions): FlowBlock[] {
  const semanticPageSize = options.pageSize;
  const semanticMargins = options.margins;
  if (!semanticPageSize) return blocks;
  if (!blocks.some((b) => b.kind === 'sectionBreak')) return blocks;

  return blocks.map((block) => {
    if (block.kind !== 'sectionBreak') return block;
    const sb = block as SectionBreakBlock;
    return {
      ...sb,
      pageSize: { w: semanticPageSize.w, h: semanticPageSize.h },
      margins: {
        ...sb.margins,
        top: semanticMargins?.top,
        right: semanticMargins?.right,
        bottom: semanticMargins?.bottom,
        left: semanticMargins?.left,
      },
      columns: { count: 1, gap: 0 },
    };
  });
}

/**
 * Computes measurement constraints for each block based on its section's properties.
 *
 * In mixed-orientation documents (e.g., portrait + landscape sections), each section has a
 * different content width. Measuring ALL blocks at the maximum width (the old approach)
 * causes text line breaks to be computed for wider cells than actually rendered, leading to
 * text clipping in table cells with `overflow: hidden` (SD-1962).
 *
 * This function returns a per-block constraint array so each block is measured at its own
 * section's content width. Section breaks act as state transitions: each break defines the
 * constraints for subsequent content blocks until the next break.
 *
 * @param options - Layout options containing default page size, margins, and columns
 * @param blocks - Array of flow blocks (content + section breaks)
 * @returns Array parallel to `blocks` with per-block measurement constraints.
 *   Section break entries have the constraints of the section they introduce.
 */
function computePerSectionConstraints(
  options: LayoutOptions,
  blocks: FlowBlock[],
): Array<{ maxWidth: number; maxHeight: number }> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const defaultMargins = {
    top: normalizeMargin(options.margins?.top, DEFAULT_MARGINS.top),
    right: normalizeMargin(options.margins?.right, DEFAULT_MARGINS.right),
    bottom: normalizeMargin(options.margins?.bottom, DEFAULT_MARGINS.bottom),
    left: normalizeMargin(options.margins?.left, DEFAULT_MARGINS.left),
  };
  const defaultContentWidth = pageSize.w - (defaultMargins.left + defaultMargins.right);
  const defaultContentHeight = pageSize.h - (defaultMargins.top + defaultMargins.bottom);
  const defaultConstraints = {
    maxWidth: resolveMaxColumnWidth(defaultContentWidth, options.columns),
    maxHeight: defaultContentHeight,
  };

  let current = defaultConstraints;
  const result: Array<{ maxWidth: number; maxHeight: number }> = [];

  for (const block of blocks) {
    if (block.kind === 'sectionBreak') {
      const sb = block as SectionBreakBlock;
      const sectionPageSize = sb.pageSize ?? pageSize;
      const sectionMargins = {
        top: normalizeMargin(sb.margins?.top, defaultMargins.top),
        right: normalizeMargin(sb.margins?.right, defaultMargins.right),
        bottom: normalizeMargin(sb.margins?.bottom, defaultMargins.bottom),
        left: normalizeMargin(sb.margins?.left, defaultMargins.left),
      };
      const contentWidth = sectionPageSize.w - (sectionMargins.left + sectionMargins.right);
      const contentHeight = sectionPageSize.h - (sectionMargins.top + sectionMargins.bottom);
      if (contentWidth > 0 && contentHeight > 0) {
        current = {
          maxWidth: resolveMaxColumnWidth(contentWidth, ooXmlSectionColumns(sb.columns)),
          maxHeight: contentHeight,
        };
      }
    }
    result.push(current);
  }

  return result;
}

/**
 * Resolves the maximum measurement constraints (width and height) needed for measuring blocks
 * across all sections in a document.
 *
 * This function scans the entire document (including all section breaks) to determine the
 * widest column configuration and tallest content area that will be encountered during layout.
 * The result is used for cache invalidation and backward-compatible comparison (see
 * `canReusePreviousMeasures`). Actual per-block measurement uses `computePerSectionConstraints`.
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
  if (options.flowMode === 'semantic') {
    const semanticContentWidth = options.semantic?.contentWidth;
    if (typeof semanticContentWidth === 'number' && Number.isFinite(semanticContentWidth) && semanticContentWidth > 0) {
      const semanticTop = normalizeMargin(
        options.semantic?.marginTop,
        normalizeMargin(options.margins?.top, DEFAULT_MARGINS.top),
      );
      const semanticBottom = normalizeMargin(
        options.semantic?.marginBottom,
        normalizeMargin(options.margins?.bottom, DEFAULT_MARGINS.bottom),
      );
      const measurementHeight = Math.max(1, SEMANTIC_PAGE_HEIGHT_PX - (semanticTop + semanticBottom));
      const measurementWidth = Math.max(1, Math.floor(semanticContentWidth));
      return {
        measurementWidth,
        measurementHeight,
      };
    }
  }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const margins = {
    top: normalizeMargin(options.margins?.top, DEFAULT_MARGINS.top),
    right: normalizeMargin(options.margins?.right, DEFAULT_MARGINS.right),
    bottom: normalizeMargin(options.margins?.bottom, DEFAULT_MARGINS.bottom),
    left: normalizeMargin(options.margins?.left, DEFAULT_MARGINS.left),
  };
  const baseContentWidth = pageSize.w - (margins.left + margins.right);
  const baseContentHeight = pageSize.h - (margins.top + margins.bottom);

  let measurementWidth = resolveMaxColumnWidth(baseContentWidth, options.columns);
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
      const columnWidth = resolveMaxColumnWidth(contentWidth, ooXmlSectionColumns(block.columns));
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

type ChapterContextCache = {
  signature?: string;
  context?: Map<number, ChapterPageInfo>;
};

function buildBlockById(blocks: FlowBlock[]): ReadonlyMap<string, FlowBlock> {
  const blockById = new Map<string, FlowBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }
  return blockById;
}

function getFragmentBlockId(fragment: unknown): string {
  if (
    typeof fragment === 'object' &&
    fragment !== null &&
    'blockId' in fragment &&
    typeof (fragment as { blockId?: unknown }).blockId === 'string'
  ) {
    return (fragment as { blockId: string }).blockId;
  }
  return '';
}

function buildChapterContextSignature(layout: Layout): string {
  return layout.pages
    .map((page) => {
      return [
        page.number,
        page.sectionIndex ?? 0,
        page.fragments.length,
        page.fragments.map((fragment) => getFragmentBlockId(fragment)).join(','),
      ].join(':');
    })
    .join('|');
}

function sectionsHaveChapterNumbering(sections: SectionMetadata[]): boolean {
  return sections.some((section) => {
    const chapterStyle = section.numbering?.chapterStyle;
    return typeof chapterStyle === 'number' && Number.isInteger(chapterStyle) && chapterStyle > 0;
  });
}

const PRELAYOUT_CHAPTER_MARKER_SEPARATOR_RE = /[.\-:\u2013\u2014]/;
const PRELAYOUT_MIN_PAGE_COMPONENT = 10;

function getPrelayoutHeadingLevel(block: FlowBlock): number | undefined {
  if (block.kind !== 'paragraph') {
    return undefined;
  }

  const attrs = (block as ParagraphBlock).attrs;
  const headingLevel = attrs?.headingLevel;
  if (typeof headingLevel === 'number' && Number.isInteger(headingLevel) && headingLevel > 0) {
    return headingLevel;
  }

  const styleId = attrs?.styleId;
  if (typeof styleId !== 'string') {
    return undefined;
  }

  const normalizedStyleId = styleId.replace(/[\s_-]+/g, '').toLowerCase();
  const match = /^heading(\d+)$/.exec(normalizedStyleId);
  if (!match) {
    return undefined;
  }

  const level = Number(match[1]);
  return Number.isInteger(level) && level > 0 ? level : undefined;
}

function getPrelayoutChapterMarkerText(block: FlowBlock, chapterStyle: number): string | undefined {
  const headingLevel = getPrelayoutHeadingLevel(block);
  if (!headingLevel || headingLevel > chapterStyle || block.kind !== 'paragraph') {
    return undefined;
  }

  const attrs = (block as ParagraphBlock).attrs;
  const markerText = normalizeChapterMarkerText(attrs?.wordLayout?.marker?.markerText);
  if (!markerText) {
    const listLevelOrdinal = attrs?.listLevelOrdinal;
    return headingLevel === 1 &&
      typeof listLevelOrdinal === 'number' &&
      Number.isInteger(listLevelOrdinal) &&
      listLevelOrdinal > 0
      ? String(listLevelOrdinal)
      : undefined;
  }

  return markerText.split(PRELAYOUT_CHAPTER_MARKER_SEPARATOR_RE).length <= chapterStyle ? markerText : undefined;
}

function buildConservativePrelayoutPageResolver(
  blocks: FlowBlock[],
  sections: SectionMetadata[],
): PageResolver | undefined {
  if (sections.length === 0) {
    return undefined;
  }

  type PrelayoutDisplay = {
    displayText: string;
    displayNumber: number;
    totalPages: number;
    sectionPageCount: number;
    pageFormat: PageNumberFormat;
    chapterNumberText?: string;
    chapterSeparator?: PageNumberChapterSeparator;
  };

  let longestDisplay: PrelayoutDisplay | undefined;
  const considerDisplay = (display: PrelayoutDisplay): void => {
    if (!longestDisplay || display.displayText.length > longestDisplay.displayText.length) {
      longestDisplay = display;
    }
  };

  for (const section of sections) {
    const sectionStart =
      typeof section.numbering?.start === 'number' && Number.isFinite(section.numbering.start)
        ? section.numbering.start
        : 1;
    const displayNumber = Math.max(sectionStart, PRELAYOUT_MIN_PAGE_COMPONENT);
    const pageFormat = section.numbering?.format ?? 'decimal';

    considerDisplay({
      displayText: formatSectionPageNumberText({ displayNumber, pageFormat }),
      displayNumber,
      totalPages: PRELAYOUT_MIN_PAGE_COMPONENT,
      sectionPageCount: PRELAYOUT_MIN_PAGE_COMPONENT,
      pageFormat,
    });

    const chapterStyle = section.numbering?.chapterStyle;
    if (!(typeof chapterStyle === 'number' && Number.isInteger(chapterStyle) && chapterStyle > 0)) {
      continue;
    }

    for (const block of blocks) {
      const chapterNumberText = getPrelayoutChapterMarkerText(block, chapterStyle);
      if (!chapterNumberText) {
        continue;
      }

      const chapterSeparator = section.numbering?.chapterSeparator ?? 'hyphen';
      considerDisplay({
        displayText: formatSectionPageNumberText({
          displayNumber,
          pageFormat,
          chapterNumberText,
          chapterSeparator,
        }),
        displayNumber,
        totalPages: PRELAYOUT_MIN_PAGE_COMPONENT,
        sectionPageCount: PRELAYOUT_MIN_PAGE_COMPONENT,
        pageFormat,
        chapterNumberText,
        chapterSeparator,
      });
    }
  }

  if (!longestDisplay) {
    return undefined;
  }

  const resolvedDisplay = longestDisplay;
  return () => resolvedDisplay;
}

function getChapterContextByPage(
  layout: Layout,
  sections: SectionMetadata[],
  blockById: ReadonlyMap<string, FlowBlock>,
  cache: ChapterContextCache,
): Map<number, ChapterPageInfo> | undefined {
  if (!sectionsHaveChapterNumbering(sections)) {
    return undefined;
  }

  const signature = buildChapterContextSignature(layout);
  if (cache.signature === signature && cache.context) {
    return cache.context;
  }

  const context = buildChapterContextByPage(layout, blockById, sections);
  cache.signature = signature;
  cache.context = context;
  return context;
}

function applyNumberingContextToLayout(layout: Layout, numberingCtx: NumberingContext): void {
  const displayInfoByPage = new Map(numberingCtx.displayPages.map((page) => [page.physicalPage, page]));
  for (const page of layout.pages) {
    const displayInfo = displayInfoByPage.get(page.number);
    if (!displayInfo) {
      continue;
    }
    page.numberText = displayInfo.displayText;
    page.displayNumber = displayInfo.displayNumber;
    page.pageNumberFormat = displayInfo.pageFormat;
    page.pageNumberChapterText = displayInfo.chapterNumberText;
    page.pageNumberChapterSeparator = displayInfo.chapterSeparator;
  }
}

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
function buildNumberingContext(
  layout: Layout,
  sections: SectionMetadata[],
  blockById: ReadonlyMap<string, FlowBlock>,
  chapterContextCache: ChapterContextCache,
): NumberingContext {
  const totalPages = layout.pages.length;
  const chapterInfoByPage = getChapterContextByPage(layout, sections, blockById, chapterContextCache);
  const sectionByIndex = new Map(sections.map((section) => [section.sectionIndex, section]));
  const displayPages = computeDisplayPageNumber(layout.pages, sections, chapterInfoByPage).map((displayPage) => ({
    ...displayPage,
    pageFormat: sectionByIndex.get(displayPage.sectionIndex)?.numbering?.format ?? 'decimal',
  }));

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
 * @param perBlockConstraints - Per-block measurement constraints (parallel to blocks)
 * @param measureBlock - Function to measure a block
 * @returns Updated measures array with re-measured blocks
 */
async function remeasureAffectedBlocks(
  blocks: FlowBlock[],
  measures: Measure[],
  affectedBlockIds: Set<string>,
  perBlockConstraints: Array<{ maxWidth: number; maxHeight: number }>,
  measureBlock: (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => Promise<Measure>,
  fontSignature: string,
  measureCache?: MeasureCache<Measure>,
): Promise<Measure[]> {
  const updatedMeasures: Measure[] = [...measures];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Only re-measure affected blocks
    if (!affectedBlockIds.has(block.id)) {
      continue;
    }

    try {
      // Re-measure the block with its section's constraints
      const newMeasure = await measureBlock(block, perBlockConstraints[i]);

      // Update in the measures array
      updatedMeasures[i] = newMeasure;

      // Cache the new measurement using per-block section constraints. Key it with the document's
      // font signature like every other measure-cache write: a page-token re-measure carries
      // per-document mapped metrics, so writing it under the empty signature would let a default
      // document read it and force this document to recompute every render (signature-keyed miss).
      const blockConstraints = perBlockConstraints[i];
      measureCache?.set(block, blockConstraints.maxWidth, blockConstraints.maxHeight, newMeasure, fontSignature);
    } catch (error) {
      // Error handling per plan: log warning, keep prior layout for block
      console.warn(`[incrementalLayout] Failed to re-measure block ${block.id} after token resolution:`, error);
      // Keep the old measure - don't update updatedMeasures[i]
    }
  }

  return updatedMeasures;
}
