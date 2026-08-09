import {
  areValidPageCheckpointDependencyClasses,
  cloneColumnLayout,
  collectSectionBoundaryFillerBlockIds,
  doesFlowBlockProduceLayoutFragment,
  formatSectionPageNumberText,
  getColumnGeometry,
  getColumnX,
  isPageRelativeAnchor,
  normalizeColumnLayout,
  rescaleColumnWidths,
} from '@superdoc/contracts';
import type {
  NonFlowingPageRelativeAnchorDependencyProof,
  PageCheckpointDependencyClass,
  FlowBlock,
  FootnotePageLedger,
  Fragment,
  Layout,
  LayoutBlockResumeCheckpoint,
  Measure,
  Page,
  HeaderFooterLayout,
  SectionMetadata,
  ParagraphBlock,
  ParagraphMeasure,
  TableMeasure,
  ColumnLayout,
  SectionBreakBlock,
  NormalizedColumnLayout,
  PageNumberChapterSeparator,
  PageNumberFormat,
  ParagraphLineRegion,
} from '@superdoc/contracts';
import type { FontMeasureContext } from '@superdoc/font-system';
import {
  layoutDocument,
  layoutDocumentCooperatively,
  type LayoutOptions,
  type HeaderFooterConstraints,
  computeDisplayPageNumber,
  resolvePageNumberTokens,
  resolvePageNumberTokensCooperatively,
  checkpointLayoutExecution,
  throwIfLayoutExecutionAborted,
  type LayoutExecutionCheckpoint,
  type LayoutExecutionControl,
  type NumberingContext,
  buildChapterContextByPage,
  buildChapterContextByPageCooperatively,
  type ChapterPageInfo,
  computeDisplayPageNumberCooperatively,
  normalizeChapterMarkerText,
  SEMANTIC_PAGE_HEIGHT_PX,
  SINGLE_COLUMN_DEFAULT,
  resolveTableFrame,
} from '@superdoc/layout-engine';
import { clearRemeasureTextCaches, remeasureParagraph } from './remeasure';
import { computeDirtyRegions } from './diff';
import { MeasureCache, hashMeasureContent } from './cache';
import {
  layoutHeaderFooterWithCache,
  HeaderFooterLayoutCache,
  type HeaderFooterBatch,
  type HeaderFooterLayoutExecution,
  type PageResolver,
} from './layoutHeaderFooter';
import type { ResolveHeaderFooterTokensOptions } from './resolveHeaderFooterTokens';
import {
  buildSectionAwareHeaderFooterLayoutKey,
  buildSectionAwareHeaderFooterMeasurementGroups,
} from './sectionAwareHeaderFooter';
import { FeatureFlags } from './featureFlags';
import { PageTokenLogger, HeaderFooterCacheLogger, globalMetrics } from './instrumentation';
import { HeaderFooterCacheState, invalidateHeaderFooterCache } from './cacheInvalidation';
import { hydrateTableTextboxMeasures } from './hydrateTableTextboxMeasures';
import {
  getPreferredReserveCandidates,
  getPreferredReserveTrialTargets,
  scoreFootnoteWindow,
  shouldAbsorbOneLineFootnoteWidow,
} from './footnote-scorer';

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

/**
 * SD-3432: the footnote reserve fixed point of a completed layout run, used to
 * warm-start the next run's convergence loop. The seed is ONLY a starting
 * vector — every run re-validates it through the full convergence machinery
 * (pass-1 relayout + plan stability + grow/tighten + widow + trials), so a
 * stale or wrong seed costs extra passes, never correctness. Captured only
 * when the run ended on an EXACT fixed point (plan === applied reserves), so
 * an unchanged document warm-validates in a single relayout.
 *
 * Guards carried with the vector (fontSignature / measurement constraints)
 * exist purely to discard pathological starting vectors after zoom or font
 * changes; they carry no document identity (no footnote ids, no content
 * hashes — see the SD-3418 post-mortem for why identity keys are forbidden).
 */
export type FootnoteReserveSeed = {
  reserves: number[];
  /** Sparse page indexes that held a reserve, ledger, or injected note slice. */
  notePageIndexes?: number[];
  separatorSpacingBefore: number | undefined;
  fontSignature: string;
  measurementWidth: number;
  measurementHeight: number;
  /** Exact note measurement width retained with unchanged section geometry. */
  footnoteMeasurementWidth?: number;
  /** Section-column inputs used to derive the retained note measurement width. */
  sectionColumnsByIndex?: Map<number, ColumnLayout>;
  /** Exact note block objects retained by the host's authoritative note-bundle proof. */
  noteBlocksByBlockId?: Map<string, FlowBlock>;
  /** Measures paired with `noteBlocksByBlockId`; object identity is revalidated before reuse. */
  noteMeasuresByBlockId?: Map<string, Measure>;
  noteBodyHeightById?: Map<string, number>;
  noteFirstLineHeightById?: Map<string, number>;
};

export type IncrementalLayoutResult = {
  layout: Layout;
  /** Pass-owned block plane after derived layout annotations are attached. */
  blocks: FlowBlock[];
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
  /**
   * SD-3432: next-run warm-start seed for the footnote convergence loop.
   * Null when this run did not end on an exact footnote fixed point (or laid
   * out no footnotes) — the next run then starts cold.
   */
  footnoteReserveSeed?: FootnoteReserveSeed | null;
  /** Canonical pre-layout furniture heights that can affect body margins. */
  headerFooterGeometryFingerprint: string;
  layoutReuse?: IncrementalLayoutReuseSummary;
  measureReuse?: {
    mode: 'full-scan' | 'proved-dirty-only' | 'body-stable';
    blocksMeasured: number;
    measuresAdopted: number;
    reason: string;
  };
  /**
   * Per-call bridge-owned timing. This is returned with the canonical layout
   * result so callers do not need to read the process-global metrics collector.
   * Substage fields are non-overlapping for the top-level reconciliation:
   * `measureTotalMs` includes cache lookup and actual measurement details,
   * and `pageTokenTotalMs` includes token remeasure/relayout details.
   */
  bridgeTiming: IncrementalLayoutBridgeTiming;
};

export type IncrementalLayoutBridgeTiming = {
  totalMs: number;
  inputPreparationMs: number;
  measureTotalMs: number;
  /** Union wall time spent inside caller-owned measure callbacks across body and furniture. */
  measureCallbackWallMs: number;
  measureCacheLookupMs: number;
  measureActualMs: number;
  headerFooterPreLayoutMs: number;
  headerPreLayoutMs: number;
  footerPreLayoutMs: number;
  warmStartPreparationMs: number;
  /** Wall time inside the initial body `layoutDocument` invocation only. */
  layoutDocumentMs: number;
  /** Initial body-layout wrapper work outside `layoutDocument` (proof, slice, convergence, splice). */
  layoutReuseOrchestrationMs: number;
  paginationMs: number;
  pageTokenSetupMs: number;
  pageTokenTotalMs: number;
  pageTokenRemeasureMs: number;
  pageTokenRelayoutMs: number;
  footnoteMs: number;
  numberingMs: number;
  finalHeaderFooterMs: number;
  layoutExposureMs: number;
  unattributedMs: number;
  counters: {
    blocksRead: number;
    cacheHits: number;
    cacheMisses: number;
    measuresAdopted: number;
    pagesPaginated: number | null;
    pagesSplicedByReuse: number;
    paginationPasses: number;
    pageTokenRelayouts: number;
    footnoteRelayouts: number;
    footnoteReserveRelayouts: number;
    footnoteGrowRelayouts: number;
    footnoteTightenRelayouts: number;
    footnotePreferredRelayouts: number;
    footnoteWidowRelayouts: number;
    footnoteRevertRelayouts: number;
    footnoteOtherRelayouts: number;
  };
};

/**
 * Structural discriminator for what happened to the document tail (SD-3772
 * D5). Consumers branch on THIS, never on the diagnostic `reason` string:
 * - `none`: no retained tail exists (full recompute).
 * - `adopted-source-tail`: a convergence page was proved and the source tail
 *   was adopted; `tailAdoption` is non-null and range-valid.
 * - `relaid-to-document-end`: the bounded slice reached the exact end of the
 *   document and every terminal page was freshly paginated; `tailAdoption`
 *   is null. Every other combination fails closed before publication.
 */
export type IncrementalLayoutTailDisposition = 'none' | 'adopted-source-tail' | 'relaid-to-document-end';

export type IncrementalLayoutReuseSummary = {
  mode: 'full' | 'prefix-resume' | 'tail-splice';
  /** Diagnostic label only; never drives product behavior (SD-3772 D5). */
  reason: string;
  tailDisposition: IncrementalLayoutTailDisposition;
  checkpointPageIndex: number | null;
  /** Last prior page that can be affected by the dirty content/dependencies. */
  affectedFrontierPageIndex: number | null;
  /** Last source-generation page covered by the dirty content. */
  sourceAffectedFrontierPageIndex: number | null;
  convergencePageIndex: number | null;
  /** Source-generation page adopted at convergence (may differ after page-count shifts). */
  sourceConvergencePageIndex: number | null;
  pagesPaginated: number | null;
  pagesSplicedByReuse: number;
  /**
   * Proof for a retained tail. Pages in this interval remain byte-for-byte
   * retained; consumers apply the position transforms only when a page enters
   * the active paint window.
   */
  tailAdoption: IncrementalLayoutTailAdoption | null;
};

/**
 * Exact dirty-measure proof that is useful even when pagination reuse is
 * independently vetoed. Keeping it separate prevents a global layout
 * dependency from forcing an O(document) measurement-preparation scan.
 */
export type IncrementalMeasureReuseProof = Pick<
  IncrementalLayoutReuseOptions,
  | 'provedDirtyRegion'
  | 'dependencyProof'
  | 'previousBlockIndexById'
  | 'currentBlockIndexById'
  | 'provedDirtyMeasureConstraints'
>;

export type LayoutPositionTransform = {
  atChar: number;
  delta: number;
};

export type IncrementalSectionPageNumberTransform = {
  /** Section whose retained pages need rebasing before its next boundary. */
  sectionIndex: number;
  /** Difference between target and source section-relative page positions. */
  delta: number;
};

export type IncrementalDisplayPageNumberTransform = {
  /** First section whose retained display-page values inherit the local page delta. */
  startSectionIndex: number;
  /** First later section with an explicit numbering restart. */
  endSectionIndexExclusive: number;
  delta: number;
};

export type IncrementalLayoutTailAdoption = {
  startPageIndex: number;
  endPageIndexExclusive: number;
  sourcePageStartIndex: number;
  sourcePageEndIndexExclusive: number;
  pageIndexDelta: number;
  sectionPageNumberTransform: IncrementalSectionPageNumberTransform | null;
  displayPageNumberTransform?: IncrementalDisplayPageNumberTransform | null;
  /** Exact proof that PAGEREF page/numbering locations are unchanged in the adopted tail. */
  pageReferenceLocationsStable: boolean;
  sourceLayoutEpoch: number | null;
  positionTransforms: readonly LayoutPositionTransform[];
  /** Lazy old->current block-id rekeys for an ordinal-changing structural splice. */
  blockIdRewrites?: ReadonlyMap<string, string> | null;
};

function roundTimingMs(value: number): number {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

function buildHeaderFooterGeometryFingerprint(input: {
  headerContentHeights?: Partial<Record<'default' | 'first' | 'even' | 'odd', number>>;
  footerContentHeights?: Partial<Record<'default' | 'first' | 'even' | 'odd', number>>;
  headerContentHeightsByRId?: ReadonlyMap<string, number>;
  headerContentHeightsBySectionRef?: ReadonlyMap<string, number>;
  footerContentHeightsByRId?: ReadonlyMap<string, number>;
  footerContentHeightsBySectionRef?: ReadonlyMap<string, number>;
}): string {
  const variants = (values: Partial<Record<'default' | 'first' | 'even' | 'odd', number>> | undefined) =>
    (['default', 'first', 'even', 'odd'] as const).map((key) => [key, values?.[key] ?? null]);
  const entries = (values: ReadonlyMap<string, number> | undefined) =>
    values ? [...values].sort(([left], [right]) => left.localeCompare(right)) : null;
  return JSON.stringify({
    headers: variants(input.headerContentHeights),
    footers: variants(input.footerContentHeights),
    headersByRId: entries(input.headerContentHeightsByRId),
    headersBySectionRef: entries(input.headerContentHeightsBySectionRef),
    footersByRId: entries(input.footerContentHeightsByRId),
    footersBySectionRef: entries(input.footerContentHeightsBySectionRef),
  });
}

function computeTimingUnionMs(intervals: readonly { start: number; end: number }[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((left, right) => left.start - right.start || left.end - right.end);
  let start = sorted[0]!.start;
  let end = sorted[0]!.end;
  let total = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const interval = sorted[index]!;
    if (interval.start <= end) {
      end = Math.max(end, interval.end);
      continue;
    }
    total += Math.max(0, end - start);
    start = interval.start;
    end = interval.end;
  }
  return total + Math.max(0, end - start);
}

type IncrementalPaginationProofBase = {
  blockIdsUnchanged: true;
  blockIdsUnique: true;
  renderInputsUnchanged: true;
  /** The retained dependency scan proved that no body or furniture PAGE_REF token exists. */
  pageReferencesAbsent: boolean;
  pageReferenceDependencyClosure?: {
    referenceBlockIds: readonly string[];
    targetBookmarkIds: readonly string[];
  };
};

export type IncrementalPaginationProof = IncrementalPaginationProofBase &
  (
    | {
        profile: 'single-section-local-text';
        globalDependenciesAbsent: true;
        globalDependenciesFencedByDocumentStart?: never;
      }
    | {
        /** Stable dependency-rich documents must replay from a page-zero checkpoint. */
        profile: 'document-start-local-text';
        globalDependenciesAbsent: false;
        globalDependenciesFencedByDocumentStart: true;
        multiColumnSectionsProvedNonBalanceable: true;
      }
    | {
        /** Stable dependency-rich documents may replay from an engine-seeded page checkpoint. */
        profile: 'page-checkpoint-local-text';
        globalDependenciesAbsent: false;
        globalDependenciesFencedByPageCheckpoint: true;
        admittedDependencyClasses: readonly PageCheckpointDependencyClass[];
        nonFlowingPageRelativeAnchorDependency?: NonFlowingPageRelativeAnchorDependencyProof;
        localKeepDependencyClosure?: {
          checkpointPageIndex: number;
          checkpointBlockId: string | null;
          predecessorBlockId: string | null;
        };
        /**
         * SD-3772 D1: the host proved (via the shared
         * `hasGenuinelyUnequalExplicitColumnWidths` predicate) that no
         * potentially balanceable multi-column section exists anywhere in the
         * retained document. Balancing is a post-pagination finalizer that a
         * mid-section checkpoint cannot seed; a packet without this proof
         * fails validation and takes the canonical full layout.
         */
        multiColumnSectionsProvedNonBalanceable: true;
      }
  );

export type IncrementalLayoutReuseOptions = {
  previousLayout: Layout | null;
  /** Epoch that produced every retained page/index/key in this reuse packet. */
  retainedMetadataSourceLayoutEpoch?: number | null;
  previousPageStartKeys: readonly string[] | null;
  previousBlockPageIndex: Map<string, { firstPage: number; lastPage: number }> | null;
  maxRelaidPages?: number;
  requireDocumentStartCheckpoint?: boolean;
  allowBlockIdChurn?: boolean;
  pmShift?: LayoutPositionTransform | null;
  /** Exact dirty identities from the commit envelope when already available. */
  dirtyBlockIds?: readonly string[];
  /** Exact retained block index, required to align a structural ±1 measure plane. */
  previousBlockIndexById?: ReadonlyMap<string, number> | null;
  /** Optional retained ordinal index, avoiding a whole-array checkpoint lookup. */
  currentBlockIndexById?: ReadonlyMap<string, number> | null;
  /** Inverse identity proof for ordinal-scoped ids shifted by a structural edit. */
  blockIdRewrites?: {
    previousToCurrent: ReadonlyMap<string, string>;
    currentToPrevious: ReadonlyMap<string, string>;
  } | null;
  /** Retained dependency proof; avoids rescanning every block on a warm edit. */
  dependencyProof?: IncrementalPaginationProof | null;
  /** Exact retained dirty analysis; bypasses computeDirtyRegions on a proved warm edit. */
  provedDirtyRegion?: ReturnType<typeof computeDirtyRegions> | null;
  /** Cold-observed exact section constraints for each dirty block. */
  provedDirtyMeasureConstraints?: ReadonlyMap<string, { maxWidth: number; maxHeight: number }> | null;
  /** Retained key index used for O(1) convergence candidate lookup. */
  previousPageStartKeyIndex?: ReadonlyMap<string, readonly number[]> | null;
  /**
   * Host-proved note-only refresh. Body ids are unchanged reference anchors;
   * only the named note projections may differ from the retained note plane.
   */
  provedNoteOnlyRefresh?: {
    noteIds: readonly string[];
    bodyReferenceBlockIds: readonly string[];
  };
  /**
   * Host-proved header/footer-only refresh. The bridge still compares the
   * current pre-layout height fingerprint before retaining body pagination.
   */
  provedHeaderFooterOnlyRefresh?: {
    bodyProjectionRetainedExact: true;
    bodyLayoutInputsUnchanged: true;
    previousGeometryFingerprint: string;
  };
};

export const measureCache = new MeasureCache<Measure>();
const headerMeasureCache = new HeaderFooterLayoutCache();
const headerFooterCacheState = new HeaderFooterCacheState();

/**
 * Reset every module-global cache this bridge holds (measure cache,
 * header/footer measure cache, header/footer invalidation state). A clean
 * cold-recompute oracle must start from exactly the state a fresh worker
 * would have; clearing only the measure cache leaves warm header/footer
 * state that can legally shift page geometry.
 */
export function clearIncrementalModuleState(): void {
  measureCache.clear();
  headerMeasureCache.clear();
  headerFooterCacheState.reset();
}

const layoutDebugEnabled =
  typeof process !== 'undefined' && typeof process.env !== 'undefined' && Boolean(process.env.SD_DEBUG_LAYOUT);

const perfLog = (...args: unknown[]): void => {
  if (!layoutDebugEnabled) return;

  console.log(...args);
};

type FootnoteReference = {
  id: string;
  /**
   * Legacy v1 PM-position anchor. Resolved via fragment `pmStart` / `pmEnd`
   * range matching. Required for v1 producers; v2 producers may set this
   * to a synthetic value (e.g. block ordinal) and supply a `blockId`
   * anchor for resolution.
   */
  pos: number;
  /**
   * v2 source anchor identifying the rendered body
   * reference marker. When set, `assignFootnotesToColumns` resolves
   * the reference's page/column by matching against
   * `layout.pages[].fragments[].blockId` instead of falling back to
   * positional fragment lookup. Editor-neutral by design.
   */
  blockId?: string;
  /**
   * Optional paragraph-run anchor used by v2 refs.
   *
   * A long paragraph can span multiple page fragments. When `blockId` alone
   * is used, the bridge can only resolve the FIRST fragment carrying that
   * block, which places later-line footnotes too early and cascades reserve
   * drift across the document. When `runOrdinal` is present and a paragraph
   * measure is available, the bridge resolves the fragment whose line range
   * actually contains the referenced run.
   */
  runOrdinal?: number | null;
};
type FootnotesLayoutInput = {
  refs: FootnoteReference[];
  blocksById: Map<string, FlowBlock[]>;
  gap?: number;
  topPadding?: number;
  dividerHeight?: number;
  separatorSpacingBefore?: number;
};

type ProvedNoteOnlyLayoutFinalization = {
  extraBlocks: FlowBlock[];
  extraMeasures: Measure[];
  footnoteReserveSeed: FootnoteReserveSeed;
};

type PreparedNoteOnlyLayoutReuse = {
  previousBlocks: readonly FlowBlock[];
  footnotes: FootnotesLayoutInput;
  currentNoteMeasures: ReadonlyMap<string, Measure>;
  warmSeed: FootnoteReserveSeed;
};

type PreparedHeaderFooterOnlyLayoutReuse = {
  currentGeometryFingerprint: string;
  bodyMeasuresRetainedExact: true;
  footnotes: FootnotesLayoutInput | null;
  warmSeed: FootnoteReserveSeed | null;
  noteMeasurePlaneRetainedExact: boolean;
  retainedFootnoteExtras: { blocks: FlowBlock[]; measures: Measure[] } | null;
};

const isFootnotesLayoutInput = (value: unknown): value is FootnotesLayoutInput => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.refs)) return false;
  if (!(v.blocksById instanceof Map)) return false;
  return true;
};

const findPageIndexForBlockId = (layout: Layout, blockId: string): number | null => {
  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    const page = layout.pages[pageIndex];
    if (!page) continue;
    for (const fragment of page.fragments) {
      const fragmentBlockId = (fragment as { blockId?: string }).blockId;
      if (fragmentBlockId === blockId) return pageIndex;
    }
  }
  return null;
};

const findFragmentForBlockId = (
  page: Layout['pages'][number],
  blockId: string,
): Layout['pages'][number]['fragments'][number] | null => {
  for (const fragment of page.fragments) {
    const fragmentBlockId = (fragment as { blockId?: string }).blockId;
    if (fragmentBlockId === blockId) return fragment;
  }
  return null;
};

const findLineIndexForRunOrdinal = (measure: ParagraphMeasure | undefined, runOrdinal: number): number | null => {
  if (!measure || !Array.isArray(measure.lines)) return null;
  for (let lineIndex = 0; lineIndex < measure.lines.length; lineIndex += 1) {
    const line = measure.lines[lineIndex];
    if (runOrdinal >= line.fromRun && runOrdinal <= line.toRun) return lineIndex;
  }
  return null;
};

const findFragmentForBlockRunOrdinal = (
  page: Layout['pages'][number],
  blockId: string,
  lineIndex: number,
): Layout['pages'][number]['fragments'][number] | null => {
  for (const fragment of page.fragments) {
    if (fragment.kind !== 'para' && fragment.kind !== 'list-item') continue;
    if (fragment.blockId !== blockId) continue;
    if (lineIndex >= fragment.fromLine && lineIndex < fragment.toLine) return fragment;
  }
  return null;
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

const resolvePageColumns = (
  layout: Layout,
  options: LayoutOptions,
  blocks?: FlowBlock[],
  retainedSectionColumns?: ReadonlyMap<number, ColumnLayout>,
): Map<number, PageColumns> => {
  const sectionColumns = retainedSectionColumns ?? resolveSectionColumnsByIndex(options, blocks);
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
  paragraphMeasuresByBlockId: Map<string, ParagraphMeasure>,
): Map<number, Map<number, string[]>> => {
  const result = new Map<number, Map<number, string[]>>();
  const seenByColumn = new Map<string, Set<string>>();

  for (const ref of refs) {
    let pageIndex: number | null = null;
    let fragment: Layout['pages'][number]['fragments'][number] | null = null;
    // Prefer blockId-anchored resolution when v2 supplied it;
    // fall back to legacy pos-based resolution for v1 producers.
    if (ref.blockId) {
      if (typeof ref.runOrdinal === 'number' && Number.isFinite(ref.runOrdinal) && ref.runOrdinal >= 0) {
        const paragraphMeasure = paragraphMeasuresByBlockId.get(ref.blockId);
        const lineIndex = findLineIndexForRunOrdinal(paragraphMeasure, ref.runOrdinal);
        if (lineIndex != null) {
          for (let candidatePageIndex = 0; candidatePageIndex < layout.pages.length; candidatePageIndex += 1) {
            const candidatePage = layout.pages[candidatePageIndex];
            const candidateFragment = findFragmentForBlockRunOrdinal(candidatePage, ref.blockId, lineIndex);
            if (!candidateFragment) continue;
            pageIndex = candidatePageIndex;
            fragment = candidateFragment;
            break;
          }
        }
      }
      if (pageIndex == null) {
        pageIndex = findPageIndexForBlockId(layout, ref.blockId);
        if (pageIndex != null) {
          fragment = findFragmentForBlockId(layout.pages[pageIndex], ref.blockId);
        }
      }
    }
    if (pageIndex == null) {
      pageIndex = findPageIndexForPos(layout, ref.pos);
      if (pageIndex != null) {
        fragment = findFragmentForPos(layout.pages[pageIndex], ref.pos);
      }
    }
    if (pageIndex == null) continue;
    const columns = pageColumns.get(pageIndex);
    const page = layout.pages[pageIndex];
    let columnIndex = 0;

    if (columns && columns.count > 1 && page) {
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
/**
 * SD-3432: measure every block of the given note ids at the footnote
 * constraints, through the shared measure cache. Pure helper shared by the
 * footnote pipeline and the seeded initial pagination.
 */
async function measureNoteBlocks(
  ids: Set<string>,
  blocksById: Map<string, FlowBlock[]>,
  constraints: { maxWidth: number; maxHeight: number },
  measureBlock: (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => Promise<Measure>,
  fontSignature: string,
): Promise<{ blocks: FlowBlock[]; measuresById: Map<string, Measure> }> {
  const needed = new Map<string, FlowBlock>();
  ids.forEach((id) => {
    const blocks = blocksById.get(id) ?? [];
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
      const cached = measureCache.get(block, constraints.maxWidth, constraints.maxHeight, fontSignature);
      if (cached) {
        hydrateTabRunWidthsFromMeasure(block, cached);
        measuresById.set(block.id, cached);
        return;
      }
      const measurement = await measureBlock(block, constraints);
      measureCache.set(block, constraints.maxWidth, constraints.maxHeight, measurement, fontSignature);
      measuresById.set(block.id, measurement);
    }),
  );
  return { blocks, measuresById };
}

function validateRetainedNoteMeasurePlane(
  blocksByNoteId: ReadonlyMap<string, readonly FlowBlock[]>,
  seed: FootnoteReserveSeed | null,
): Map<string, Measure> | null {
  const retainedBlocks = seed?.noteBlocksByBlockId;
  const retainedMeasures = seed?.noteMeasuresByBlockId;
  if (!retainedBlocks || !retainedMeasures || retainedBlocks.size !== retainedMeasures.size) return null;
  let observed = 0;
  for (const blocks of blocksByNoteId.values()) {
    for (const block of blocks) {
      if (
        !block?.id ||
        !retainedBlocks.has(block.id) ||
        retainedBlocks.get(block.id) !== block ||
        !retainedMeasures.has(block.id)
      )
        return null;
      observed += 1;
    }
  }
  return observed === retainedBlocks.size ? retainedMeasures : null;
}

/**
 * Re-stamp tab-run widths onto a block's runs from the measure's per-line
 * `tabWidths` records. The measurer stamps `run.width` as a side effect of
 * measuring, so a cache-hit or previous-measure reuse over freshly projected
 * run objects would otherwise leave the widths absent — making resolved
 * output (and every `run.width` reader) depend on which pass last measured
 * those exact objects instead of on content. Measures are content-addressed,
 * so this hydration is deterministic and idempotent.
 *
 * Tables recurse: cell paragraphs are measured nested (`TableCellMeasure.
 * blocks`/`paragraph`), and their tab runs carry the same stamps — a warm
 * cache hit on the TABLE otherwise leaves every nested tab width unstamped,
 * which is exactly the freddie browser determinism divergence (painter plan
 * debt 1, 2026-07-05: pass 1 measured/stamped, pass 2 cache-hit/unstamped).
 */
function hydrateTabRunWidthsFromMeasure(block: FlowBlock, measure: Measure): void {
  if (!measure || !block) return;
  if (block.kind === 'paragraph' && measure.kind === 'paragraph') {
    hydrateParagraphTabRunWidths(block as ParagraphBlock, measure as ParagraphMeasure);
    return;
  }
  if (block.kind === 'table' && measure.kind === 'table') {
    const blockRows = (block as { rows?: unknown[] }).rows;
    const measureRows = (measure as TableMeasure).rows;
    if (!Array.isArray(blockRows) || !Array.isArray(measureRows)) return;
    for (let rowIndex = 0; rowIndex < blockRows.length; rowIndex += 1) {
      const blockCells = (blockRows[rowIndex] as { cells?: unknown[] } | undefined)?.cells;
      const measureCells = measureRows[rowIndex]?.cells;
      if (!Array.isArray(blockCells) || !Array.isArray(measureCells)) continue;
      for (let cellIndex = 0; cellIndex < blockCells.length; cellIndex += 1) {
        const blockCell = blockCells[cellIndex] as { blocks?: FlowBlock[]; paragraph?: FlowBlock } | undefined;
        const measureCell = measureCells[cellIndex];
        if (!blockCell || !measureCell) continue;
        if (Array.isArray(blockCell.blocks) && Array.isArray(measureCell.blocks)) {
          for (let blockIndex = 0; blockIndex < blockCell.blocks.length; blockIndex += 1) {
            const nestedMeasure = measureCell.blocks[blockIndex];
            if (nestedMeasure) hydrateTabRunWidthsFromMeasure(blockCell.blocks[blockIndex]!, nestedMeasure);
          }
        }
        if (blockCell.paragraph && measureCell.paragraph) {
          hydrateTabRunWidthsFromMeasure(blockCell.paragraph, measureCell.paragraph);
        }
      }
    }
  }
}

function hydrateParagraphTabRunWidths(block: ParagraphBlock, measure: ParagraphMeasure): void {
  const runs = block.runs;
  if (!Array.isArray(runs)) return;
  const lines = measure.lines;
  if (!Array.isArray(lines)) return;
  for (const line of lines) {
    const tabWidths = (line as { tabWidths?: Record<number, number> }).tabWidths;
    if (!tabWidths) continue;
    for (const key of Object.keys(tabWidths)) {
      const run = runs[Number(key)];
      if (run && run.kind === 'tab') {
        (run as { width?: number }).width = tabWidths[Number(key)]!;
      }
    }
  }
}

/**
 * SD-3049/SD-2656: per-footnote total body height and first-line height;
 * accounting mirrors `computeFootnoteLayoutPlan`. Pure helper shared by the
 * footnote pipeline and the seeded initial pagination (SD-3432).
 */
function computeNoteBodyHeights(
  footnotesInput: FootnotesLayoutInput,
  measures: Map<string, Measure>,
): { totalMap: Map<string, number>; firstLineMap: Map<string, number> } {
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
        const spacing = (block as { attrs?: { spacing?: { after?: number; lineSpaceAfter?: number } } }).attrs?.spacing;
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
  return { totalMap, firstLineMap };
}

export interface IncrementalLayoutExecutionControl {
  signal?: AbortSignal;
  /** Budget-aware host-task yield; may resolve immediately. */
  yieldToHost?: (checkpoint?: LayoutExecutionCheckpoint) => Promise<void>;
  /** Measurement checkpoints default to 32 blocks; nested layout checkpoints default to 16. */
  yieldEveryBlocks?: number;
  /** Time-aware mounted probe. Null is the allocation-free under-budget path. */
  checkpointIfDue?: (checkpoint?: LayoutExecutionCheckpoint) => Promise<void> | null;
}

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
    /**
     * When `false`, header/footer NUMPAGES/SECTIONPAGES fields keep their
     * source-cached DOCX text (em dash when absent) instead of resolving to
     * the current — possibly partial — page total. Defaults to exact.
     */
    pageCountFieldsExact?: boolean;
    /**
     * @deprecated Compatibility-only. Measurement identity is derived from
     * content, constraints, font signature, and page-count field mode; render
     * generation must not invalidate unchanged header/footer measurements.
     */
    cacheGeneration?: number;
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
  // SD-3432: warm-start context (deliberately NOT on LayoutOptions, mirroring
  // fontRuntime): the previous run's footnote reserve fixed point, if any.
  warmStart?: {
    footnoteReserveSeed?: FootnoteReserveSeed | null;
    /** Host proved the authoritative note projection bundle was retained exactly. */
    noteMeasurePlaneRetainedExact?: true;
    /** Extra note/decorative planes paired with the retained note bundle. */
    retainedFootnoteExtras?: { blocks: FlowBlock[]; measures: Measure[] };
  },
  layoutReuse?: IncrementalLayoutReuseOptions,
  measureReuseProof?: IncrementalMeasureReuseProof,
  execution?: IncrementalLayoutExecutionControl,
): Promise<IncrementalLayoutResult> {
  const bridgeStartedAt = performance.now();
  // The mounted time-budget probe is deliberately allocation-free while the
  // current task remains under budget. Keep that fast path for callers that
  // only opt into time-aware cooperative measurement checkpoints. A scheduler
  // signal (or the legacy untimed yield hook) additionally opts the nested
  // layout engine into its resumable iterator so incompatible work can abort
  // between bounded layout units.
  const useCooperativeLayout = Boolean(execution?.signal || (execution?.yieldToHost && !execution.checkpointIfDue));
  const layoutExecution: LayoutExecutionControl | undefined =
    useCooperativeLayout && execution
      ? {
          ...(execution.signal ? { signal: execution.signal } : {}),
          ...(execution.checkpointIfDue
            ? {
                yieldToHost: async (checkpoint: LayoutExecutionCheckpoint) => {
                  const pending = execution.checkpointIfDue?.(checkpoint);
                  if (pending) await pending;
                },
              }
            : execution.yieldToHost
              ? { yieldToHost: (checkpoint: LayoutExecutionCheckpoint) => execution.yieldToHost!(checkpoint) }
              : {}),
          checkpointEveryBlocks: Math.max(1, Math.floor(execution.yieldEveryBlocks ?? 16)),
        }
      : undefined;
  const headerFooterExecution: HeaderFooterLayoutExecution | undefined = execution
    ? {
        ...(layoutExecution ?? {}),
        ...(execution.checkpointIfDue ? { checkpointIfDue: execution.checkpointIfDue } : {}),
      }
    : undefined;
  if (layoutExecution) {
    await checkpointLayoutExecution(layoutExecution, { phase: 'measure:block', index: 0, total: nextBlocks.length });
  }
  // Internal same-call observer used by the canonical pipeline to retain the
  // exact constraints that produced cached/adopted measures. It is carried
  // on the existing callback object, adds no package export or public option,
  // and never performs measurement itself.
  const observeMeasureConstraints = (
    measureBlock as typeof measureBlock & {
      observeConstraints?: (block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }) => void;
    }
  ).observeConstraints;
  const measureCallbackIntervals: Array<{ start: number; end: number }> = [];
  const timeMeasureCallback =
    (callback: HeaderFooterMeasureFn): HeaderFooterMeasureFn =>
    async (block, constraints) => {
      const start = performance.now();
      try {
        return await callback(block, constraints);
      } finally {
        measureCallbackIntervals.push({ start, end: performance.now() });
      }
    };
  measureBlock = timeMeasureCallback(measureBlock);
  if (headerFooter?.measure) {
    headerFooter = { ...headerFooter, measure: timeMeasureCallback(headerFooter.measure) };
  }
  const fontSignature = fontRuntime?.fontContext?.fontSignature ?? '';
  const previousFontSignature = fontRuntime?.previousFontSignature ?? '';
  // Provisional-vs-exact page-count field mode for every header/footer layout
  // this call performs (pre-layout height passes and final per-page layout).
  const hfTokenOptions: ResolveHeaderFooterTokensOptions | undefined =
    headerFooter?.pageCountFieldsExact === false ? { pageCountFieldsExact: false } : undefined;
  // Header/footer measurement reuse is keyed by exact block content,
  // constraints, font signature, and provisional/exact field mode. Render
  // generation belongs to provider-closure freshness, not measurement
  // identity: including it here remeasured every unchanged furniture block
  // after an ordinary body keystroke.
  const headerFooterCacheSignature = fontSignature;
  // A font-mapping change means newly registered faces can resolve behind the
  // same canvas font strings, so the remeasure glyph/slice width caches are
  // stale even though their keys are unchanged.
  if (previousFontSignature !== '' && previousFontSignature !== fontSignature) {
    clearRemeasureTextCaches();
  }
  const isSemanticFlow = options.flowMode === 'semantic';

  // In semantic mode, neutralize paginated-only inputs so downstream code
  // doesn't need per-step guards.
  if (isSemanticFlow) {
    headerFooter = undefined;
    nextBlocks = rewriteSectionBreaksForSemanticFlow(nextBlocks, options);
  }

  // Dirty region computation
  const effectiveMeasureReuseProof = measureReuseProof ?? layoutReuse;
  const headerFooterOnlyProof = layoutReuse?.provedHeaderFooterOnlyRefresh;
  const headerFooterBodyReferencesRetained =
    !isSemanticFlow &&
    headerFooterOnlyProof?.bodyProjectionRetainedExact === true &&
    headerFooterOnlyProof.bodyLayoutInputsUnchanged === true &&
    previousBlocks.length === nextBlocks.length &&
    previousBlocks.every((block, index) => nextBlocks[index] === block) &&
    new Set(nextBlocks.map((block) => block.id)).size === nextBlocks.length;
  const dirty = headerFooterBodyReferencesRetained
    ? {
        firstDirtyIndex: nextBlocks.length,
        lastStableIndex: nextBlocks.length - 1,
        insertedBlockIds: [],
        deletedBlockIds: [],
        changedBlockIds: [],
        stableBlockIds: new Set(nextBlocks.map((block) => block.id)),
      }
    : (effectiveMeasureReuseProof?.provedDirtyRegion ?? computeDirtyRegions(previousBlocks, nextBlocks));
  // P8.4: cache-miss count that arms content-keyed previous-measure adoption
  // (see the adoption block in the measure loop). Small enough that a
  // structural keystroke's shifted tail engages within a few redundant
  // measures; large enough that plain typing (1-2 changed blocks) never
  // builds the content map.
  const CONTENT_ADOPTION_MISS_THRESHOLD = 4;

  if (dirty.deletedBlockIds.length > 0) {
    measureCache.invalidate(dirty.deletedBlockIds);
  }

  const provedDirtyMeasurePacket =
    (effectiveMeasureReuseProof?.dependencyProof?.profile === 'single-section-local-text' ||
      effectiveMeasureReuseProof?.dependencyProof?.profile === 'document-start-local-text' ||
      effectiveMeasureReuseProof?.dependencyProof?.profile === 'page-checkpoint-local-text') &&
    effectiveMeasureReuseProof.dependencyProof.blockIdsUnchanged === true &&
    effectiveMeasureReuseProof.dependencyProof.blockIdsUnique === true &&
    validateIncrementalPaginationProof(effectiveMeasureReuseProof.dependencyProof) == null &&
    effectiveMeasureReuseProof.dependencyProof.renderInputsUnchanged === true &&
    effectiveMeasureReuseProof.provedDirtyRegion === dirty &&
    effectiveMeasureReuseProof.currentBlockIndexById != null &&
    Array.isArray(previousMeasures) &&
    previousMeasures.length === previousBlocks.length
      ? validateProvedDirtyMeasurePacket({
          blocks: nextBlocks,
          previousBlocks,
          previousMeasures: previousMeasures!,
          dirty,
          previousBlockIndexById: effectiveMeasureReuseProof.previousBlockIndexById ?? null,
          currentBlockIndexById: effectiveMeasureReuseProof.currentBlockIndexById,
          dirtyMeasureConstraints: effectiveMeasureReuseProof.provedDirtyMeasureConstraints ?? null,
          requiresExactConstraints: effectiveMeasureReuseProof.dependencyProof.profile !== 'single-section-local-text',
        })
      : null;
  const provedDirtyMeasureCandidate = provedDirtyMeasurePacket != null;

  // Perf summary emitted at the end of the function.

  // Per-section constraints: each block is measured at its own section's content width.
  // This prevents text clipping in mixed-orientation documents (SD-1962) where the old
  // global-max approach measured all blocks at the widest section's width, causing line
  // breaks to be too wide for narrower sections.
  let perSectionConstraints =
    provedDirtyMeasureCandidate || headerFooterBodyReferencesRetained
      ? null
      : computePerSectionConstraints(options, nextBlocks);

  // Global max constraints are still used for cache invalidation comparison.
  const { measurementWidth, measurementHeight } = resolveMeasurementConstraints(
    options,
    provedDirtyMeasureCandidate ? undefined : nextBlocks,
  );

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
    hasPreviousMeasures && !isSemanticFlow && !headerFooterBodyReferencesRetained
      ? resolveMeasurementConstraints(options, provedDirtyMeasureCandidate ? undefined : previousBlocks)
      : null;
  const canReusePreviousMeasures =
    hasPreviousMeasures &&
    // A mapping change (different signature) makes the prior measures stale even for unchanged
    // blocks; this reuse path bypasses the measure-cache key, so it must check the signature too.
    fontSignature === previousFontSignature &&
    (headerFooterBodyReferencesRetained ||
      (previousConstraints?.measurementWidth === measurementWidth &&
        previousConstraints?.measurementHeight === measurementHeight));
  if (!canReusePreviousMeasures && perSectionConstraints == null) {
    perSectionConstraints = computePerSectionConstraints(options, nextBlocks);
  }
  const previousPerSectionConstraints =
    canReusePreviousMeasures && !provedDirtyMeasureCandidate
      ? computePerSectionConstraints(options, previousBlocks)
      : null;
  const previousMeasuresById =
    canReusePreviousMeasures && !provedDirtyMeasureCandidate
      ? new Map(previousBlocks.map((block, index) => [block.id, previousMeasures![index]]))
      : null;
  const previousConstraintsById =
    canReusePreviousMeasures && !provedDirtyMeasureCandidate
      ? new Map(previousBlocks.map((block, index) => [block.id, previousPerSectionConstraints![index]]))
      : null;

  const measureStart = performance.now();
  const inputPreparationMs = measureStart - bridgeStartedAt;
  let measures: Measure[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  let reusedMeasures = 0;
  let cacheLookupTime = 0;
  let actualMeasureTime = 0;

  // P8.4 — content-keyed previous-measure adoption. Structural keystrokes
  // under synthetic occurrence ids (paraId-less documents: split/merge/paste,
  // collab CRDT merges) shift every downstream block id even though the
  // content is untouched, so both the id-keyed stable set above and the
  // id-prefixed measure cache miss on the whole tail — every block DOM
  // re-measures (~2s/keystroke on 1000-paragraph documents). Measures are a
  // pure function of (content, constraints, font signature); adopting the
  // previous pass's measure on hashMeasureContent equality at equal
  // constraints is exactly as sound as a cache hit. The map is built lazily,
  // and ONLY when a block id unknown to the previous pass misses the cache —
  // plain typing never pays the O(doc) hash pass.
  let previousMeasuresByContent: Map<string, Measure> | null | undefined;
  const adoptPreviousMeasureByContent = (
    block: FlowBlock,
    maxWidth: number,
    maxHeight: number,
  ): Measure | undefined => {
    if (!canReusePreviousMeasures) return undefined;
    if (previousMeasuresByContent === undefined) {
      previousMeasuresByContent = new Map();
      for (let index = 0; index < previousBlocks.length; index++) {
        const previousBlock = previousBlocks[index];
        if (previousBlock.kind === 'sectionBreak') continue;
        const constraints = previousPerSectionConstraints![index];
        const key = `${hashMeasureContent(previousBlock)}@${constraints.maxWidth}x${constraints.maxHeight}`;
        if (!previousMeasuresByContent.has(key)) previousMeasuresByContent.set(key, previousMeasures![index]);
      }
    }
    return previousMeasuresByContent?.get(`${hashMeasureContent(block)}@${maxWidth}x${maxHeight}`) ?? undefined;
  };

  const provedDirtyMeasure = provedDirtyMeasureCandidate && canReusePreviousMeasures ? provedDirtyMeasurePacket : null;
  const yieldEveryBlocks = Math.max(1, Math.floor(execution?.yieldEveryBlocks ?? 32));
  const checkpointMeasurement = (blockIndex: number, totalBlocks: number): Promise<void> | null => {
    throwIfLayoutExecutionAborted(layoutExecution);
    const pending = execution?.checkpointIfDue?.({
      phase: 'measure:block',
      index: blockIndex,
      total: totalBlocks,
    });
    if (pending) return pending;
    if (!execution?.checkpointIfDue && blockIndex > 0 && blockIndex % yieldEveryBlocks === 0) {
      return layoutExecution
        ? checkpointLayoutExecution(layoutExecution, {
            phase: 'measure:block',
            index: blockIndex,
            total: totalBlocks,
          })
        : null;
    }
    return null;
  };
  const checkpointPhaseIfDue = async (): Promise<void> => {
    throwIfLayoutExecutionAborted(layoutExecution);
    const pending = execution?.checkpointIfDue?.();
    if (pending) await pending;
    throwIfLayoutExecutionAborted(layoutExecution);
  };

  if (headerFooterBodyReferencesRetained && canReusePreviousMeasures) {
    measures = previousMeasures!;
    reusedMeasures = nextBlocks.length;
  } else if (provedDirtyMeasure) {
    const overrides = new Map<number, Measure>();
    let dirtyMeasureIndex = 0;
    for (const blockId of provedDirtyMeasure.dirtyBlockIds) {
      const checkpoint = checkpointMeasurement(dirtyMeasureIndex, provedDirtyMeasure.dirtyBlockIds.length);
      if (checkpoint) {
        await checkpoint;
        throwIfLayoutExecutionAborted(layoutExecution);
      }
      dirtyMeasureIndex += 1;
      const blockIndex = provedDirtyMeasure.currentBlockIndexById.get(blockId)!;
      const block = nextBlocks[blockIndex]!;
      const constraints = provedDirtyMeasure.dirtyMeasureConstraints?.get(blockId) ?? {
        maxWidth: measurementWidth,
        maxHeight: measurementHeight,
      };
      observeMeasureConstraints?.(block, constraints);
      const measureBlockStart = performance.now();
      const measurement = await measureBlock(block, constraints);
      actualMeasureTime += performance.now() - measureBlockStart;
      measureCache.set(block, constraints.maxWidth, constraints.maxHeight, measurement, fontSignature);
      overrides.set(blockIndex, measurement);
      cacheMisses += 1;
    }
    if (provedDirtyMeasure.measureSplice) {
      // Structural ±1 alignment: preserve the retained measure plane by
      // position, insert/remove only at the proved adjacent paragraph, then
      // overwrite every dirty result measure. This avoids the O(document)
      // content-hash adoption scan while keeping same-index block/measure
      // ownership exact.
      measures = previousMeasures!.slice();
      if (provedDirtyMeasure.measureSplice.ordinalDelta === 1) {
        const headMeasure = measures[provedDirtyMeasure.measureSplice.atIndex - 1];
        if (!headMeasure) throw new Error('incrementalLayout: structural split measure anchor missing');
        measures.splice(provedDirtyMeasure.measureSplice.atIndex, 0, headMeasure);
      } else {
        measures.splice(provedDirtyMeasure.measureSplice.atIndex, 1);
      }
      for (const [index, measurement] of overrides) measures[index] = measurement;
      if (measures.length !== nextBlocks.length) {
        throw new Error('incrementalLayout: structural measure splice cardinality mismatch');
      }
    } else {
      measures = createMeasureOverlay(previousMeasures!, overrides);
    }
    reusedMeasures = nextBlocks.length - overrides.size;
  } else
    for (let blockIndex = 0; blockIndex < nextBlocks.length; blockIndex++) {
      const checkpoint = checkpointMeasurement(blockIndex, nextBlocks.length);
      if (checkpoint) {
        await checkpoint;
        throwIfLayoutExecutionAborted(layoutExecution);
      }
      const block = nextBlocks[blockIndex];
      if (block.kind === 'sectionBreak') {
        measures.push({ kind: 'sectionBreak' });
        continue;
      }

      // Use per-section constraints for this block's measurement.
      const sectionConstraints = perSectionConstraints![blockIndex];
      const blockMeasureWidth = sectionConstraints.maxWidth;
      const blockMeasureHeight = sectionConstraints.maxHeight;
      observeMeasureConstraints?.(block, sectionConstraints);

      if (canReusePreviousMeasures && dirty.stableBlockIds.has(block.id)) {
        const previousMeasure = previousMeasuresById?.get(block.id);
        const previousBlockConstraints = previousConstraintsById?.get(block.id);
        if (
          previousMeasure &&
          previousBlockConstraints?.maxWidth === blockMeasureWidth &&
          previousBlockConstraints?.maxHeight === blockMeasureHeight
        ) {
          hydrateTabRunWidthsFromMeasure(block, previousMeasure);
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
        hydrateTabRunWidthsFromMeasure(block, cached);
        measures.push(cached);
        cacheHits++;
        continue;
      }

      // P8.4: try content adoption before paying a DOM measure when the miss
      // pattern says ids churned: a block id the previous pass never saw, OR a
      // burst of misses in one pass. The burst arm matters for POSITIONAL id
      // schemes (paraId-less occurrence ordinals): a split shifts every
      // downstream block onto the id its neighbor wore last pass, so the ids
      // all LOOK known while the id-keyed reuse misses on content — without
      // the burst arm the whole tail DOM-remeasures (~2s on 1000-paragraph
      // docs). Plain typing stays under the threshold and never pays the
      // O(doc) hash pass that builds the content map.
      if (
        previousMeasuresById != null &&
        (!previousMeasuresById.has(block.id) || cacheMisses >= CONTENT_ADOPTION_MISS_THRESHOLD)
      ) {
        const adopted = adoptPreviousMeasureByContent(block, blockMeasureWidth, blockMeasureHeight);
        if (adopted) {
          hydrateTabRunWidthsFromMeasure(block, adopted);
          measureCache.set(block, blockMeasureWidth, blockMeasureHeight, adopted, fontSignature);
          measures.push(adopted);
          reusedMeasures++;
          continue;
        }
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
  await checkpointPhaseIfDue();

  perfLog(
    `[Perf] 4.1 Measure all blocks: ${totalMeasureTime.toFixed(2)}ms (${cacheMisses} measured, ${cacheHits} cached, ${reusedMeasures} reused; ${cacheLookupTime.toFixed(2)}ms cache lookup, ${actualMeasureTime.toFixed(2)}ms DOM measure)`,
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
  let headerPreLayoutTime = 0;

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
          headerFooterCacheSignature,
          (block, maxWidth, firstLineIndent, lineRegions) =>
            remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
          hfTokenOptions,
          headerFooterExecution,
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
        headerFooterCacheSignature,
        (block, maxWidth, firstLineIndent, lineRegions) =>
          remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
        hfTokenOptions,
        headerFooterExecution,
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
    const prelayoutPageResolver = layoutExecution
      ? await buildConservativePrelayoutPageResolverCooperatively(nextBlocks, sectionMetadata, layoutExecution)
      : buildConservativePrelayoutPageResolver(nextBlocks, sectionMetadata);

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
        headerFooterCacheSignature,
        (block, maxWidth, firstLineIndent, lineRegions) =>
          remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
        hfTokenOptions,
        headerFooterExecution,
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
    headerPreLayoutTime = hfPreEnd - hfPreStart;
    perfLog(`[Perf] 4.1.5 Pre-layout headers for height: ${headerPreLayoutTime.toFixed(2)}ms`);
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
  let footerPreLayoutTime = 0;

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
    const prelayoutPageResolver = layoutExecution
      ? await buildConservativePrelayoutPageResolverCooperatively(nextBlocks, sectionMetadata, layoutExecution)
      : buildConservativePrelayoutPageResolver(nextBlocks, sectionMetadata);

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
          headerFooterCacheSignature,
          (block, maxWidth, firstLineIndent, lineRegions) =>
            remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
          hfTokenOptions,
          headerFooterExecution,
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
      throwIfLayoutExecutionAborted(layoutExecution);
      console.error('[Layout] Footer pre-layout failed:', error);
      footerContentHeights = undefined;
    }

    const footerPreEnd = performance.now();
    footerPreLayoutTime = footerPreEnd - footerPreStart;
    perfLog(`[Perf] 4.1.6 Pre-layout footers for height: ${footerPreLayoutTime.toFixed(2)}ms`);
  }

  const headerFooterGeometryFingerprint = buildHeaderFooterGeometryFingerprint({
    headerContentHeights,
    footerContentHeights,
    headerContentHeightsByRId,
    headerContentHeightsBySectionRef,
    footerContentHeightsByRId,
    footerContentHeightsBySectionRef,
  });

  // SD-3432: when a warm-start seed is usable, build the INITIAL pagination
  // directly with the seeded reserves (and the note body heights the slicer
  // needs for full fidelity). At steady state the footnote pipeline then
  // validates this layout without a single extra re-pagination — one
  // pagination per keystroke instead of two. The cold path (no seed) is
  // byte-identical to before. The seed remains ONLY a starting vector: the
  // footnote pipeline below still re-validates it in full.
  const warmStartPreparationStart = performance.now();
  const earlyFootnotesInput = isFootnotesLayoutInput(options.footnotes) ? options.footnotes : null;
  const warmSeed = warmStart?.footnoteReserveSeed ?? null;
  const warmSeedBaseUsable =
    !isSemanticFlow &&
    warmSeed !== null &&
    warmSeed.reserves.some((h) => h > 0) &&
    warmSeed.fontSignature === fontSignature &&
    warmSeed.measurementWidth === measurementWidth &&
    earlyFootnotesInput !== null &&
    earlyFootnotesInput.refs.length > 0 &&
    earlyFootnotesInput.blocksById.size > 0;
  const retainedNoteMeasures = warmSeedBaseUsable
    ? validateRetainedNoteMeasurePlane(earlyFootnotesInput!.blocksById, warmSeed!)
    : null;
  const retainedNoteMeasurePlaneExact =
    warmStart?.noteMeasurePlaneRetainedExact === true && retainedNoteMeasures !== null;
  // The proved dirty-measure lane deliberately skips the O(document) section
  // scan, so its conservative global max-height key can differ from the cold
  // seed. That height is only a note-measure cache bound: when the exact note
  // plane has also passed object-identity validation, no note is remeasured
  // under the current bound and the retained reserve vector remains valid.
  // Width still gates unconditionally because it changes line wrapping.
  const warmSeedUsable =
    warmSeedBaseUsable &&
    (warmSeed!.measurementHeight === measurementHeight ||
      (provedDirtyMeasureCandidate && retainedNoteMeasurePlaneExact));
  const retainedNoteHeights =
    retainedNoteMeasurePlaneExact &&
    warmSeed?.noteBodyHeightById instanceof Map &&
    warmSeed.noteFirstLineHeightById instanceof Map &&
    new Set(earlyFootnotesInput?.refs.map((reference) => reference.id) ?? []).size ===
      warmSeed.noteBodyHeightById.size &&
    [...new Set(earlyFootnotesInput?.refs.map((reference) => reference.id) ?? [])].every(
      (id) => warmSeed.noteBodyHeightById!.has(id) && warmSeed.noteFirstLineHeightById!.has(id),
    )
      ? {
          totalMap: warmSeed.noteBodyHeightById,
          firstLineMap: warmSeed.noteFirstLineHeightById,
        }
      : null;
  const retainedFootnoteGeometry =
    provedDirtyMeasureCandidate &&
    retainedNoteMeasures !== null &&
    retainedNoteHeights !== null &&
    warmStart?.noteMeasurePlaneRetainedExact === true &&
    typeof warmSeed?.footnoteMeasurementWidth === 'number' &&
    Number.isFinite(warmSeed.footnoteMeasurementWidth) &&
    warmSeed.footnoteMeasurementWidth > 0 &&
    warmSeed.sectionColumnsByIndex instanceof Map &&
    warmSeed.sectionColumnsByIndex.size > 0
      ? {
          measurementWidth: warmSeed.footnoteMeasurementWidth,
          sectionColumnsByIndex: warmSeed.sectionColumnsByIndex,
        }
      : null;
  let preparedWarmNoteMeasures: ReadonlyMap<string, Measure> | null = null;
  let seededInitialLayout = false;
  let seededInitialOptions: Record<string, unknown> = {};
  if (warmSeedUsable) {
    const earlyFootnoteWidth =
      retainedFootnoteGeometry?.measurementWidth ?? resolveFootnoteMeasurementWidth(options, nextBlocks);
    if (earlyFootnoteWidth > 0) {
      const allIds = new Set(earlyFootnotesInput.refs.map((ref) => ref.id));
      const measuresById =
        retainedNoteMeasures ??
        (
          await measureNoteBlocks(
            allIds,
            earlyFootnotesInput.blocksById,
            { maxWidth: earlyFootnoteWidth, maxHeight: measurementHeight },
            measureBlock,
            fontSignature,
          )
        ).measuresById;
      preparedWarmNoteMeasures = measuresById;
      const { totalMap, firstLineMap } =
        retainedNoteHeights ?? computeNoteBodyHeights(earlyFootnotesInput, measuresById);
      seededInitialOptions = {
        footnoteReservedByPageIndex: warmSeed.reserves,
        footnotes: {
          ...earlyFootnotesInput,
          bodyHeightById: totalMap,
          firstLineHeightById: firstLineMap,
          ...(typeof warmSeed.separatorSpacingBefore === 'number' && Number.isFinite(warmSeed.separatorSpacingBefore)
            ? { separatorSpacingBefore: warmSeed.separatorSpacingBefore }
            : {}),
        },
      };
      seededInitialLayout = true;
    }
  }
  const warmStartPreparationTime = performance.now() - warmStartPreparationStart;

  const layoutStart = performance.now();
  const initialLayoutInvocationTiming = { layoutDocumentMs: 0, layoutDocumentCalls: 0 };
  const initialBodyLayoutOptions: LayoutOptions = {
    ...options,
    ...seededInitialOptions,
    headerContentHeights, // Pass header heights to prevent overlap (per-variant)
    footerContentHeights, // Pass footer heights to prevent overlap (per-variant)
    headerContentHeightsBySectionRef, // Pass header heights by rId+section for exact page-specific margin calculation
    headerContentHeightsByRId, // Pass header heights by rId for per-page margin calculation
    footerContentHeightsBySectionRef, // Pass footer heights by rId+section for exact page-specific margin calculation
    footerContentHeightsByRId, // Pass footer heights by rId for per-page margin calculation
    remeasureParagraph: (
      block: FlowBlock,
      maxWidth: number,
      firstLineIndent?: number,
      lineRegions?: readonly (readonly ParagraphLineRegion[])[],
    ) => remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
  };
  const initialLayoutResult = await layoutWithOptionalReuse({
    previousBlocks,
    blocks: nextBlocks,
    measures,
    options: initialBodyLayoutOptions,
    dirty,
    stableBlockIds: dirty.stableBlockIds,
    reuse: layoutReuse,
    ...(warmSeedUsable && warmSeed && earlyFootnotesInput && preparedWarmNoteMeasures
      ? {
          preparedNoteOnly: {
            previousBlocks,
            footnotes: earlyFootnotesInput,
            currentNoteMeasures: preparedWarmNoteMeasures,
            warmSeed,
          } satisfies PreparedNoteOnlyLayoutReuse,
        }
      : {}),
    ...(headerFooterBodyReferencesRetained && canReusePreviousMeasures
      ? {
          preparedHeaderFooterOnly: {
            currentGeometryFingerprint: headerFooterGeometryFingerprint,
            bodyMeasuresRetainedExact: true,
            footnotes: earlyFootnotesInput,
            warmSeed,
            noteMeasurePlaneRetainedExact: retainedNoteMeasurePlaneExact,
            retainedFootnoteExtras: warmStart?.retainedFootnoteExtras ?? null,
          } satisfies PreparedHeaderFooterOnlyLayoutReuse,
        }
      : {}),
    timing: initialLayoutInvocationTiming,
    execution: layoutExecution,
  });
  let layout = initialLayoutResult.layout;
  let layoutReuseSummary = initialLayoutResult.reuse;
  const provedNoteOnlyFinalization = initialLayoutResult.provedNoteOnlyFinalization ?? null;
  // Tail adoption stores source-generation pages lazily. Downstream
  // finalizers consume current block ids and PM coordinates, so expose the
  // guarded current-coordinate view before they resolve references. Keeping
  // this until return made rekeyed footnote anchors look absent and forced a
  // full-document reserve relayout after an otherwise successful splice.
  let adoptedPagesGuardedForFinalizers = false;
  if (
    layoutReuseSummary.tailAdoption &&
    supportsLocalizedSectionNumbering(options) &&
    (layoutReuseSummary.tailAdoption.pageIndexDelta === 0 ||
      layoutReuseSummary.tailAdoption.displayPageNumberTransform != null)
  ) {
    layout = guardAdoptedLayoutPages(layout, layoutReuseSummary.tailAdoption);
    adoptedPagesGuardedForFinalizers = true;
  }
  const layoutEnd = performance.now();
  const layoutTime = layoutEnd - layoutStart;
  const layoutDocumentTime = initialLayoutInvocationTiming.layoutDocumentMs;
  const layoutReuseOrchestrationTime = Math.max(0, layoutTime - layoutDocumentTime);
  perfLog(`[Perf] 4.2 Layout document (pagination): ${layoutTime.toFixed(2)}ms`);
  await checkpointPhaseIfDue();

  // Two-pass convergence loop for page number token resolution.
  // Steps: paginate -> build numbering context -> resolve PAGE/NUMPAGES tokens
  //        -> remeasure affected blocks -> re-paginate -> repeat until stable
  const maxIterations = 3;
  let currentBlocks = nextBlocks;
  let currentMeasures = measures;
  let iteration = 0;
  const shouldResolveBodyPageTokens =
    !isSemanticFlow && FeatureFlags.BODY_PAGE_TOKENS && layoutReuseSummary.mode === 'full';
  // Chapter context only reads stable paragraph style/marker metadata; PAGE
  // token convergence clones run text but does not change those block attrs.
  const chapterBlockById =
    !shouldResolveBodyPageTokens || layoutReuse?.dependencyProof?.globalDependenciesAbsent === true
      ? new Map<string, FlowBlock>()
      : layoutExecution
        ? await buildBlockByIdCooperatively(currentBlocks, layoutExecution)
        : buildBlockById(currentBlocks);
  const chapterContextCache: ChapterContextCache = {};

  const pageTokenSetupTime = performance.now() - layoutEnd;
  const pageTokenStart = performance.now();
  let totalAffectedBlocks = 0;
  let totalRemeasureTime = 0;
  let totalRelayoutTime = 0;
  let converged = true;

  // Only run token resolution if feature flag is enabled
  // Local pagination is admitted only after dynamic fields were proved absent;
  // avoid a whole-layout token pass (and never interpret retained source page
  // numbers as target physical numbers after a page-count shift).
  if (shouldResolveBodyPageTokens) {
    while (iteration < maxIterations) {
      // Build numbering context from current layout
      const sections = options.sectionMetadata ?? [];
      const numberingCtx = layoutExecution
        ? await buildNumberingContextCooperatively(
            layout,
            sections,
            chapterBlockById,
            chapterContextCache,
            layoutExecution,
          )
        : buildNumberingContext(layout, sections, chapterBlockById, chapterContextCache);

      // Log iteration start
      PageTokenLogger.logIterationStart(iteration, layout.pages.length);

      // Resolve page number tokens. Under provisional pagination, body
      // total-page fields keep their source-cached text (em dash when absent)
      // — only `PAGE` resolves — mirroring the header/footer field policy.
      const pageTokenOptions = { pageCountFieldsExact: headerFooter?.pageCountFieldsExact !== false };
      const tokenResult = layoutExecution
        ? await resolvePageNumberTokensCooperatively(
            layout,
            currentBlocks,
            currentMeasures,
            numberingCtx,
            pageTokenOptions,
            layoutExecution,
          )
        : resolvePageNumberTokens(layout, currentBlocks, currentMeasures, numberingCtx, pageTokenOptions);

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
        layoutExecution,
      );
      const remeasureEnd = performance.now();
      const remeasureTime = remeasureEnd - remeasureStart;
      totalRemeasureTime += remeasureTime;
      perfLog(`[Perf] 4.3.${iteration + 1}.1 Re-measure: ${remeasureTime.toFixed(2)}ms`);
      PageTokenLogger.logRemeasure(tokenResult.affectedBlockIds.size, remeasureTime);

      // Re-run pagination with updated measures (preserving the seeded
      // footnote reserves when the initial pagination was seeded, SD-3432).
      const relayoutStart = performance.now();
      const pageTokenLayoutOptions: LayoutOptions = {
        ...options,
        ...seededInitialOptions,
        headerContentHeights, // Pass header heights to prevent overlap (per-variant)
        footerContentHeights, // Pass footer heights to prevent overlap (per-variant)
        headerContentHeightsBySectionRef, // Pass header heights by rId+section for exact page-specific margin calculation
        headerContentHeightsByRId, // Pass header heights by rId for per-page margin calculation
        footerContentHeightsBySectionRef, // Pass footer heights by rId+section for exact page-specific margin calculation
        footerContentHeightsByRId, // Pass footer heights by rId for per-page margin calculation
        remeasureParagraph: (
          block: FlowBlock,
          maxWidth: number,
          firstLineIndent?: number,
          lineRegions?: readonly (readonly ParagraphLineRegion[])[],
        ) => remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
      };
      layout = layoutExecution
        ? await layoutDocumentCooperatively(currentBlocks, currentMeasures, pageTokenLayoutOptions, layoutExecution)
        : layoutDocument(currentBlocks, currentMeasures, pageTokenLayoutOptions);
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

  // Tables are excluded by the proved local profile. Avoid walking the
  // untouched document merely to discover that there are none.
  if (layoutReuseSummary.mode === 'full') {
    currentBlocks = hydrateTableTextboxMeasures(currentBlocks, (block, maxWidth) =>
      remeasureParagraph(block, maxWidth),
    );
  }

  const pageTokenEnd = performance.now();
  const totalTokenTime = pageTokenEnd - pageTokenStart;
  await checkpointPhaseIfDue();

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
  // SD-3432: stays null unless this run ends on an EXACT footnote fixed point.
  let nextFootnoteReserveSeed: FootnoteReserveSeed | null = null;
  const footnotesInput = isFootnotesLayoutInput(options.footnotes) ? options.footnotes : null;
  const footnoteStart = performance.now();
  let footnoteFullRelayoutPerformed = false;
  let footnoteRelayouts = 0;
  const footnoteRelayoutBreakdown = {
    reserve: 0,
    grow: 0,
    tighten: 0,
    preferred: 0,
    widow: 0,
    revert: 0,
    other: 0,
  };
  if (provedNoteOnlyFinalization) {
    extraBlocks = provedNoteOnlyFinalization.extraBlocks;
    extraMeasures = provedNoteOnlyFinalization.extraMeasures;
    nextFootnoteReserveSeed = provedNoteOnlyFinalization.footnoteReserveSeed;
  } else if (
    !isSemanticFlow &&
    footnotesInput &&
    footnotesInput.refs.length > 0 &&
    footnotesInput.blocksById.size > 0
  ) {
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

    const footnoteWidth =
      retainedFootnoteGeometry?.measurementWidth ?? resolveFootnoteMeasurementWidth(options, currentBlocks);
    if (footnoteWidth > 0) {
      const footnoteSectionColumnsByIndex =
        retainedFootnoteGeometry?.sectionColumnsByIndex ?? resolveSectionColumnsByIndex(options, currentBlocks);
      const footnoteConstraints = { maxWidth: footnoteWidth, maxHeight: measurementHeight };
      // The fixed-point planner can rediscover the same cap/truncation on
      // several internal passes. Console I/O is diagnostic only; emit each
      // stable fact once per incrementalLayout invocation.
      const emittedFootnoteWarningKeys = new Set<string>();

      const collectFootnoteIdsByColumn = (idsByColumn: Map<number, Map<number, string[]>>): Set<string> => {
        const ids = new Set<string>();
        idsByColumn.forEach((columns) => {
          columns.forEach((list) => {
            list.forEach((id) => ids.add(id));
          });
        });
        return ids;
      };

      const measureFootnoteBlocks = (ids: Set<string>) => {
        if (!retainedNoteMeasures) {
          return measureNoteBlocks(ids, footnotesInput.blocksById, footnoteConstraints, measureBlock, fontSignature);
        }
        const blocks: FlowBlock[] = [];
        const measuresById = new Map<string, Measure>();
        for (const id of ids) {
          for (const block of footnotesInput.blocksById.get(id) ?? []) {
            const measure = retainedNoteMeasures.get(block.id);
            if (!measure) {
              return measureNoteBlocks(
                ids,
                footnotesInput.blocksById,
                footnoteConstraints,
                measureBlock,
                fontSignature,
              );
            }
            blocks.push(block);
            measuresById.set(block.id, measure);
          }
        }
        return Promise.resolve({
          blocks,
          measuresById: measuresById.size === retainedNoteMeasures.size ? retainedNoteMeasures : measuresById,
        });
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
            // SD-2656: Any continuation flowing
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
          // Tallest per-column cluster demand for a page's anchored footnotes.
          // The carry-forward bump counts only the FIRST LINE of the last entry
          // (the rest continues onto the following page); the terminal-page bump
          // needs full heights because there is nowhere to continue.
          const clusterDemandFor = (targetPageIndex: number, lastEntryFirstLineOnly: boolean): number => {
            let demand = 0;
            for (let cIdx = 0; cIdx < columnCount; cIdx += 1) {
              const ids = idsByColumn.get(targetPageIndex)?.get(cIdx) ?? [];
              if (ids.length === 0) continue;
              let columnCluster = 0;
              for (let i = 0; i < ids.length; i += 1) {
                const isLast = i === ids.length - 1;
                columnCluster += lastEntryFirstLineOnly && isLast ? firstLineOf(ids[i]) : fullHeightOf(ids[i]);
                if (i > 0) columnCluster += safeGap;
              }
              if (columnCluster > demand) demand = columnCluster;
            }
            return demand;
          };

          // Physical band cap for a page: content height minus a minimum body strip.
          const maxBandFor = (targetPageIndex: number): number => {
            const page = layoutForPages.pages?.[targetPageIndex];
            const size = page?.size ?? layoutForPages.pageSize ?? DEFAULT_PAGE_SIZE;
            const top = normalizeMargin(page?.margins?.top, DEFAULT_MARGINS.top);
            const bottom = normalizeMargin(page?.margins?.bottom, DEFAULT_MARGINS.bottom);
            const physicalContentHeight = Math.max(0, size.h - top - bottom);
            return Math.max(0, physicalContentHeight - MIN_FOOTNOTE_BODY_HEIGHT * 20);
          };

          const bandOverhead = safeSeparatorSpacingBefore + continuationDividerHeight + safeTopPadding;

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
            const nextClusterDemand = clusterDemandFor(pageIndex + 1, true);
            if (continuationDemand > 0 || nextClusterDemand > 0) {
              const nextPageMaxBand = maxBandFor(pageIndex + 1);
              // The band has a single overhead block (separator + padding)
              // whether or not we have a cluster.
              const overheadForBand = nextClusterDemand > 0 || continuationDemand > 0 ? bandOverhead : 0;
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
          } else {
            // SD-3400: terminal-page footnote reserve bump.
            // The carry-forward bump above only runs when there is a next page to
            // drain onto. On the LAST page a footnote anchored here has nowhere to
            // continue, so once the body fills the page the bodyMaxY-derived
            // maxReserve collapses to ~0, placeFootnote can place nothing, and
            // reserves[pageIndex] stays 0 — the body never yields and the footnote
            // is silently dropped. When the placed reserve is short of the anchored
            // demand, bump this page's reserve to that demand (capped at the
            // physical band) so the next relayout pass shrinks the body and the
            // footnote renders on its anchor page (matching Word). Guarded on
            // `< clusterDemand` so pages whose footnote already placed fully are
            // untouched — no gap/regression on non-dense pages.
            const clusterDemand = clusterDemandFor(pageIndex, false);
            if (clusterDemand > 0 && (reserves[pageIndex] ?? 0) < clusterDemand) {
              const finalReserve = Math.min(clusterDemand + bandOverhead, maxBandFor(pageIndex));
              reserves[pageIndex] = Math.max(reserves[pageIndex] ?? 0, Math.ceil(finalReserve));
            }
          }
        }

        if (cappedPages.size > 0) {
          const pages = Array.from(cappedPages).sort((left, right) => left - right);
          const key = `reserve-capped:${pages.join(',')}`;
          if (!emittedFootnoteWarningKeys.has(key)) {
            emittedFootnoteWarningKeys.add(key);
            console.warn('[layout] Footnote reserve capped to preserve body area', { pages });
          }
        }
        if (pendingByColumn.size > 0) {
          const pendingIds = new Set<string>();
          pendingByColumn.forEach((entries) => entries.forEach((entry) => pendingIds.add(entry.id)));
          const ids = Array.from(pendingIds).sort();
          const key = `content-truncated:${ids.join(',')}`;
          if (!emittedFootnoteWarningKeys.has(key)) {
            emittedFootnoteWarningKeys.add(key);
            console.warn('[layout] Footnote content truncated: extends beyond document pages', { ids });
          }
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
        pageIndexesToFinalize: ReadonlySet<number> | null,
      ) => {
        const decorativeBlocks: FlowBlock[] = [];
        const decorativeMeasures: Measure[] = [];

        const pageIndexes =
          pageIndexesToFinalize == null
            ? layoutForPages.pages.keys()
            : [...pageIndexesToFinalize]
                .filter(
                  (pageIndex) =>
                    Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < layoutForPages.pages.length,
                )
                .sort((left, right) => left - right);
        for (const pageIndex of pageIndexes) {
          const page = layoutForPages.pages[pageIndex];
          const nextFootnoteReserved = Math.max(0, reservesByPageIndex[pageIndex] ?? plan.reserves[pageIndex] ?? 0);
          if (page.footnoteReserved !== nextFootnoteReserved) page.footnoteReserved = nextFootnoteReserved;
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
                    columnIndex,
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
                    columnIndex,
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
        const columns = resolvePageColumns(layoutForPages, options, undefined, footnoteSectionColumnsByIndex);
        const paragraphMeasuresByBlockId = new Map<string, ParagraphMeasure>();
        const currentBlockIndexById = effectiveMeasureReuseProof?.currentBlockIndexById;
        if (provedDirtyMeasureCandidate && currentBlockIndexById) {
          const referenceBlockIds = new Set(
            footnotesInput.refs.flatMap((reference) =>
              typeof reference.blockId === 'string' ? [reference.blockId] : [],
            ),
          );
          for (const blockId of referenceBlockIds) {
            const index = currentBlockIndexById.get(blockId);
            if (index == null) continue;
            const block = currentBlocks[index];
            const measure = currentMeasures[index];
            if (block?.kind === 'paragraph' && measure?.kind === 'paragraph') {
              paragraphMeasuresByBlockId.set(block.id, measure);
            }
          }
        } else {
          const pairedLength = Math.min(currentBlocks.length, currentMeasures.length);
          for (let index = 0; index < pairedLength; index += 1) {
            const block = currentBlocks[index];
            const measure = currentMeasures[index];
            if (block?.kind !== 'paragraph' || measure?.kind !== 'paragraph') continue;
            paragraphMeasuresByBlockId.set(block.id, measure);
          }
        }
        const idsByColumn = assignFootnotesToColumns(
          layoutForPages,
          footnotesInput.refs,
          columns,
          paragraphMeasuresByBlockId,
        );
        return { columns, idsByColumn };
      };

      // SD-3049: per-footnote total body height; accounting mirrors `computeFootnoteLayoutPlan`.
      // SD-2656: alongside the total, compute the first valid line/run height
      // so the body slicer can apply the ordered-cluster demand model.
      let bodyHeightById = retainedNoteHeights?.totalMap ?? new Map<string, number>();
      let firstLineHeightById = retainedNoteHeights?.firstLineMap ?? new Map<string, number>();
      const refreshBodyHeights = (measures: Map<string, Measure>) => {
        if (retainedNoteHeights && measures === retainedNoteMeasures) return;
        const { totalMap, firstLineMap } = computeNoteBodyHeights(footnotesInput, measures);
        bodyHeightById = totalMap;
        firstLineHeightById = firstLineMap;
      };

      const summarizeReserveTail = (values: number[]): string[] =>
        values
          .flatMap((value, index) => {
            const normalized = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
            return normalized > 0 ? [`${index + 1}:${normalized}`] : [];
          })
          .slice(-8);

      const logFootnoteLayoutPhase = (
        label: string,
        layoutForPages: Layout,
        appliedReserves: number[],
        plannedReserves?: number[],
        extra?: Record<string, unknown>,
      ): void => {
        if (!layoutDebugEnabled) return;
        console.log('[incrementalLayout] Footnote layout phase', {
          label,
          pageCount: layoutForPages.pages.length,
          appliedReservePages: appliedReserves.filter((value) => (value ?? 0) > 0).length,
          appliedReserveTail: summarizeReserveTail(appliedReserves),
          ...(plannedReserves
            ? {
                plannedReservePages: plannedReserves.filter((value) => (value ?? 0) > 0).length,
                plannedReserveTail: summarizeReserveTail(plannedReserves),
              }
            : {}),
          ...(extra ?? {}),
        });
      };

      // SD-2656: thread the planner's data-driven band overhead values
      // (topPadding, dividerHeight, gap, separatorSpacingBefore) through
      // `footnotes` so the layout-engine's body slicer computes the SAME
      // `bandOverhead(refs)` budget the planner uses to size the band.
      // Otherwise the slicer falls back to defaults that drift on docs with
      // custom separator dimensions, packing body onto a page whose band
      // can't actually fit the refs.
      const relayout = async (
        footnoteReservedByPageIndex: number[],
        plannerSeparatorSpacingBefore?: number,
        label = 'footnote-relayout',
      ): Promise<Layout> => {
        footnoteRelayouts += 1;
        if (label.includes('revert')) footnoteRelayoutBreakdown.revert += 1;
        else if (label.startsWith('reserve-loop')) footnoteRelayoutBreakdown.reserve += 1;
        else if (label.startsWith('grow-pass')) footnoteRelayoutBreakdown.grow += 1;
        else if (label.startsWith('tighten-pass')) footnoteRelayoutBreakdown.tighten += 1;
        else if (label.startsWith('preferred-trial')) footnoteRelayoutBreakdown.preferred += 1;
        else if (label.startsWith('widow-orphan')) footnoteRelayoutBreakdown.widow += 1;
        else footnoteRelayoutBreakdown.other += 1;
        if (layoutExecution) await checkpointLayoutExecution(layoutExecution, { phase: 'footnote:phase' });
        const footnoteLayoutOptions: LayoutOptions = {
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
          remeasureParagraph: (
            block: FlowBlock,
            maxWidth: number,
            firstLineIndent?: number,
            lineRegions?: readonly (readonly ParagraphLineRegion[])[],
          ) => remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
        };
        if (layoutReuse && layoutReuseSummary.mode !== 'full') {
          const localizedReuse = { ...layoutReuse };
          delete localizedReuse.provedNoteOnlyRefresh;
          delete localizedReuse.provedHeaderFooterOnlyRefresh;
          const localizedTiming = { layoutDocumentMs: 0, layoutDocumentCalls: 0 };
          const localized = await layoutWithOptionalReuse({
            previousBlocks,
            blocks: currentBlocks,
            measures: currentMeasures,
            options: footnoteLayoutOptions,
            dirty,
            stableBlockIds: dirty.stableBlockIds,
            reuse: localizedReuse,
            timing: localizedTiming,
            execution: layoutExecution,
          });
          if (localized.reuse.mode !== 'full') {
            layoutReuseSummary = {
              ...localized.reuse,
              reason: `m4-footnote-reserve-localized;${localized.reuse.reason}`,
            };
            let localizedLayout = localized.layout;
            if (
              localized.reuse.tailAdoption &&
              supportsLocalizedSectionNumbering(options) &&
              (localized.reuse.tailAdoption.pageIndexDelta === 0 ||
                localized.reuse.tailAdoption.displayPageNumberTransform != null)
            ) {
              localizedLayout = guardAdoptedLayoutPages(localizedLayout, localized.reuse.tailAdoption);
              adoptedPagesGuardedForFinalizers = true;
            }
            return localizedLayout;
          }
          layoutReuseSummary = localized.reuse;
          footnoteFullRelayoutPerformed = true;
          return localized.layout;
        }
        footnoteFullRelayoutPerformed = true;
        return layoutExecution
          ? layoutDocumentCooperatively(currentBlocks, currentMeasures, footnoteLayoutOptions, layoutExecution)
          : layoutDocument(currentBlocks, currentMeasures, footnoteLayoutOptions);
      };

      // SD-3049: every reachable footnote id, computed once. Used to keep
      // `bodyHeightById` complete across convergence iterations even when refs
      // migrate between pages — the assigned-by-column subset can drop ids
      // mid-loop, which would zero their entries and cause oscillation.
      const allFootnoteIds = new Set(footnotesInput.refs.map((ref) => ref.id));

      footnoteFinalization: {
        // Pass 1: assign + reserve from current layout. Pre-measure ALL footnote
        // bodies (the cache makes the assigned-only subset essentially free).
        let { columns: pageColumns, idsByColumn } = resolveFootnoteAssignments(layout);
        const adoption = layoutReuseSummary.tailAdoption;
        const retainedExtras = warmStart?.retainedFootnoteExtras;
        const checkpointPageIndex = layoutReuseSummary.checkpointPageIndex;
        const assignedFootnoteIds = collectFootnoteIdsByColumn(idsByColumn);
        const previousNotePageIndexes = new Set(warmSeed?.notePageIndexes ?? []);
        warmSeed?.reserves.forEach((reserve, pageIndex) => {
          if (reserve > 0) previousNotePageIndexes.add(pageIndex);
        });
        const retainedFootnotePlaneAdoptable =
          adoption != null &&
          adoption.pageIndexDelta === 0 &&
          Number.isInteger(checkpointPageIndex) &&
          checkpointPageIndex! >= 0 &&
          warmSeedBaseUsable &&
          layoutReuse?.dependencyProof?.renderInputsUnchanged === true &&
          warmStart?.noteMeasurePlaneRetainedExact === true &&
          retainedExtras != null &&
          retainedExtras.blocks.length > 0 &&
          retainedExtras.blocks.length === retainedExtras.measures.length &&
          Array.isArray(warmSeed?.notePageIndexes) &&
          assignedFootnoteIds.size === allFootnoteIds.size &&
          [...idsByColumn.keys()].every(
            (pageIndex) => pageIndex < checkpointPageIndex! || pageIndex >= adoption.startPageIndex,
          ) &&
          [...previousNotePageIndexes].every(
            (pageIndex) => pageIndex < checkpointPageIndex! || pageIndex >= adoption.sourcePageStartIndex,
          );
        if (retainedFootnotePlaneAdoptable) {
          // All note anchors and emitted note pages live in the retained prefix
          // or the exact same-index adopted tail. The guarded page sequence has
          // already rekeyed body ids/PM coordinates, while note bodies and
          // decorative extras are unchanged. Re-running the reserve planner here
          // can only replace a canonical retained band with a cold near-fixed
          // point and turn a four-page edit into whole-document pagination.
          extraBlocks = retainedExtras!.blocks;
          extraMeasures = retainedExtras!.measures;
          nextFootnoteReserveSeed = warmSeed;
          const localPageReplacements = new Map<number, Page>();
          for (let pageIndex = checkpointPageIndex!; pageIndex < adoption!.startPageIndex; pageIndex += 1) {
            const page = layout.pages[pageIndex];
            if (!page) continue;
            localPageReplacements.set(pageIndex, {
              ...page,
              footnoteReserved: 0,
              footnoteLedger: {
                pageIndex,
                anchorIds: [],
                mandatorySliceIds: [],
                continuationSliceIds: [],
                extendedSliceIds: [],
                continuationIn: [],
                continuationOut: [],
                mandatoryReservePx: 0,
                preferredReservePx: 0,
                actualBandHeightPx: 0,
                appliedBodyReservePx: 0,
                deadReservePx: 0,
                lastAnchorRenderedLines: 0,
              },
            });
          }
          layout = {
            ...layout,
            pages: createPageSequenceWithReplacements(layout.pages, localPageReplacements),
          };
          break footnoteFinalization;
        }
        let { measuresById } = await measureFootnoteBlocks(allFootnoteIds);
        refreshBodyHeights(measuresById);
        let plan = computeFootnoteLayoutPlan(
          layout,
          idsByColumn,
          measuresById,
          // SD-3432: a seeded initial layout was built WITH the seed reserves,
          // so the pass-1 plan must use them as its base (mirroring what the
          // convergence loop does on every pass); the cold path keeps [].
          seededInitialLayout && warmSeed ? warmSeed.reserves : [],
          pageColumns,
        );
        let reserves = plan.reserves;
        logFootnoteLayoutPhase('initial-plan', layout, reserves, plan.reserves, {
          assignedFootnoteCount: collectFootnoteIdsByColumn(idsByColumn).size,
        });

        // SD-3432: warm-start. Seed the convergence loop with the previous
        // run's fixed point so an unchanged document validates in ONE relayout
        // instead of converging from zero reserves (measured: 9 full
        // re-paginations -> 1 on a 90-page/25-footnote document) — and in ZERO
        // extra relayouts when the initial pagination was itself seeded and
        // validates immediately below. The seed is gated on the same cold gate
        // as the loop itself (the plan must demand reserves) and on the
        // geometry guards; the loop below re-validates it in full, so a stale
        // seed costs passes, never correctness. Page counts legitimately
        // differ between unreserved and reserved layouts, so the vector length
        // is intentionally unguarded.
        let seededSep: number | undefined;
        let seedApplied = false;
        if (warmSeedUsable && warmSeed && reserves.some((h) => h > 0)) {
          reserves = warmSeed.reserves.slice();
          seededSep = warmSeed.separatorSpacingBefore;
          seedApplied = true;
          if (typeof seededSep === 'number' && Number.isFinite(seededSep)) {
            plan = { ...plan, separatorSpacingBefore: seededSep };
          }
        }

        // Relayout with footnote reserves and iterate until reserves and page count stabilize,
        // so each page gets the correct reserve (avoids "too much" on one page and "not enough" on another).
        if (reserves.some((h) => h > 0)) {
          let reservesStabilized = false;
          // SD-3432: when the INITIAL pagination was already built with the
          // seed, `layout` IS layout(seed) — if the pass-1 plan (computed with
          // the seed as base) reproduces the seed exactly and the separator
          // spacing matches, the fixed point is already validated with zero
          // additional re-paginations.
          if (
            seedApplied &&
            seededInitialLayout &&
            plan.reserves.length === reserves.length &&
            plan.reserves.every((h, i) => (reserves[i] ?? 0) === h) &&
            reserves.every((h, i) => (plan.reserves[i] ?? 0) === h) &&
            (seededSep === undefined || plan.separatorSpacingBefore === seededSep)
          ) {
            reservesStabilized = true;
          }
          // SD-3432: a seeded run must NOT pre-register its starting vector in
          // the cycle detector — a sep-only mismatch on the seeded pass keeps
          // the reserve vector identical, and pre-registration would misread
          // that as oscillation and break before the sep-corrected pass runs.
          const seenReserveVectors: number[][] = seedApplied ? [] : [reserves.slice()];
          for (let pass = 0; !reservesStabilized && pass < MAX_FOOTNOTE_LAYOUT_PASSES; pass += 1) {
            layout = await relayout(reserves, plan.separatorSpacingBefore, `reserve-loop-pass-${pass + 1}`);
            await checkpointPhaseIfDue();
            ({ columns: pageColumns, idsByColumn } = resolveFootnoteAssignments(layout));
            // SD-3049: measure the full set each iteration so `bodyHeightById`
            // stays complete; refs migrating between pages must not drop their
            // measured demand from the per-block lookup.
            ({ measuresById } = await measureFootnoteBlocks(allFootnoteIds));
            refreshBodyHeights(measuresById);
            plan = computeFootnoteLayoutPlan(layout, idsByColumn, measuresById, reserves, pageColumns);
            const nextReserves = plan.reserves;
            // SD-3432: a SEEDED first pass may only early-break when the
            // recomputed separator spacing matches the seeded value the
            // relayout was built with — reserve equality alone would let a
            // stale separator height survive into the painted band.
            const sepConsistent =
              !seedApplied || pass > 0 || plan.separatorSpacingBefore === seededSep || seededSep === undefined;
            logFootnoteLayoutPhase(`reserve-loop-pass-${pass + 1}`, layout, reserves, nextReserves, {
              assignedFootnoteCount: collectFootnoteIdsByColumn(idsByColumn).size,
            });
            const reservesStable =
              sepConsistent &&
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
          logFootnoteLayoutPhase('post-reserve-loop', layout, reservesAppliedToLayout, finalPlan.reserves, {
            assignedFootnoteCount: collectFootnoteIdsByColumn(finalIdsByColumn).size,
          });

          const vectorsEqual = (a: number[], b: number[]): boolean => {
            for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
              if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
            }
            return true;
          };
          const applyReserves = async (target: number[], label = 'apply-reserves') => {
            // Planner sized the band with the measured separator spacing; the
            // body slicer must match or it packs too much and the band overflows.
            layout = await relayout(target, finalPlan.separatorSpacingBefore, label);
            await checkpointPhaseIfDue();
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
            logFootnoteLayoutPhase(label, layout, reservesAppliedToLayout, finalPlan.reserves, {
              assignedFootnoteCount: collectFootnoteIdsByColumn(finalIdsByColumn).size,
            });
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
              await applyReserves(next, `grow-pass-${pass + 1}`);
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

              const targetReserves = getPreferredReserveTrialTargets(
                candidate,
                beforeReserves[candidate.pageIndex] ?? 0,
              );
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

                await applyReserves(
                  trialReserves,
                  `preferred-trial-page-${candidate.pageIndex + 1}-target-${Math.round(cappedPreferredReserve)}`,
                );
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

                await applyReserves(beforeReserves, `preferred-revert-page-${candidate.pageIndex + 1}`);
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
              await applyReserves(tightened, `tighten-pass-${iteration + 1}`);
              if (!(await growReserves(GROW_MAX_PASSES)) || layout.pages.length > safePageCount) {
                await applyReserves(safeApplied, `tighten-revert-${iteration + 1}`);
                break;
              }
            }
          }

          // Absorb one-line footnote widows by bumping their reserve to
          // preferred. Keep this narrow: single-anchor clusters benefit from the
          // classic widow/orphan absorb, but multi-anchor footnote bands can
          // legitimately leave a one-line continuation on the next page. Those
          // larger clusters should stay on the scored preferred-reserve path.
          const ONE_LINE_TAIL_PX = 24;
          const runWidowOrphanAbsorb = async () => {
            const ledgers = buildFootnoteLedgers(finalPlan, reservesAppliedToLayout, layout.pages.length);
            const target = reservesAppliedToLayout.slice();
            let bumped = 0;
            for (const ledger of ledgers) {
              const tailPx = ledger.continuationOut.reduce((s, e) => s + (e.remainingHeightPx || 0), 0);
              if (!shouldAbsorbOneLineFootnoteWidow(ledger, tailPx, ONE_LINE_TAIL_PX)) continue;
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
            const safePageCount = layout.pages.length;
            await applyReserves(target, 'widow-orphan-absorb');
            if (!(await growReserves(GROW_MAX_PASSES)) || layout.pages.length > safePageCount) {
              await applyReserves(safeApplied, 'widow-orphan-revert');
            }
          };
          await runWidowOrphanAbsorb();
          await runPreferredReserveTrials();

          let footnotePageIndexesToFinalize: ReadonlySet<number> | null = null;
          if (!footnoteFullRelayoutPerformed && layoutReuseSummary.mode !== 'full') {
            const currentBodyBlockIndex = layoutReuse?.currentBlockIndexById;
            if (!currentBodyBlockIndex || !warmSeedUsable || !warmSeed) {
              // This is unreachable for a validated warm packet, but keep the
              // finalizer fail-closed if a future caller bypasses that contract.
              await applyReserves(reservesAppliedToLayout, 'retained-note-band-index-missing-full-relayout');
            } else {
              const currentNotePageIndexes = collectFootnoteOutputPageIndexes(finalPlan, reservesAppliedToLayout);
              const previousNotePageIndexes = new Set(warmSeed.notePageIndexes ?? []);
              warmSeed.reserves.forEach((reserve, pageIndex) => {
                // A stale sparse hint may cost extra page clones, but it may
                // never hide a positively reserved source page from cleanup.
                if (reserve > 0) previousNotePageIndexes.add(pageIndex);
              });
              const pageIndexesToFinalize = collectFootnoteReinjectionPageIndexes(
                layout.pages.length,
                currentNotePageIndexes,
                previousNotePageIndexes,
                layoutReuseSummary.tailAdoption,
              );
              const tailAdoption = layoutReuseSummary.tailAdoption;
              const localCheckpoint = layoutReuseSummary.checkpointPageIndex;
              if (tailAdoption && Number.isInteger(localCheckpoint) && localCheckpoint! >= 0) {
                for (let pageIndex = localCheckpoint!; pageIndex < tailAdoption.startPageIndex; pageIndex += 1) {
                  pageIndexesToFinalize.add(pageIndex);
                }
              }
              footnotePageIndexesToFinalize = pageIndexesToFinalize;
              layout = prepareRetainedPagesForFootnoteReinjection(
                layout,
                currentBodyBlockIndex,
                footnotePageIndexesToFinalize,
                layoutReuseSummary.tailAdoption?.blockIdRewrites ?? null,
              );
            }
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
            footnotePageIndexesToFinalize,
          );
          if (footnotePageIndexesToFinalize) {
            layout = {
              ...layout,
              pages: ensureEmptyFootnoteMetadataOutsideFinalizedPages(layout.pages, footnotePageIndexesToFinalize),
            };
          }

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

          // SD-3432: capture the applied reserves as the next run's seed
          // whenever this run reserved anything. Capture is deliberately
          // UNCONDITIONAL on exactness: the seed is only a starting vector that
          // the next run fully re-validates, so capturing a NEAR-fixed-point is
          // both safe and necessary — it is how the chain bootstraps. Real
          // documents (the SD-3432 repro) end their cold ladder with small dead
          // reserves left by reverted tighten attempts; refusing to capture
          // those keeps the document cold forever, while seeding them lets the
          // next run converge the rest of the way and capture the TRUE fixed
          // point, after which every keystroke validates in a single relayout.
          // The exactness check below is diagnostics only: `exact=true` means
          // the next identical run will pass-1-validate (the steady state).
          if (reservesAppliedToLayout.some((h) => h > 0)) {
            nextFootnoteReserveSeed = {
              reserves: reservesAppliedToLayout.slice(),
              notePageIndexes: [...collectFootnoteOutputPageIndexes(finalPlan, reservesAppliedToLayout)].sort(
                (left, right) => left - right,
              ),
              separatorSpacingBefore: finalPlan.separatorSpacingBefore,
              fontSignature,
              measurementWidth,
              measurementHeight,
              footnoteMeasurementWidth: footnoteWidth,
              sectionColumnsByIndex: new Map(
                [...footnoteSectionColumnsByIndex].map(([sectionIndex, columns]) => [
                  sectionIndex,
                  cloneColumnLayout(columns),
                ]),
              ),
              noteBlocksByBlockId: new Map(finalBlocks.map((block) => [block.id, block])),
              noteMeasuresByBlockId: new Map(finalMeasuresById),
              noteBodyHeightById: new Map(bodyHeightById),
              noteFirstLineHeightById: new Map(firstLineHeightById),
            };
          }
          const exactFixedPoint =
            finalPlan.reserves.length <= reservesAppliedToLayout.length &&
            reservesAppliedToLayout.every((h, i) => (finalPlan.reserves[i] ?? 0) === (h ?? 0)) &&
            finalPlan.reserves.every((h, i) => (reservesAppliedToLayout[i] ?? 0) === (h ?? 0));
          if (!exactFixedPoint) {
            perfLog(
              `[Perf] 4.5 footnote warm-start: captured a near-fixed-point (stabilized=${reservesStabilized}); next run settles it`,
            );
          }
        }
      }
    }
  }
  const footnoteTime = performance.now() - footnoteStart;

  if (footnoteFullRelayoutPerformed && layoutReuseSummary.mode !== 'full') {
    // The note fixed-point finalizer currently re-paginates the complete body
    // when its retained reserve seed cannot validate without another pass.
    // Once that happens the initial tail-splice descriptor no longer owns the
    // published layout: retaining it would apply PM transforms twice and skip
    // numbering finalization across the alleged adopted tail. Report and
    // finalize the result as the full layout it actually is.
    const initialReuseReason = layoutReuseSummary.reason;
    layoutReuseSummary = {
      mode: 'full',
      reason: `m4-layout-reuse-disabled-footnote-finalizer-full-relayout;initial=${initialReuseReason}`,
      tailDisposition: 'none',
      checkpointPageIndex: null,
      affectedFrontierPageIndex: null,
      sourceAffectedFrontierPageIndex: null,
      convergencePageIndex: null,
      sourceConvergencePageIndex: null,
      pagesPaginated: null,
      pagesSplicedByReuse: 0,
      tailAdoption: null,
    };
  }

  let headers: HeaderFooterLayoutResult[] | undefined;
  let footers: HeaderFooterLayoutResult[] | undefined;
  let finalHeaderFooterTime = 0;
  const numberingStart = performance.now();
  const sections = options.sectionMetadata ?? [];
  const localizedSectionNumbering =
    layoutReuseSummary.mode !== 'full' &&
    supportsLocalizedSectionNumbering(options) &&
    (layoutReuseSummary.tailAdoption == null ||
      layoutReuseSummary.tailAdoption.pageIndexDelta === 0 ||
      layoutReuseSummary.tailAdoption.displayPageNumberTransform != null);
  const numberingCtx: NumberingContext = localizedSectionNumbering
    ? { totalPages: layout.pages.length, displayPages: [] }
    : layoutExecution
      ? await buildNumberingContextCooperatively(
          layout,
          sections,
          chapterBlockById,
          chapterContextCache,
          layoutExecution,
        )
      : buildNumberingContext(layout, sections, chapterBlockById, chapterContextCache);
  if (localizedSectionNumbering) {
    if (layoutExecution) {
      await applyLocalizedSectionNumberingCooperatively(layout, layoutReuseSummary, sections, layoutExecution);
    } else {
      applyLocalizedSectionNumbering(layout, layoutReuseSummary, sections);
    }
  } else {
    if (layoutExecution) {
      await applyNumberingContextToLayoutCooperatively(layout, numberingCtx, layoutReuseSummary, layoutExecution);
    } else {
      applyNumberingContextToLayout(layout, numberingCtx, layoutReuseSummary);
    }
  }
  const numberingTime = performance.now() - numberingStart;

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
        headerFooterCacheSignature,
        (block, maxWidth, firstLineIndent, lineRegions) =>
          remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
        hfTokenOptions,
        headerFooterExecution,
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
        headerFooterCacheSignature,
        (block, maxWidth, firstLineIndent, lineRegions) =>
          remeasureParagraph(block as ParagraphBlock, maxWidth, firstLineIndent, lineRegions),
        hfTokenOptions,
        headerFooterExecution,
      );
      footers = serializeHeaderFooterResults('footer', footerLayouts);
    }

    const hfEnd = performance.now();
    finalHeaderFooterTime = hfEnd - hfStart;
    perfLog(`[Perf] 4.4 Header/footer layout: ${finalHeaderFooterTime.toFixed(2)}ms`);

    // Record header/footer cache metrics
    const cacheStats = headerMeasureCache.getStats();
    globalMetrics.recordHeaderFooterCacheMetrics(cacheStats);
    HeaderFooterCacheLogger.logStats(cacheStats);
  }
  const layoutExposureStart = performance.now();
  const exposedLayout =
    layoutReuseSummary.tailAdoption && !adoptedPagesGuardedForFinalizers
      ? guardAdoptedLayoutPages(
          layout,
          layoutReuseSummary.tailAdoption,
          localizedSectionNumbering ? null : numberingCtx,
        )
      : layout;
  const layoutExposureTime = performance.now() - layoutExposureStart;
  const totalBridgeTime = performance.now() - bridgeStartedAt;
  const measureCallbackWallTime = computeTimingUnionMs(measureCallbackIntervals);
  const additiveTopLevelMs =
    inputPreparationMs +
    totalMeasureTime +
    headerPreLayoutTime +
    footerPreLayoutTime +
    warmStartPreparationTime +
    layoutTime +
    pageTokenSetupTime +
    totalTokenTime +
    footnoteTime +
    numberingTime +
    layoutExposureTime +
    finalHeaderFooterTime;
  const bridgeTiming: IncrementalLayoutBridgeTiming = {
    totalMs: roundTimingMs(totalBridgeTime),
    inputPreparationMs: roundTimingMs(inputPreparationMs),
    measureTotalMs: roundTimingMs(totalMeasureTime),
    measureCallbackWallMs: roundTimingMs(measureCallbackWallTime),
    measureCacheLookupMs: roundTimingMs(cacheLookupTime),
    measureActualMs: roundTimingMs(actualMeasureTime),
    headerFooterPreLayoutMs: roundTimingMs(headerPreLayoutTime + footerPreLayoutTime),
    headerPreLayoutMs: roundTimingMs(headerPreLayoutTime),
    footerPreLayoutMs: roundTimingMs(footerPreLayoutTime),
    warmStartPreparationMs: roundTimingMs(warmStartPreparationTime),
    layoutDocumentMs: roundTimingMs(layoutDocumentTime),
    layoutReuseOrchestrationMs: roundTimingMs(layoutReuseOrchestrationTime),
    paginationMs: roundTimingMs(layoutDocumentTime),
    pageTokenSetupMs: roundTimingMs(pageTokenSetupTime),
    pageTokenTotalMs: roundTimingMs(totalTokenTime),
    pageTokenRemeasureMs: roundTimingMs(totalRemeasureTime),
    pageTokenRelayoutMs: roundTimingMs(totalRelayoutTime),
    footnoteMs: roundTimingMs(footnoteTime),
    numberingMs: roundTimingMs(numberingTime),
    finalHeaderFooterMs: roundTimingMs(finalHeaderFooterTime),
    layoutExposureMs: roundTimingMs(layoutExposureTime),
    unattributedMs: roundTimingMs(totalBridgeTime - additiveTopLevelMs),
    counters: {
      blocksRead: nextBlocks.length,
      cacheHits,
      cacheMisses,
      measuresAdopted: reusedMeasures,
      pagesPaginated: layoutReuseSummary.pagesPaginated,
      pagesSplicedByReuse: layoutReuseSummary.pagesSplicedByReuse,
      paginationPasses: initialLayoutInvocationTiming.layoutDocumentCalls + iteration + footnoteRelayouts,
      pageTokenRelayouts: iteration,
      footnoteRelayouts,
      footnoteReserveRelayouts: footnoteRelayoutBreakdown.reserve,
      footnoteGrowRelayouts: footnoteRelayoutBreakdown.grow,
      footnoteTightenRelayouts: footnoteRelayoutBreakdown.tighten,
      footnotePreferredRelayouts: footnoteRelayoutBreakdown.preferred,
      footnoteWidowRelayouts: footnoteRelayoutBreakdown.widow,
      footnoteRevertRelayouts: footnoteRelayoutBreakdown.revert,
      footnoteOtherRelayouts: footnoteRelayoutBreakdown.other,
    },
  };

  return {
    layout: exposedLayout,
    blocks: currentBlocks,
    measures: currentMeasures,
    dirty,
    headers,
    footers,
    extraBlocks,
    extraMeasures,
    footnoteReserveSeed: nextFootnoteReserveSeed,
    headerFooterGeometryFingerprint,
    layoutReuse: layoutReuseSummary,
    measureReuse: {
      mode:
        headerFooterBodyReferencesRetained && canReusePreviousMeasures
          ? 'body-stable'
          : provedDirtyMeasure
            ? 'proved-dirty-only'
            : 'full-scan',
      blocksMeasured: cacheMisses,
      measuresAdopted: reusedMeasures,
      reason:
        headerFooterBodyReferencesRetained && canReusePreviousMeasures
          ? 'header-footer-only-body-measure-plane-retained'
          : provedDirtyMeasure
            ? 'exact-envelope-dirty-measure-packet'
            : 'proved-dirty-measure-packet-unavailable',
    },
    bridgeTiming,
  };
}

function validateProvedDirtyMeasurePacket(input: {
  blocks: FlowBlock[];
  previousBlocks: FlowBlock[];
  previousMeasures: Measure[];
  dirty: ReturnType<typeof computeDirtyRegions>;
  previousBlockIndexById: ReadonlyMap<string, number> | null;
  currentBlockIndexById: ReadonlyMap<string, number>;
  dirtyMeasureConstraints: ReadonlyMap<string, { maxWidth: number; maxHeight: number }> | null;
  requiresExactConstraints: boolean;
}): {
  dirtyBlockIds: readonly string[];
  currentBlockIndexById: ReadonlyMap<string, number>;
  dirtyMeasureConstraints: ReadonlyMap<string, { maxWidth: number; maxHeight: number }> | null;
  measureSplice: { ordinalDelta: 1 | -1; atIndex: number } | null;
} | null {
  if (input.previousMeasures.length !== input.previousBlocks.length) return null;
  if (input.currentBlockIndexById.size !== input.blocks.length) return null;
  const inserted = input.dirty.insertedBlockIds;
  const deleted = input.dirty.deletedBlockIds;
  let measureSplice: { ordinalDelta: 1 | -1; atIndex: number } | null = null;
  if (inserted.length === 0 && deleted.length === 0) {
    if (input.blocks.length !== input.previousBlocks.length) return null;
  } else if (inserted.length === 1 && deleted.length === 0) {
    if (input.blocks.length !== input.previousBlocks.length + 1 || !input.previousBlockIndexById) return null;
    const insertedIndex = input.currentBlockIndexById.get(inserted[0]!);
    if (!Number.isInteger(insertedIndex) || insertedIndex! <= 0) return null;
    const headId = input.blocks[insertedIndex! - 1]?.id;
    if (
      !headId ||
      input.previousBlockIndexById.get(headId) !== insertedIndex! - 1 ||
      input.previousBlocks[insertedIndex! - 1]?.id !== headId
    )
      return null;
    measureSplice = { ordinalDelta: 1, atIndex: insertedIndex! };
  } else if (inserted.length === 0 && deleted.length === 1) {
    if (input.blocks.length + 1 !== input.previousBlocks.length || !input.previousBlockIndexById) return null;
    const deletedIndex = input.previousBlockIndexById.get(deleted[0]!);
    if (!Number.isInteger(deletedIndex) || deletedIndex! <= 0) return null;
    const headId = input.previousBlocks[deletedIndex! - 1]?.id;
    if (
      !headId ||
      input.currentBlockIndexById.get(headId) !== deletedIndex! - 1 ||
      input.blocks[deletedIndex! - 1]?.id !== headId
    )
      return null;
    measureSplice = { ordinalDelta: -1, atIndex: deletedIndex! };
  } else {
    return null;
  }
  const dirtyBlockIds = [...new Set(input.dirty.changedBlockIds)];
  if (dirtyBlockIds.length === 0 || dirtyBlockIds.length !== input.dirty.changedBlockIds.length) return null;
  for (const blockId of dirtyBlockIds) {
    const index = input.currentBlockIndexById.get(blockId);
    if (!Number.isInteger(index) || index! < 0 || index! >= input.blocks.length) return null;
    const current = input.blocks[index!]!;
    if (current.id !== blockId || current.kind === 'sectionBreak') return null;
    if (!inserted.includes(blockId)) {
      const previousIndex = input.previousBlockIndexById?.get(blockId) ?? index;
      if (!Number.isInteger(previousIndex) || input.previousBlocks[previousIndex!]?.id !== blockId) return null;
    }
    const constraints = input.dirtyMeasureConstraints?.get(blockId);
    if (
      input.requiresExactConstraints &&
      (!constraints ||
        !Number.isFinite(constraints.maxWidth) ||
        constraints.maxWidth <= 0 ||
        !Number.isFinite(constraints.maxHeight) ||
        // measuring-dom treats zero as the exact unbounded-height contract.
        constraints.maxHeight < 0)
    )
      return null;
  }
  return {
    dirtyBlockIds,
    currentBlockIndexById: input.currentBlockIndexById,
    dirtyMeasureConstraints: input.dirtyMeasureConstraints,
    measureSplice,
  };
}

interface PersistentMeasureNode {
  zero?: PersistentMeasureNode;
  one?: PersistentMeasureNode;
  hasValue?: true;
  value?: Measure;
}

const persistentMeasureOverlays = new WeakMap<
  object,
  {
    base: Measure[];
    root: PersistentMeasureNode | null;
  }
>();

function createMeasureOverlay(previous: Measure[], overrides: ReadonlyMap<number, Measure>): Measure[] {
  const prior = persistentMeasureOverlays.get(previous);
  const base = prior?.base ?? previous;
  let root = prior?.root ?? null;
  for (const [index, value] of overrides) root = setPersistentMeasureValue(root, index, value, 31);
  const proxy = new Proxy(base, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^(?:0|[1-9]\d*)$/.test(property)) {
        const replacement = getPersistentMeasureValue(root, Number(property), 31);
        if (replacement.found) return replacement.value;
      }
      return Reflect.get(target, property, receiver);
    },
    set() {
      throw new Error('retained measure overlays are immutable');
    },
    deleteProperty() {
      throw new Error('retained measure overlays are immutable');
    },
  });
  persistentMeasureOverlays.set(proxy, { base, root });
  return proxy;
}

function setPersistentMeasureValue(
  node: PersistentMeasureNode | null,
  index: number,
  value: Measure,
  bit: number,
): PersistentMeasureNode {
  if (bit < 0) return { ...node, hasValue: true, value };
  const branch = Math.floor(index / 2 ** bit) % 2;
  return branch === 0
    ? { ...node, zero: setPersistentMeasureValue(node?.zero ?? null, index, value, bit - 1) }
    : { ...node, one: setPersistentMeasureValue(node?.one ?? null, index, value, bit - 1) };
}

function getPersistentMeasureValue(
  root: PersistentMeasureNode | null,
  index: number,
  bit: number,
): { found: boolean; value?: Measure } {
  let node = root;
  for (let currentBit = bit; currentBit >= 0 && node; currentBit -= 1) {
    const branch = Math.floor(index / 2 ** currentBit) % 2;
    node = branch === 0 ? (node.zero ?? null) : (node.one ?? null);
  }
  return node?.hasValue ? { found: true, value: node.value } : { found: false };
}

function tryBuildProvedHeaderFooterOnlyLayoutReuse(input: {
  previousLayout: Layout;
  previousBlocks: readonly FlowBlock[];
  currentBlocks: readonly FlowBlock[];
  reuse: IncrementalLayoutReuseOptions;
  prepared: PreparedHeaderFooterOnlyLayoutReuse | null;
  onReject: (reason: string) => void;
}): {
  layout: Layout;
  reuse: IncrementalLayoutReuseSummary;
  provedNoteOnlyFinalization?: ProvedNoteOnlyLayoutFinalization;
} | null {
  const reject = (reason: string): null => {
    input.onReject(reason);
    perfLog(`[incrementalLayout] Header/footer-only reuse rejected: ${reason}`);
    return null;
  };
  const proof = input.reuse.provedHeaderFooterOnlyRefresh;
  const prepared = input.prepared;
  if (!proof || !prepared) return reject('proof-or-prepared-input-missing');
  if (
    proof.bodyProjectionRetainedExact !== true ||
    proof.bodyLayoutInputsUnchanged !== true ||
    typeof proof.previousGeometryFingerprint !== 'string' ||
    proof.previousGeometryFingerprint.length === 0
  ) {
    return reject('body-stability-proof-invalid');
  }
  if (proof.previousGeometryFingerprint !== prepared.currentGeometryFingerprint) {
    return reject('furniture-geometry-changed');
  }
  if (
    prepared.bodyMeasuresRetainedExact !== true ||
    input.previousBlocks.length !== input.currentBlocks.length ||
    input.previousBlocks.some((block, index) => input.currentBlocks[index] !== block)
  ) {
    return reject('body-plane-not-retained-exact');
  }
  const previousPages = input.previousLayout.pages;
  if (previousPages.length < 2) return reject('stable-tail-unavailable');

  let provedNoteOnlyFinalization: ProvedNoteOnlyLayoutFinalization | undefined;
  const footnotes = prepared.footnotes;
  if (footnotes && (footnotes.refs.length > 0 || footnotes.blocksById.size > 0)) {
    const seed = prepared.warmSeed;
    const extras = prepared.retainedFootnoteExtras;
    if (
      footnotes.refs.length === 0 ||
      footnotes.blocksById.size === 0 ||
      !seed ||
      prepared.noteMeasurePlaneRetainedExact !== true ||
      !extras ||
      extras.blocks.length === 0 ||
      extras.blocks.length !== extras.measures.length ||
      seed.reserves.length !== previousPages.length ||
      !(seed.noteBlocksByBlockId instanceof Map) ||
      !(seed.noteMeasuresByBlockId instanceof Map) ||
      validateRetainedNoteMeasurePlane(footnotes.blocksById, seed) == null
    ) {
      return reject('retained-footnote-plane-incomplete');
    }
    const currentNoteIds = new Set(footnotes.refs.map((reference) => reference.id));
    if (
      currentNoteIds.size !== footnotes.blocksById.size ||
      [...footnotes.blocksById.keys()].some((noteId) => !currentNoteIds.has(noteId))
    ) {
      return reject('retained-footnote-inventory-mismatch');
    }
    provedNoteOnlyFinalization = {
      extraBlocks: extras.blocks,
      extraMeasures: extras.measures,
      footnoteReserveSeed: seed,
    };
  }

  const replacements = new Map<number, Page>([[0, materializeAdoptedLayoutPage(previousPages[0]!, [], 0)]]);
  const pages = createPageSequenceWithReplacements(previousPages, replacements);
  const tailStartPageIndex = 1;
  return {
    layout: { ...input.previousLayout, pages },
    reuse: {
      mode: 'tail-splice',
      reason: 'm4-header-footer-geometry-stable-body-tail-adopted',
      tailDisposition: 'adopted-source-tail',
      checkpointPageIndex: 0,
      affectedFrontierPageIndex: 0,
      sourceAffectedFrontierPageIndex: 0,
      convergencePageIndex: tailStartPageIndex,
      sourceConvergencePageIndex: tailStartPageIndex,
      pagesPaginated: 0,
      pagesSplicedByReuse: previousPages.length - tailStartPageIndex,
      tailAdoption: {
        startPageIndex: tailStartPageIndex,
        endPageIndexExclusive: previousPages.length,
        sourcePageStartIndex: tailStartPageIndex,
        sourcePageEndIndexExclusive: previousPages.length,
        pageIndexDelta: 0,
        sectionPageNumberTransform: null,
        pageReferenceLocationsStable: true,
        sourceLayoutEpoch: input.previousLayout.layoutEpoch ?? null,
        positionTransforms: [],
        blockIdRewrites: null,
      },
    },
    ...(provedNoteOnlyFinalization ? { provedNoteOnlyFinalization } : {}),
  };
}

function tryBuildProvedNoteOnlyLayoutReuse(input: {
  previousLayout: Layout;
  previousBlocks: readonly FlowBlock[];
  currentBlocks: readonly FlowBlock[];
  dirtyBlockIds: readonly string[];
  reuse: IncrementalLayoutReuseOptions;
  prepared: PreparedNoteOnlyLayoutReuse | null;
  onReject: (reason: string) => void;
}): {
  layout: Layout;
  reuse: IncrementalLayoutReuseSummary;
  provedNoteOnlyFinalization: ProvedNoteOnlyLayoutFinalization;
} | null {
  const reject = (reason: string): null => {
    input.onReject(reason);
    perfLog(`[incrementalLayout] Note-only reuse rejected: ${reason}`);
    return null;
  };
  const proof = input.reuse.provedNoteOnlyRefresh;
  const prepared = input.prepared;
  if (!proof || !prepared) return reject('proof-or-prepared-input-missing');
  const dependencyProof = input.reuse.dependencyProof;
  if (
    !dependencyProof ||
    (dependencyProof.profile !== 'document-start-local-text' &&
      (dependencyProof.profile !== 'page-checkpoint-local-text' ||
        !dependencyProof.admittedDependencyClasses.includes('footnotes')))
  ) {
    return reject('dependency-proof-missing-footnotes');
  }
  if (
    proof.noteIds.length === 0 ||
    new Set(proof.noteIds).size !== proof.noteIds.length ||
    proof.bodyReferenceBlockIds.length === 0 ||
    !haveExactUniqueIdSet(proof.bodyReferenceBlockIds, input.dirtyBlockIds)
  ) {
    return reject('note-or-reference-proof-invalid');
  }
  if (
    input.previousBlocks.length !== input.currentBlocks.length ||
    input.previousBlocks.some((block, index) => input.currentBlocks[index] !== block) ||
    prepared.previousBlocks.length !== input.previousBlocks.length ||
    prepared.previousBlocks.some((block, index) => input.previousBlocks[index] !== block)
  ) {
    return reject('body-block-identities-not-retained');
  }

  const refreshedNoteIds = new Set(proof.noteIds);
  const currentRefs = prepared.footnotes.refs;
  const provedReferenceBlockIds = [
    ...new Set(
      currentRefs
        .filter((reference) => refreshedNoteIds.has(reference.id))
        .map((reference) => reference.blockId)
        .filter((blockId): blockId is string => typeof blockId === 'string' && blockId.length > 0),
    ),
  ];
  if (
    !haveExactUniqueIdSet(provedReferenceBlockIds, proof.bodyReferenceBlockIds) ||
    proof.noteIds.some(
      (noteId) =>
        !currentRefs.some(
          (reference) =>
            reference.id === noteId && typeof reference.blockId === 'string' && reference.blockId.length > 0,
        ),
    )
  ) {
    return reject('current-reference-anchor-mismatch');
  }

  const retainedBlocksById = prepared.warmSeed.noteBlocksByBlockId;
  const retainedMeasuresById = prepared.warmSeed.noteMeasuresByBlockId;
  const retainedBodyHeightById = prepared.warmSeed.noteBodyHeightById;
  const retainedFirstLineHeightById = prepared.warmSeed.noteFirstLineHeightById;
  if (
    !(retainedBlocksById instanceof Map) ||
    !(retainedMeasuresById instanceof Map) ||
    !(retainedBodyHeightById instanceof Map) ||
    !(retainedFirstLineHeightById instanceof Map)
  ) {
    return reject('retained-note-seed-incomplete');
  }

  const referencedNoteIds = [...new Set(currentRefs.map((reference) => reference.id))];
  if (
    referencedNoteIds.length !== prepared.footnotes.blocksById.size ||
    [...prepared.footnotes.blocksById.keys()].some((noteId) => !referencedNoteIds.includes(noteId)) ||
    proof.noteIds.some((noteId) => !prepared.footnotes.blocksById.has(noteId))
  ) {
    return reject('current-note-inventory-mismatch');
  }
  const currentNoteBlocks: FlowBlock[] = [];
  const currentNoteBlockIds = new Set<string>();
  for (const noteId of referencedNoteIds) {
    const blocks = prepared.footnotes.blocksById.get(noteId);
    if (!blocks || blocks.length === 0) return reject(`current-note-empty:${noteId}`);
    for (const block of blocks) {
      if (!block.id || currentNoteBlockIds.has(block.id)) return reject(`current-note-block-id-invalid:${block.id}`);
      currentNoteBlockIds.add(block.id);
      currentNoteBlocks.push(block);
      const retainedBlock = retainedBlocksById.get(block.id);
      const retainedMeasure = retainedMeasuresById.get(block.id);
      const currentMeasure = prepared.currentNoteMeasures.get(block.id);
      if (!retainedBlock || !retainedMeasure || !currentMeasure) {
        return reject(`retained-note-block-or-measure-missing:${block.id}`);
      }
      if (!refreshedNoteIds.has(noteId) && block !== retainedBlock) {
        return reject(`unrelated-note-block-identity-changed:${noteId}:${block.id}`);
      }
      if (
        refreshedNoteIds.has(noteId) &&
        block !== retainedBlock &&
        !areChangedFootnoteBlockFramesEquivalent(retainedBlock, block, retainedMeasure, currentMeasure)
      ) {
        return reject(`refreshed-note-block-frame-changed:${noteId}:${block.id}`);
      }
    }
  }
  if (
    currentNoteBlocks.length !== retainedBlocksById.size ||
    currentNoteBlocks.length !== retainedMeasuresById.size ||
    currentNoteBlocks.length !== prepared.currentNoteMeasures.size
  ) {
    return reject(
      `note-plane-size-mismatch:blocks=${currentNoteBlocks.length}:retainedBlocks=${retainedBlocksById.size}:retainedMeasures=${retainedMeasuresById.size}:currentMeasures=${prepared.currentNoteMeasures.size}`,
    );
  }

  const currentRangesByNoteId = new Map<string, FootnoteRange[]>();
  for (const noteId of referencedNoteIds) {
    const currentBlocks = prepared.footnotes.blocksById.get(noteId)!;
    const retainedBlocks: FlowBlock[] = [];
    for (const block of currentBlocks) {
      const retainedBlock = retainedBlocksById.get(block.id);
      if (!retainedBlock) return reject(`retained-note-block-missing:${block.id}`);
      retainedBlocks.push(retainedBlock);
    }
    const currentRanges = buildFootnoteRanges(currentBlocks, new Map(prepared.currentNoteMeasures));
    currentRangesByNoteId.set(noteId, currentRanges);
    if (
      refreshedNoteIds.has(noteId) &&
      !areFootnoteRangesLayoutEquivalent(buildFootnoteRanges(retainedBlocks, retainedMeasuresById), currentRanges)
    ) {
      return reject(`refreshed-note-layout-geometry-changed:${noteId}`);
    }
  }
  const currentHeights = computeNoteBodyHeights(prepared.footnotes, new Map(prepared.currentNoteMeasures));
  if (
    referencedNoteIds.some(
      (noteId) =>
        currentHeights.totalMap.get(noteId) !== retainedBodyHeightById.get(noteId) ||
        currentHeights.firstLineMap.get(noteId) !== retainedFirstLineHeightById.get(noteId),
    )
  ) {
    return reject('note-height-map-changed');
  }
  const currentSeparatorSpacingBefore = resolveSeparatorSpacingBefore(
    currentRangesByNoteId,
    new Map(prepared.currentNoteMeasures),
    prepared.footnotes.separatorSpacingBefore,
    DEFAULT_FOOTNOTE_SEPARATOR_SPACING_BEFORE,
  );
  if (currentSeparatorSpacingBefore !== prepared.warmSeed.separatorSpacingBefore) {
    return reject('separator-spacing-changed');
  }

  const notePageIndexes = prepared.warmSeed.notePageIndexes;
  if (
    !Array.isArray(notePageIndexes) ||
    notePageIndexes.length === 0 ||
    new Set(notePageIndexes).size !== notePageIndexes.length ||
    notePageIndexes.some(
      (pageIndex) => !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= input.previousLayout.pages.length,
    )
  ) {
    return reject('retained-note-page-index-invalid');
  }
  const refreshedBlockIds = new Set(
    proof.noteIds.flatMap((noteId) => (prepared.footnotes.blocksById.get(noteId) ?? []).map((block) => block.id)),
  );
  const affectedPageIndexes = notePageIndexes.filter((pageIndex) => {
    const page = input.previousLayout.pages[pageIndex];
    if (!page) return false;
    if (page.fragments.some((fragment) => refreshedBlockIds.has(fragment.blockId))) return true;
    const ledger = page.footnoteLedger;
    return (
      ledger != null &&
      (ledger.anchorIds.some((noteId) => refreshedNoteIds.has(noteId)) ||
        ledger.continuationIn.some((entry) => refreshedNoteIds.has(entry.id)) ||
        ledger.continuationOut.some((entry) => refreshedNoteIds.has(entry.id)))
    );
  });
  if (affectedPageIndexes.length === 0) return reject('affected-note-page-not-found');
  const firstAffectedPageIndex = Math.min(...affectedPageIndexes);
  const lastAffectedPageIndex = Math.max(...affectedPageIndexes);
  const tailStartPageIndex = lastAffectedPageIndex + 1;
  if (tailStartPageIndex >= input.previousLayout.pages.length) return reject('stable-tail-unavailable');

  const replacements = new Map<number, Page>();
  for (let pageIndex = firstAffectedPageIndex; pageIndex <= lastAffectedPageIndex; pageIndex += 1) {
    const page = input.previousLayout.pages[pageIndex];
    if (!page) return reject(`affected-page-missing:${pageIndex}`);
    replacements.set(pageIndex, materializeAdoptedLayoutPage(page, [], 0));
  }
  const extraPlane = buildProvedNoteOnlyExtraPlane({
    layout: input.previousLayout,
    notePageIndexes,
    currentNoteBlocks,
    currentNoteMeasures: prepared.currentNoteMeasures,
  });
  if (!extraPlane) return reject('current-note-extra-plane-invalid');

  const pages = createPageSequenceWithReplacements(input.previousLayout.pages, replacements);
  return {
    layout: { ...input.previousLayout, pages },
    reuse: {
      mode: 'tail-splice',
      reason: 'm4-note-only-geometry-stable-tail-adopted',
      tailDisposition: 'adopted-source-tail',
      checkpointPageIndex: firstAffectedPageIndex,
      affectedFrontierPageIndex: lastAffectedPageIndex,
      sourceAffectedFrontierPageIndex: lastAffectedPageIndex,
      convergencePageIndex: tailStartPageIndex,
      sourceConvergencePageIndex: tailStartPageIndex,
      pagesPaginated: 0,
      pagesSplicedByReuse: input.previousLayout.pages.length - tailStartPageIndex,
      tailAdoption: {
        startPageIndex: tailStartPageIndex,
        endPageIndexExclusive: input.previousLayout.pages.length,
        sourcePageStartIndex: tailStartPageIndex,
        sourcePageEndIndexExclusive: input.previousLayout.pages.length,
        pageIndexDelta: 0,
        sectionPageNumberTransform: null,
        pageReferenceLocationsStable: true,
        sourceLayoutEpoch: input.previousLayout.layoutEpoch ?? null,
        positionTransforms: [],
        blockIdRewrites: null,
      },
    },
    provedNoteOnlyFinalization: {
      extraBlocks: extraPlane.blocks,
      extraMeasures: extraPlane.measures,
      footnoteReserveSeed: {
        ...prepared.warmSeed,
        reserves: prepared.warmSeed.reserves.slice(),
        notePageIndexes: notePageIndexes.slice(),
        noteBlocksByBlockId: new Map(currentNoteBlocks.map((block) => [block.id, block])),
        noteMeasuresByBlockId: new Map(prepared.currentNoteMeasures),
        noteBodyHeightById: new Map(currentHeights.totalMap),
        noteFirstLineHeightById: new Map(currentHeights.firstLineMap),
      },
    },
  };
}

function areFootnoteRangesLayoutEquivalent(
  retained: readonly FootnoteRange[],
  current: readonly FootnoteRange[],
): boolean {
  if (retained.length !== current.length) return false;
  return retained.every((left, index) => {
    const right = current[index];
    if (!right || left.kind !== right.kind || left.blockId !== right.blockId || left.height !== right.height) {
      return false;
    }
    if (left.kind === 'paragraph' && right.kind === 'paragraph') {
      return (
        left.fromLine === right.fromLine &&
        left.toLine === right.toLine &&
        left.totalLines === right.totalLines &&
        left.spacingAfter === right.spacingAfter
      );
    }
    if (left.kind === 'list-item' && right.kind === 'list-item') {
      return (
        left.itemId === right.itemId &&
        left.fromLine === right.fromLine &&
        left.toLine === right.toLine &&
        left.totalLines === right.totalLines &&
        left.spacingAfter === right.spacingAfter
      );
    }
    return left.kind !== 'paragraph' && left.kind !== 'list-item';
  });
}

function areChangedFootnoteBlockFramesEquivalent(
  retainedBlock: FlowBlock,
  currentBlock: FlowBlock,
  retainedMeasure: Measure,
  currentMeasure: Measure,
): boolean {
  // The note-only fast path intentionally starts with the ordinary typing
  // shape. Other note block kinds keep the canonical planner until their
  // complete fragment-frame inputs have an equally explicit proof.
  if (
    retainedBlock.kind !== 'paragraph' ||
    currentBlock.kind !== 'paragraph' ||
    retainedMeasure.kind !== 'paragraph' ||
    currentMeasure.kind !== 'paragraph'
  ) {
    return false;
  }
  const retainedMarker = retainedMeasure.marker;
  const currentMarker = currentMeasure.marker;
  return (
    retainedMarker?.markerWidth === currentMarker?.markerWidth &&
    retainedMarker?.markerTextWidth === currentMarker?.markerTextWidth &&
    retainedMarker?.gutterWidth === currentMarker?.gutterWidth
  );
}

function buildProvedNoteOnlyExtraPlane(input: {
  layout: Layout;
  notePageIndexes: readonly number[];
  currentNoteBlocks: readonly FlowBlock[];
  currentNoteMeasures: ReadonlyMap<string, Measure>;
}): { blocks: FlowBlock[]; measures: Measure[] } | null {
  const blocks = [...input.currentNoteBlocks];
  const measures: Measure[] = [];
  for (const block of blocks) {
    const measure = input.currentNoteMeasures.get(block.id);
    if (!measure) return null;
    measures.push(measure);
  }
  const seenSeparatorIds = new Set<string>();
  for (const pageIndex of input.notePageIndexes) {
    const page = input.layout.pages[pageIndex];
    if (!page) return null;
    for (const fragment of page.fragments) {
      if (
        fragment.kind !== 'drawing' ||
        (!fragment.blockId.startsWith('footnote-separator-page-') &&
          !fragment.blockId.startsWith('footnote-continuation-separator-page-'))
      ) {
        continue;
      }
      if (seenSeparatorIds.has(fragment.blockId)) continue;
      if (
        fragment.drawingKind !== 'vectorShape' ||
        !Number.isFinite(fragment.width) ||
        fragment.width <= 0 ||
        !Number.isFinite(fragment.height) ||
        fragment.height <= 0
      ) {
        return null;
      }
      seenSeparatorIds.add(fragment.blockId);
      blocks.push({
        kind: 'drawing',
        id: fragment.blockId,
        drawingKind: 'vectorShape',
        geometry: { width: fragment.width, height: fragment.height },
        shapeKind: 'rect',
        fillColor: '#000000',
        strokeColor: null,
        strokeWidth: 0,
      });
      measures.push({
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: fragment.width,
        height: fragment.height,
        scale: 1,
        naturalWidth: fragment.width,
        naturalHeight: fragment.height,
        geometry: { width: fragment.width, height: fragment.height },
      });
    }
  }
  return { blocks, measures };
}

async function layoutWithOptionalReuse(input: {
  previousBlocks: readonly FlowBlock[];
  blocks: FlowBlock[];
  measures: Measure[];
  options: LayoutOptions;
  dirty: ReturnType<typeof computeDirtyRegions>;
  stableBlockIds: ReadonlySet<string>;
  reuse?: IncrementalLayoutReuseOptions;
  preparedNoteOnly?: PreparedNoteOnlyLayoutReuse;
  preparedHeaderFooterOnly?: PreparedHeaderFooterOnlyLayoutReuse;
  timing: { layoutDocumentMs: number; layoutDocumentCalls: number };
  execution?: LayoutExecutionControl;
}): Promise<{
  layout: Layout;
  reuse: IncrementalLayoutReuseSummary;
  provedNoteOnlyFinalization?: ProvedNoteOnlyLayoutFinalization;
}> {
  let noteOnlyRejectionReason: string | null = null;
  let headerFooterOnlyRejectionReason: string | null = null;
  const runLayoutDocument = async (
    blocks: FlowBlock[],
    measures: Measure[],
    options: LayoutOptions,
  ): Promise<Layout> => {
    const startedAt = performance.now();
    input.timing.layoutDocumentCalls += 1;
    try {
      return input.execution
        ? await layoutDocumentCooperatively(blocks, measures, options, input.execution)
        : layoutDocument(blocks, measures, options);
    } finally {
      input.timing.layoutDocumentMs += performance.now() - startedAt;
    }
  };
  const withSpecializedRejections = (reason: string): string =>
    [
      reason,
      ...(noteOnlyRejectionReason == null ? [] : [`note-only=${noteOnlyRejectionReason}`]),
      ...(headerFooterOnlyRejectionReason == null ? [] : [`header-footer-only=${headerFooterOnlyRejectionReason}`]),
    ].join(';');
  const full = async (reason: string): Promise<{ layout: Layout; reuse: IncrementalLayoutReuseSummary }> => ({
    layout: await runLayoutDocument(input.blocks, input.measures, input.options),
    reuse: {
      mode: 'full',
      reason: withSpecializedRejections(reason),
      tailDisposition: 'none',
      checkpointPageIndex: null,
      affectedFrontierPageIndex: null,
      sourceAffectedFrontierPageIndex: null,
      convergencePageIndex: null,
      sourceConvergencePageIndex: null,
      pagesPaginated: null,
      pagesSplicedByReuse: 0,
      tailAdoption: null,
    },
  });

  const previousLayout = input.reuse?.previousLayout;
  const previousPages = previousLayout?.pages;
  if (!previousLayout || !Array.isArray(previousPages) || previousPages.length === 0) {
    return full('m5-layout-reuse-unavailable-no-previous-layout');
  }
  const reuse = input.reuse;
  if (!reuse?.previousBlockPageIndex || !reuse.previousPageStartKeys) {
    return full('m5-layout-reuse-unavailable-retained-page-metadata-missing');
  }
  if (!Number.isFinite(previousLayout.layoutEpoch)) {
    return full('m4-layout-reuse-disabled-source-layout-epoch-missing');
  }
  if (reuse.retainedMetadataSourceLayoutEpoch !== previousLayout.layoutEpoch) {
    return full('m4-layout-reuse-disabled-retained-metadata-epoch-mismatch');
  }
  if (reuse.previousPageStartKeys.length !== previousPages.length) {
    return full('m4-layout-reuse-invalid-retained-page-key-count');
  }
  const provedHeaderFooterOnlyResult = reuse.provedHeaderFooterOnlyRefresh
    ? tryBuildProvedHeaderFooterOnlyLayoutReuse({
        previousLayout,
        previousBlocks: input.previousBlocks,
        currentBlocks: input.blocks,
        reuse,
        prepared: input.preparedHeaderFooterOnly ?? null,
        onReject: (reason) => {
          headerFooterOnlyRejectionReason = reason;
        },
      })
    : null;
  if (provedHeaderFooterOnlyResult) return provedHeaderFooterOnlyResult;
  const warmProofFailure = validateProvedWarmPaginationInputs(reuse, input.blocks, input.dirty);
  if (warmProofFailure) return full(`m4-layout-reuse-disabled-${warmProofFailure}`);
  const unsupportedDependency = reuse.dependencyProof
    ? validateIncrementalPaginationProof(reuse.dependencyProof)
    : 'dependency-proof-missing';
  if (unsupportedDependency) {
    return full(`m4-layout-reuse-disabled-${unsupportedDependency}`);
  }
  const admittedCheckpointDependencies =
    reuse.dependencyProof?.profile === 'page-checkpoint-local-text'
      ? reuse.dependencyProof.admittedDependencyClasses
      : null;
  const footnoteDependencyInput = isFootnotesLayoutInput(input.options.footnotes) ? input.options.footnotes : null;
  // The page-checkpoint class list is a proof boundary, not descriptive
  // telemetry. When the bridge can observe a dependency directly without a
  // broad scan, reject a producer that omitted it instead of silently
  // trusting an incomplete packet. Other dependency classes remain owned by
  // their typed producer sidecars because discovering them here would require
  // whole-document work on every edit.
  if (
    admittedCheckpointDependencies &&
    footnoteDependencyInput &&
    footnoteDependencyInput.refs.length > 0 &&
    footnoteDependencyInput.blocksById.size > 0 &&
    !admittedCheckpointDependencies.includes('footnotes')
  ) {
    return full('m4-layout-reuse-disabled-footnote-dependency-class-missing');
  }
  const footnoteFinalizerFragmentsAreExternal =
    footnoteDependencyInput != null &&
    (reuse.dependencyProof?.profile === 'document-start-local-text' ||
      (reuse.dependencyProof?.profile === 'page-checkpoint-local-text' &&
        reuse.dependencyProof.admittedDependencyClasses.includes('footnotes')));
  if (reuse.dependencyProof?.profile === 'document-start-local-text' && reuse.requireDocumentStartCheckpoint !== true) {
    return full('m4-layout-reuse-disabled-document-start-checkpoint-required');
  }
  const previousPageStartKeys = reuse.previousPageStartKeys;
  const previousPageStartKeyIndex = reuse.previousPageStartKeyIndex ?? buildPageStartKeyIndex(previousPageStartKeys);
  const hasBlockCountChange = input.dirty.insertedBlockIds.length > 0 || input.dirty.deletedBlockIds.length > 0;
  if (hasBlockCountChange) {
    const oneSplit = input.dirty.insertedBlockIds.length === 1 && input.dirty.deletedBlockIds.length === 0;
    const oneMerge = input.dirty.insertedBlockIds.length === 0 && input.dirty.deletedBlockIds.length === 1;
    if (
      reuse.allowBlockIdChurn !== true ||
      (!oneSplit && !oneMerge) ||
      !reuse.previousBlockIndexById ||
      !reuse.blockIdRewrites
    ) {
      return full('m5-layout-reuse-disabled-block-insert-delete');
    }
  }
  if (input.dirty.firstDirtyIndex >= input.blocks.length) {
    return full('m5-layout-reuse-disabled-no-dirty-block');
  }

  if (reuse.dirtyBlockIds && !haveExactUniqueIdSet(reuse.dirtyBlockIds, input.dirty.changedBlockIds)) {
    return full('m4-layout-reuse-disabled-dirty-block-set-mismatch');
  }
  const dirtyBlockIds = [...(reuse.dirtyBlockIds ?? input.dirty.changedBlockIds)];
  if (dirtyBlockIds.length === 0) {
    return full('m4-layout-reuse-disabled-dirty-set-empty');
  }
  const pageRelativeAnchorProofFailure = validateNonFlowingPageRelativeAnchorDependency({
    proof: reuse.dependencyProof,
    previousLayout,
    blocks: input.blocks,
    currentBlockIndexById: reuse.currentBlockIndexById,
    previousBlockPageIndex: reuse.previousBlockPageIndex,
    blockIdRewrites: reuse.blockIdRewrites,
    dirtyBlockIds,
  });
  if (pageRelativeAnchorProofFailure) {
    return full(`m4-layout-reuse-disabled-${pageRelativeAnchorProofFailure}`);
  }
  if (
    admittedCheckpointDependencies &&
    !admittedCheckpointDependencies.includes('tables') &&
    dirtyBlockIds.some((blockId) => {
      const blockIndex = reuse.currentBlockIndexById?.get(blockId);
      return Number.isInteger(blockIndex) && input.blocks[blockIndex!]?.kind === 'table';
    })
  ) {
    return full('m4-layout-reuse-disabled-table-dependency-class-missing');
  }
  const provedNoteOnlyResult = reuse.provedNoteOnlyRefresh
    ? tryBuildProvedNoteOnlyLayoutReuse({
        previousLayout,
        previousBlocks: input.previousBlocks,
        currentBlocks: input.blocks,
        dirtyBlockIds,
        reuse,
        prepared: input.preparedNoteOnly ?? null,
        onReject: (reason) => {
          noteOnlyRejectionReason = reason;
        },
      })
    : null;
  if (provedNoteOnlyResult) return provedNoteOnlyResult;
  let earliestDirtyPage = Number.POSITIVE_INFINITY;
  let sourceAffectedFrontierPageIndex = -1;
  const dirtyPageRanges: Array<{ blockId: string; firstPage: number; lastPage: number }> = [];
  for (const blockId of dirtyBlockIds) {
    const previousBlockId = reuse.blockIdRewrites?.currentToPrevious.get(blockId) ?? blockId;
    const pageRange = reuse.previousBlockPageIndex.get(previousBlockId);
    if (!pageRange) {
      if (input.dirty.insertedBlockIds.includes(blockId)) continue;
      return full('m4-layout-reuse-unavailable-dirty-page-range-not-found');
    }
    if (
      !Number.isInteger(pageRange.firstPage) ||
      !Number.isInteger(pageRange.lastPage) ||
      pageRange.firstPage < 0 ||
      pageRange.lastPage < pageRange.firstPage ||
      pageRange.lastPage >= previousPages.length ||
      !pageContainsBlock(previousPages[pageRange.firstPage], previousBlockId) ||
      !pageContainsBlock(previousPages[pageRange.lastPage], previousBlockId)
    ) {
      return full('m4-layout-reuse-disabled-stale-dirty-page-range');
    }
    const currentBlockIndex = reuse.currentBlockIndexById?.get(blockId);
    if (
      reuse.currentBlockIndexById &&
      (!Number.isInteger(currentBlockIndex) || input.blocks[currentBlockIndex!]?.id !== blockId)
    ) {
      // Named diagnostic detail (id/index only, no content): the admission
      // certification needs to see WHICH identity diverged between the
      // retained index and the composed block plane.
      return full(
        `m4-layout-reuse-disabled-current-block-index-stale:dirty=${blockId}@${String(currentBlockIndex)} saw=${String(input.blocks[currentBlockIndex ?? -1]?.id)} blocks=${input.blocks.length} indexed=${reuse.currentBlockIndexById.size}`,
      );
    }
    dirtyPageRanges.push({ blockId, firstPage: pageRange.firstPage, lastPage: pageRange.lastPage });
    earliestDirtyPage = Math.min(earliestDirtyPage, pageRange.firstPage);
    sourceAffectedFrontierPageIndex = Math.max(sourceAffectedFrontierPageIndex, pageRange.lastPage);
  }
  for (const deletedBlockId of input.dirty.deletedBlockIds) {
    const pageRange = reuse.previousBlockPageIndex.get(deletedBlockId);
    if (
      !pageRange ||
      !Number.isInteger(pageRange.firstPage) ||
      !Number.isInteger(pageRange.lastPage) ||
      pageRange.firstPage < 0 ||
      pageRange.lastPage < pageRange.firstPage ||
      pageRange.lastPage >= previousPages.length ||
      !pageContainsBlock(previousPages[pageRange.firstPage], deletedBlockId) ||
      !pageContainsBlock(previousPages[pageRange.lastPage], deletedBlockId)
    ) {
      return full('m4-layout-reuse-unavailable-deleted-page-range-not-found');
    }
    dirtyPageRanges.push({ blockId: deletedBlockId, firstPage: pageRange.firstPage, lastPage: pageRange.lastPage });
    earliestDirtyPage = Math.min(earliestDirtyPage, pageRange.firstPage);
    sourceAffectedFrontierPageIndex = Math.max(sourceAffectedFrontierPageIndex, pageRange.lastPage);
  }
  if (!Number.isFinite(earliestDirtyPage) || sourceAffectedFrontierPageIndex < 0) {
    return full('m4-layout-reuse-unavailable-dirty-page-range-not-found');
  }
  let affectedFrontierPageIndex = earliestDirtyPage;
  const dirtyPage = reuse.requireDocumentStartCheckpoint === true ? 0 : earliestDirtyPage;
  if (dirtyPage == null || dirtyPage < 0 || dirtyPage >= previousPages.length) {
    return full('m5-layout-reuse-unavailable-dirty-page-not-found');
  }

  const partialPageCheckpointResult =
    reuse.requireDocumentStartCheckpoint !== true &&
    dirtyBlockIds.length === 1 &&
    input.dirty.insertedBlockIds.length === 0
      ? findSafePartialPageCheckpoint({
          layout: previousLayout,
          pages: previousPages,
          previousBlockId: reuse.blockIdRewrites?.currentToPrevious.get(dirtyBlockIds[0]!) ?? dirtyBlockIds[0]!,
          currentBlockId: dirtyBlockIds[0]!,
          currentBlockIndexById: reuse.currentBlockIndexById!,
          blocks: input.blocks,
          expectedPageIndex: earliestDirtyPage,
          stableBlockIds: input.stableBlockIds,
          previousToCurrentBlockId: reuse.blockIdRewrites?.previousToCurrent ?? null,
        })
      : { ok: false as const, reason: 'profile-or-dirty-shape-ineligible' };
  const partialPageCheckpoint = partialPageCheckpointResult.ok ? partialPageCheckpointResult : null;
  const partialPageCheckpointRejection = partialPageCheckpointResult.ok ? null : partialPageCheckpointResult.reason;
  let checkpointPageIndex =
    partialPageCheckpoint?.checkpoint.pageIndex ?? (reuse.requireDocumentStartCheckpoint === true ? 0 : dirtyPage);
  if (!partialPageCheckpoint) {
    while (checkpointPageIndex > 0 && !pageStartsAtCleanBlockBoundary(previousPages[checkpointPageIndex])) {
      checkpointPageIndex -= 1;
    }
  }
  const checkpointPage = previousPages[checkpointPageIndex];
  if (!checkpointPage || (!partialPageCheckpoint && !pageStartsAtCleanBlockBoundary(checkpointPage))) {
    return full('m5-layout-reuse-unavailable-clean-checkpoint-not-found');
  }
  if (dirtyPageRanges.some((pageRange) => pageRange.firstPage < checkpointPageIndex)) {
    return full('m4-layout-reuse-disabled-dirty-block-in-retained-prefix');
  }
  const suffixStartBlockId =
    partialPageCheckpoint?.previousBlockId ?? (checkpointPageIndex === 0 ? null : readFirstPageBlockId(checkpointPage));
  const currentSuffixStartBlockId =
    suffixStartBlockId == null
      ? null
      : (reuse.blockIdRewrites?.previousToCurrent.get(suffixStartBlockId) ?? suffixStartBlockId);
  const suffixStartBlockIndex =
    // A suffix-start BLOCK ID always wins: a PARTIAL (mid-page) checkpoint on
    // page zero resumes at the checkpoint's own paragraph boundary, not at
    // document start. Only a null id — the clean page-zero checkpoint whose
    // suffix genuinely is the whole document — maps to index 0. The previous
    // `checkpointPageIndex === 0 → 0` shortcut mislabeled every page-zero
    // partial checkpoint as `current-block-index-stale` and fell to full
    // layout (observed as the alkuri/nvca first-target admission failures).
    currentSuffixStartBlockId != null
      ? (reuse.currentBlockIndexById?.get(currentSuffixStartBlockId) ??
        input.blocks.findIndex((block) => block.id === currentSuffixStartBlockId))
      : checkpointPageIndex === 0
        ? 0
        : -1;
  if (suffixStartBlockIndex < 0) {
    return full('m5-layout-reuse-unavailable-checkpoint-block-not-found');
  }
  if (currentSuffixStartBlockId != null && input.blocks[suffixStartBlockIndex]?.id !== currentSuffixStartBlockId) {
    return full(
      `m4-layout-reuse-disabled-current-block-index-stale:suffix=${currentSuffixStartBlockId}@${suffixStartBlockIndex} saw=${String(input.blocks[suffixStartBlockIndex]?.id)} blocks=${input.blocks.length}`,
    );
  }

  // `maxRelaidPages` is the first locality probe, not a correctness horizon.
  // A finalized page can miss convergence just beyond that probe (for
  // example, when one inserted line shifts a long paragraph or table
  // continuation). Expand inside this bridge call until an exact retained-tail
  // boundary is proved or the exact current suffix is freshly paginated. No
  // intermediate probe escapes to resolve or paint.
  const initialRelaidPageHorizon = Number.isFinite(reuse.maxRelaidPages)
    ? Math.max(1, Math.floor(reuse.maxRelaidPages!))
    : 3;
  let convergenceProbePageHorizon = initialRelaidPageHorizon;
  let reuseProbePagesPaginated = 0;

  while (true) {
    const maxRelaidPages = convergenceProbePageHorizon;
    affectedFrontierPageIndex = earliestDirtyPage;
    const reachesSourceTail = sourceAffectedFrontierPageIndex + maxRelaidPages + 2 >= previousPages.length - 1;
    const boundedLocalEndBlockIndexExclusive = findLocalPaginationEndBlockIndexExclusive({
      blocks: input.blocks,
      previousPages,
      currentBlockIndexById: reuse.currentBlockIndexById!,
      suffixStartBlockIndex,
      sourceAffectedFrontierPageIndex,
      maxRelaidPages,
      previousToCurrentBlockId: reuse.blockIdRewrites?.previousToCurrent ?? null,
      deletedBlockIds: new Set(input.dirty.deletedBlockIds),
      ignoreUnindexedFootnoteFragments: footnoteFinalizerFragmentsAreExternal,
    });
    if (boundedLocalEndBlockIndexExclusive == null) {
      return full('m4-layout-reuse-disabled-local-pagination-boundary-not-found');
    }
    // Once the source horizon reaches the retained tail, include every current
    // block. This covers inserted terminal blocks and trailing non-rendering
    // section carriers that have no retained fragment index.
    const localEndBlockIndexExclusive = reachesSourceTail ? input.blocks.length : boundedLocalEndBlockIndexExclusive;
    // Non-terminal probes paginate a bounded source segment only. Passing the
    // complete suffix would run section/anchor/keep prepasses over the untouched
    // tail even when convergence is local.
    const suffixBlocks = input.blocks.slice(suffixStartBlockIndex, localEndBlockIndexExclusive);
    const suffixMeasures = input.measures.slice(suffixStartBlockIndex, localEndBlockIndexExclusive);
    if (suffixBlocks.length === 0 || suffixBlocks.length !== suffixMeasures.length) {
      return full('m5-layout-reuse-unavailable-suffix-alignment-mismatch');
    }

    const activePageCounter = readFiniteNumber(checkpointPage.displayNumber) ?? checkpointPageIndex + 1;
    const activeSectionIndex = readFiniteNumber(checkpointPage.sectionIndex) ?? 0;
    let activeSectionFirstPageIndex = checkpointPageIndex;
    while (
      activeSectionFirstPageIndex > 0 &&
      (previousPages[activeSectionFirstPageIndex - 1]?.sectionIndex ?? 0) === activeSectionIndex
    ) {
      activeSectionFirstPageIndex -= 1;
    }
    // SD-3772 D2: a nonzero checkpoint must carry a complete, validated
    // geometry seed, passed through `startContext` so the ACTIVE section state
    // is restored while `options.margins`/`pageSize`/`columns` stay the
    // document defaults — later section breaks with missing fields then fall
    // back exactly like a cold run. Base top/bottom come exclusively from the
    // cold page's stamped `baseMargins`: the effective `margins.top/bottom`
    // are already header/footer-inflated and seeding a resumed section base
    // from them would let `layoutDocument()` inflate the values a second time.
    // An old or incomplete retained page (missing any of these) takes a named
    // full fallback and is reseeded by that cold pass. A CLEAN zero checkpoint
    // replays the document start, where the leading section blocks establish
    // the exact state. A PARTIAL zero checkpoint starts after those blocks, so
    // it must carry the stamped page geometry just like a nonzero checkpoint.
    type ActiveGeometrySeed = Pick<
      NonNullable<LayoutOptions['startContext']>,
      | 'activeSectionBaseMargins'
      | 'activeSectionSideMargins'
      | 'activeHeaderFooterDistances'
      | 'activePageSize'
      | 'activeColumns'
    >;
    let activeGeometrySeed: ActiveGeometrySeed = {};
    if (checkpointPageIndex > 0 || partialPageCheckpoint) {
      const checkpointBaseTop = readFiniteNumber(checkpointPage.baseMargins?.top);
      const checkpointBaseBottom = readFiniteNumber(checkpointPage.baseMargins?.bottom);
      if (checkpointBaseTop == null || checkpointBaseBottom == null) {
        return full('m4-layout-reuse-disabled-checkpoint-base-margins-missing');
      }
      const checkpointLeft = readFiniteNumber(checkpointPage.margins?.left);
      const checkpointRight = readFiniteNumber(checkpointPage.margins?.right);
      const checkpointHeaderDistance = readFiniteNumber(checkpointPage.margins?.header);
      const checkpointFooterDistance = readFiniteNumber(checkpointPage.margins?.footer);
      if (
        checkpointLeft == null ||
        checkpointRight == null ||
        checkpointHeaderDistance == null ||
        checkpointFooterDistance == null
      ) {
        return full('m4-layout-reuse-disabled-checkpoint-margin-state-incomplete');
      }
      activeGeometrySeed = {
        activeSectionBaseMargins: { top: checkpointBaseTop, bottom: checkpointBaseBottom },
        activeSectionSideMargins: { left: checkpointLeft, right: checkpointRight },
        activeHeaderFooterDistances: { header: checkpointHeaderDistance, footer: checkpointFooterDistance },
        ...(checkpointPage.size ? { activePageSize: checkpointPage.size } : {}),
        // Absent page columns mean the boundary was single-column; seed that
        // explicitly rather than falling back to a caller-level multi-column
        // default the checkpoint page never used.
        activeColumns: checkpointPage.columns ?? { count: 1, gap: 0 },
      };
    }
    let convergencePageIndex: number | null = null;
    let sourceConvergencePageIndex: number | null = null;
    let convergenceSectionPageNumberTransform: IncrementalSectionPageNumberTransform | null = null;
    let convergenceDisplayPageNumberTransform: IncrementalDisplayPageNumberTransform | null = null;
    let checkpointConvergenceRejection = partialPageCheckpoint
      ? 'partial-page-no-candidate-evaluated'
      : `partial-page-${partialPageCheckpointRejection ?? 'unavailable'}`;
    const usesFullNumberingFinalizer = !supportsLocalizedDecimalNumbering(input.options);
    const suffixFootnoteReserves = Array.isArray(input.options.footnoteReservedByPageIndex)
      ? input.options.footnoteReservedByPageIndex.slice(checkpointPageIndex)
      : undefined;
    const localPaginationPageCap =
      reuse.dependencyProof?.profile === 'page-checkpoint-local-text'
        ? Math.max(6, sourceAffectedFrontierPageIndex - checkpointPageIndex + maxRelaidPages + 2)
        : Math.max(4, sourceAffectedFrontierPageIndex - checkpointPageIndex + maxRelaidPages + 1);
    const suffixFootnotesInput = isFootnotesLayoutInput(input.options.footnotes)
      ? (() => {
          const suffixBlockIds = new Set(suffixBlocks.map((block) => block.id));
          if (input.options.footnotes!.refs.some((reference) => typeof reference.blockId !== 'string')) return null;
          return {
            ...input.options.footnotes!,
            refs: input.options.footnotes!.refs.filter((reference) => suffixBlockIds.has(reference.blockId!)),
          };
        })()
      : undefined;
    if (isFootnotesLayoutInput(input.options.footnotes) && suffixFootnotesInput == null) {
      return full('m4-layout-reuse-disabled-footnote-reference-block-id-missing');
    }
    const suffixLayoutOptions: LayoutOptions = {
      ...input.options,
      ...(suffixFootnoteReserves ? { footnoteReservedByPageIndex: suffixFootnoteReserves } : {}),
      ...(suffixFootnotesInput ? { footnotes: suffixFootnotesInput } : {}),
      startContext: {
        pageNumberOffset: checkpointPageIndex,
        activePageCounter,
        activeSectionIndex,
        activeSectionFirstPageNumber: activeSectionFirstPageIndex + 1,
        ...(checkpointPage.sectionRefs ? { activeSectionRefs: checkpointPage.sectionRefs } : {}),
        ...(checkpointPage.orientation ? { activeOrientation: checkpointPage.orientation } : {}),
        ...activeGeometrySeed,
        ...(partialPageCheckpoint
          ? {
              initialPageState: {
                prefixFragments: partialPageCheckpoint.prefixFragments,
                cursorY: partialPageCheckpoint.checkpoint.cursorY,
                maxCursorY: partialPageCheckpoint.checkpoint.maxCursorY,
                columnIndex: partialPageCheckpoint.checkpoint.columnIndex,
                trailingSpacing: partialPageCheckpoint.checkpoint.trailingSpacing,
                ...(partialPageCheckpoint.checkpoint.lastParagraphStyleId
                  ? { lastParagraphStyleId: partialPageCheckpoint.checkpoint.lastParagraphStyleId }
                  : {}),
                lastParagraphContextualSpacing: partialPageCheckpoint.checkpoint.lastParagraphContextualSpacing,
                ...(partialPageCheckpoint.checkpoint.lastParagraphBorderHash
                  ? { lastParagraphBorderHash: partialPageCheckpoint.checkpoint.lastParagraphBorderHash }
                  : {}),
                constraintBoundaries: partialPageCheckpoint.checkpoint.constraintBoundaries,
                activeConstraintIndex: partialPageCheckpoint.checkpoint.activeConstraintIndex,
                footnoteDemandThisPage: partialPageCheckpoint.checkpoint.footnoteDemandThisPage,
                footnoteRefsThisPage: partialPageCheckpoint.checkpoint.footnoteRefsThisPage,
                footnoteAnchorsThisPage: partialPageCheckpoint.checkpoint.footnoteAnchorsThisPage,
              },
            }
          : {}),
      },
      // Finalized convergence is evaluated only after layoutDocument returns:
      // column/region finalizers have not run inside the paginator callback. A
      // non-terminal probe keeps an engine-owned hard fence. Once every current
      // block is present, paginate the suffix to completion so the document-end
      // proof is exact.
      ...(localEndBlockIndexExclusive < input.blocks.length
        ? {
            pageBoundary: {
              shouldStopBeforeNewPage: ({ completedPageIndex }: { completedPageIndex: number }) =>
                completedPageIndex + 1 >= localPaginationPageCap,
            },
          }
        : {}),
    };
    if (localEndBlockIndexExclusive === input.blocks.length) {
      // A caller boundary is valid for a cold range layout, but it cannot survive
      // into the exact terminal proof: this probe must consume the complete
      // current suffix before claiming document end.
      delete suffixLayoutOptions.pageBoundary;
    }
    const suffixLayout = await runLayoutDocument(suffixBlocks, suffixMeasures, suffixLayoutOptions);
    reuseProbePagesPaginated += suffixLayout.pages.length;

    for (let completedPageIndex = 0; completedPageIndex < suffixLayout.pages.length; completedPageIndex += 1) {
      const completedPage = suffixLayout.pages[completedPageIndex];
      if (pageContainsAnyBlock(completedPage, dirtyBlockIds)) {
        affectedFrontierPageIndex = Math.max(affectedFrontierPageIndex, checkpointPageIndex + completedPageIndex);
      }
    }
    for (let completedPageIndex = 0; completedPageIndex < suffixLayout.pages.length; completedPageIndex += 1) {
      const targetPageIndex = checkpointPageIndex + completedPageIndex;
      const completedPage = suffixLayout.pages[completedPageIndex];
      const withinConvergenceBudget = targetPageIndex - affectedFrontierPageIndex <= maxRelaidPages;
      if (targetPageIndex < affectedFrontierPageIndex || !withinConvergenceBudget) continue;
      if (
        !pageContainsOnlyStableBlocks(
          completedPage,
          input.stableBlockIds,
          null,
          footnoteFinalizerFragmentsAreExternal ? (reuse.currentBlockIndexById ?? null) : null,
        )
      ) {
        checkpointConvergenceRejection = `target-${targetPageIndex}-contains-unstable-block`;
        continue;
      }

      const candidateKey = buildPageStartKey(completedPage, reuse.blockIdRewrites?.currentToPrevious ?? null);
      let sourceCandidates = previousPageStartKeyIndex.get(candidateKey) ?? [];
      if (sourceCandidates.length === 0) {
        // Bounded fallback for WINDOWED retained planes: the retained
        // block→page index may only cover materialized window pages, so the
        // key index can miss even though the source page exists. Convergence
        // only ever considers sources inside the budgeted window — read those
        // start keys directly (≤ maxRelaidPages + 3 lazy page reads, the same
        // bound tail adoption already pays). Every fallback candidate still
        // passes the full downstream proofs (exact start-key equality, stable
        // blocks, numbering rebase) before adoption.
        const scanStart = Math.max(0, sourceAffectedFrontierPageIndex);
        const scanEndExclusive = Math.min(previousPages.length, sourceAffectedFrontierPageIndex + maxRelaidPages + 3);
        const fallback: number[] = [];
        for (let sourcePageIndex = scanStart; sourcePageIndex < scanEndExclusive; sourcePageIndex += 1) {
          if (previousPageStartKeys[sourcePageIndex] === candidateKey) fallback.push(sourcePageIndex);
        }
        sourceCandidates = fallback;
      }
      if (sourceCandidates.length === 0) {
        // Bounded diagnostic: the candidate vs the retained key at the SAME
        // page index — enough to attribute a resume-drift (same block,
        // different fromLine) without dumping the scan window.
        checkpointConvergenceRejection = `target-${targetPageIndex}-page-start-key-missing want=${candidateKey.slice(0, 64)} retainedAtTarget=${String(previousPageStartKeys[targetPageIndex]).slice(0, 64)}`;
        continue;
      }
      const provedCandidates = sourceCandidates.filter((sourcePageIndex) => {
        if (!Number.isInteger(sourcePageIndex) || sourcePageIndex < 0 || sourcePageIndex >= previousPages.length) {
          checkpointConvergenceRejection = `target-${targetPageIndex}-source-index-invalid`;
          return false;
        }
        const sourcePage = previousPages[sourcePageIndex];
        const pageIndexDelta = targetPageIndex - sourcePageIndex;
        const numberingRebaseSafe =
          pageIndexDelta === 0 ||
          usesFullNumberingFinalizer ||
          (supportsLocalizedDecimalNumbering(input.options) &&
            canRebaseAdoptedPageNumbering(sourcePage, pageIndexDelta));
        if (sourcePageIndex < sourceAffectedFrontierPageIndex) {
          checkpointConvergenceRejection = `target-${targetPageIndex}-source-before-frontier`;
          return false;
        }
        if (previousPageStartKeys[sourcePageIndex] !== candidateKey || buildPageStartKey(sourcePage) !== candidateKey) {
          checkpointConvergenceRejection = `target-${targetPageIndex}-source-start-key-stale`;
          return false;
        }
        if (
          !pageContainsOnlyStableBlocks(
            sourcePage,
            input.stableBlockIds,
            reuse.blockIdRewrites?.previousToCurrent ?? null,
            footnoteFinalizerFragmentsAreExternal ? (reuse.currentBlockIndexById ?? null) : null,
          )
        ) {
          checkpointConvergenceRejection = `target-${targetPageIndex}-source-contains-unstable-block`;
          return false;
        }
        if (
          !pagesShareConvergenceBoundary(
            sourcePage,
            completedPage,
            reuse.blockIdRewrites?.currentToPrevious ?? null,
            footnoteFinalizerFragmentsAreExternal,
          )
        ) {
          checkpointConvergenceRejection =
            `target-${targetPageIndex}-finalized-boundary-mismatch-` +
            findPageConvergenceMismatchField(
              sourcePage,
              completedPage,
              reuse.blockIdRewrites?.currentToPrevious ?? null,
              footnoteFinalizerFragmentsAreExternal,
            );
          return false;
        }
        if (!numberingRebaseSafe) {
          checkpointConvergenceRejection = `target-${targetPageIndex}-numbering-rebase-unsafe`;
          return false;
        }
        return true;
      });
      if (provedCandidates.length !== 1) {
        if (provedCandidates.length > 1) {
          checkpointConvergenceRejection = `target-${targetPageIndex}-candidate-ambiguous`;
        }
        continue;
      }
      const sourcePageIndex = provedCandidates[0]!;
      const sourcePage = previousPages[sourcePageIndex]!;
      const sourceSectionIndex = readFiniteNumber(sourcePage.sectionIndex) ?? 0;
      const targetSectionIndex = readFiniteNumber(completedPage.sectionIndex) ?? 0;
      const sourceSectionPageNumber = readFiniteNumber(sourcePage.sectionPageNumber);
      const targetSectionPageNumber = readFiniteNumber(completedPage.sectionPageNumber);
      const sourceDisplayPageNumber = readFiniteNumber(sourcePage.displayNumber);
      const targetDisplayPageNumber = readFiniteNumber(completedPage.displayNumber);
      const pageIndexDelta = targetPageIndex - sourcePageIndex;
      if (
        sourceSectionIndex !== targetSectionIndex ||
        sourceSectionPageNumber == null ||
        targetSectionPageNumber == null ||
        !Number.isInteger(sourceSectionPageNumber) ||
        !Number.isInteger(targetSectionPageNumber) ||
        sourceSectionPageNumber < 1 ||
        targetSectionPageNumber < 1
      ) {
        checkpointConvergenceRejection = `target-${targetPageIndex}-section-page-position-missing-or-invalid`;
        continue;
      }
      const displayPageNumberTransform = buildDisplayPageNumberTransform(
        input.options,
        targetSectionIndex,
        (targetDisplayPageNumber ?? targetSectionPageNumber) - (sourceDisplayPageNumber ?? sourceSectionPageNumber),
      );
      if (pageIndexDelta !== 0 && !usesFullNumberingFinalizer && displayPageNumberTransform == null) {
        checkpointConvergenceRejection = `target-${targetPageIndex}-display-number-transform-unavailable`;
        continue;
      }
      convergencePageIndex = targetPageIndex;
      sourceConvergencePageIndex = sourcePageIndex;
      convergenceSectionPageNumberTransform = {
        sectionIndex: targetSectionIndex,
        delta: targetSectionPageNumber - sourceSectionPageNumber,
      };
      convergenceDisplayPageNumberTransform = displayPageNumberTransform;
      break;
    }

    if (
      convergencePageIndex != null &&
      sourceConvergencePageIndex != null &&
      convergenceSectionPageNumberTransform != null
    ) {
      const relaidPageCount = Math.max(0, convergencePageIndex - checkpointPageIndex);
      // Retain the tail exactly as produced by its source generation. Rewriting
      // every nested pmStart/pmEnd here turns a one-page edit into O(document)
      // work and destroys provenance. The resolve layer materializes a current
      // page lazily from this bounded transform descriptor.
      const positionTransforms = normalizePositionTransforms(reuse.pmShift);
      const pages = createSplicedPageSequence({
        previousPages,
        prefixPageCount: checkpointPageIndex,
        relaidPages: suffixLayout.pages,
        relaidPageCount,
        sourceTailStartPageIndex: sourceConvergencePageIndex,
      });
      const pageIndexDelta = convergencePageIndex - sourceConvergencePageIndex;
      const blockResumeCheckpoints = createSplicedBlockResumeCheckpointMap({
        previous: previousLayout.blockResumeCheckpoints,
        local: suffixLayout.blockResumeCheckpoints,
        checkpointPageIndex,
        relaidPageCount,
        sourceTailStartPageIndex: sourceConvergencePageIndex,
        pageIndexDelta,
        previousToCurrentBlockId: reuse.blockIdRewrites?.previousToCurrent ?? null,
        currentToPreviousBlockId: reuse.blockIdRewrites?.currentToPrevious ?? null,
        positionTransforms,
        suffixStartBlockId: input.blocks[suffixStartBlockIndex]?.id ?? null,
        checkpointPagePrefixFragmentCount: partialPageCheckpoint ? partialPageCheckpoint.prefixFragments.length : null,
      });
      return {
        layout: {
          ...suffixLayout,
          pages,
          columns: previousLayout.columns ?? suffixLayout.columns,
          ...(blockResumeCheckpoints ? { blockResumeCheckpoints } : {}),
        },
        reuse: {
          mode: 'tail-splice',
          reason: withSpecializedRejections('m4-affected-frontier-converged-tail-adopted'),
          tailDisposition: 'adopted-source-tail',
          checkpointPageIndex,
          affectedFrontierPageIndex,
          sourceAffectedFrontierPageIndex,
          convergencePageIndex,
          sourceConvergencePageIndex,
          pagesPaginated: reuseProbePagesPaginated,
          pagesSplicedByReuse: previousPages.length - sourceConvergencePageIndex,
          tailAdoption: {
            startPageIndex: convergencePageIndex,
            endPageIndexExclusive: pages.length,
            sourcePageStartIndex: sourceConvergencePageIndex,
            sourcePageEndIndexExclusive: previousPages.length,
            pageIndexDelta,
            sectionPageNumberTransform: convergenceSectionPageNumberTransform,
            displayPageNumberTransform: convergenceDisplayPageNumberTransform,
            pageReferenceLocationsStable:
              pageIndexDelta === 0 &&
              convergenceSectionPageNumberTransform.delta === 0 &&
              supportsLocalizedDecimalNumbering(input.options),
            sourceLayoutEpoch: previousLayout.layoutEpoch ?? null,
            positionTransforms,
            blockIdRewrites: reuse.blockIdRewrites?.previousToCurrent ?? null,
          },
        },
      };
    }

    // A deep edit on the final page has no later stable page on which to prove
    // tail convergence. When the bounded block slice itself reaches the exact
    // end of the current document, the emitted suffix is nevertheless complete:
    // retain the proved prefix and publish every newly paginated terminal page.
    // This is not early-stop acceptance and adopts no source tail.
    if (localEndBlockIndexExclusive === input.blocks.length) {
      // SD-3772 D5: `relaid-to-document-end` requires a complete finalized
      // emitted suffix. Prove it structurally — the last fragment-bearing block
      // of the document must appear in the emitted suffix pages; a truncated
      // suffix takes the canonical full fallback instead of publishing.
      const suppressedTerminalBlockIds = collectSectionBoundaryFillerBlockIds(suffixBlocks);
      let finalRenderableBlockId: string | null = null;
      for (let index = suffixBlocks.length - 1; index >= 0; index -= 1) {
        if (!doesFlowBlockProduceLayoutFragment(suffixBlocks, index, suppressedTerminalBlockIds)) continue;
        finalRenderableBlockId = suffixBlocks[index]!.id;
        break;
      }
      const suffixComplete =
        finalRenderableBlockId == null ||
        suffixLayout.pages.some((page) => pageContainsBlock(page, finalRenderableBlockId!));
      if (suffixLayout.pages.length === 0 || !suffixComplete) {
        return full('m4-layout-reuse-disabled-terminal-suffix-incomplete');
      }
      const pages = createSplicedPageSequence({
        previousPages,
        prefixPageCount: checkpointPageIndex,
        relaidPages: suffixLayout.pages,
        relaidPageCount: suffixLayout.pages.length,
        sourceTailStartPageIndex: previousPages.length,
      });
      const blockResumeCheckpoints = createSplicedBlockResumeCheckpointMap({
        previous: previousLayout.blockResumeCheckpoints,
        local: suffixLayout.blockResumeCheckpoints,
        checkpointPageIndex,
        relaidPageCount: suffixLayout.pages.length,
        sourceTailStartPageIndex: previousPages.length,
        pageIndexDelta: 0,
        previousToCurrentBlockId: reuse.blockIdRewrites?.previousToCurrent ?? null,
        currentToPreviousBlockId: reuse.blockIdRewrites?.currentToPrevious ?? null,
        positionTransforms: normalizePositionTransforms(reuse.pmShift),
        suffixStartBlockId: input.blocks[suffixStartBlockIndex]?.id ?? null,
        checkpointPagePrefixFragmentCount: partialPageCheckpoint ? partialPageCheckpoint.prefixFragments.length : null,
      });
      return {
        layout: {
          ...suffixLayout,
          pages,
          columns: previousLayout.columns ?? suffixLayout.columns,
          ...(blockResumeCheckpoints ? { blockResumeCheckpoints } : {}),
        },
        reuse: {
          mode: 'tail-splice',
          reason: withSpecializedRejections('m4-terminal-suffix-relaid-with-prefix-adoption'),
          tailDisposition: 'relaid-to-document-end',
          checkpointPageIndex,
          affectedFrontierPageIndex,
          sourceAffectedFrontierPageIndex,
          convergencePageIndex: null,
          sourceConvergencePageIndex: null,
          pagesPaginated: reuseProbePagesPaginated,
          pagesSplicedByReuse: checkpointPageIndex,
          tailAdoption: null,
        },
      };
    }

    // This finalized probe did not converge, but it is neither publishable nor a
    // reason to throw away the retained prefix. Expand the source horizon
    // geometrically and retry within this same bridge call.
    const remainingSourcePageCount = Math.max(1, previousPages.length - sourceAffectedFrontierPageIndex);
    const nextProbePageHorizon = Math.min(remainingSourcePageCount, Math.max(maxRelaidPages + 1, maxRelaidPages * 2));
    if (nextProbePageHorizon <= maxRelaidPages) {
      // Defensive only: reaching the retained tail above must either publish a
      // complete terminal suffix or take its named exact full fallback.
      return full(
        checkpointConvergenceRejection
          ? `m4-layout-reuse-convergence-probe-stalled:${checkpointConvergenceRejection}`
          : 'm4-layout-reuse-convergence-probe-stalled',
      );
    }
    perfLog(
      `[incrementalLayout] Expanding exact convergence probe from ${maxRelaidPages} to ${nextProbePageHorizon} pages (${checkpointConvergenceRejection})`,
    );
    convergenceProbePageHorizon = nextProbePageHorizon;
  }
}

function findLocalPaginationEndBlockIndexExclusive(input: {
  blocks: readonly FlowBlock[];
  previousPages: readonly Page[];
  currentBlockIndexById: ReadonlyMap<string, number>;
  suffixStartBlockIndex: number;
  sourceAffectedFrontierPageIndex: number;
  maxRelaidPages: number;
  previousToCurrentBlockId: ReadonlyMap<string, string> | null;
  deletedBlockIds: ReadonlySet<string>;
  ignoreUnindexedFootnoteFragments: boolean;
}): number | null {
  const finalCandidatePage = Math.min(
    input.previousPages.length - 1,
    input.sourceAffectedFrontierPageIndex + input.maxRelaidPages + 2,
  );
  let finalBlockIndex = input.suffixStartBlockIndex;
  for (let pageIndex = input.sourceAffectedFrontierPageIndex; pageIndex <= finalCandidatePage; pageIndex += 1) {
    const page = input.previousPages[pageIndex];
    if (!page) return null;
    for (const fragment of page.fragments) {
      if (input.deletedBlockIds.has(fragment.blockId)) continue;
      const currentBlockId = input.previousToCurrentBlockId?.get(fragment.blockId) ?? fragment.blockId;
      const blockIndex = input.currentBlockIndexById.get(currentBlockId);
      if (!Number.isInteger(blockIndex) || input.blocks[blockIndex!]?.id !== currentBlockId) {
        // Footnote-band fragments are page-local finalizer output, not body
        // pagination boundaries. Their bodies live in the proved note
        // sidecar and are re-injected after the bounded body splice.
        if (input.ignoreUnindexedFootnoteFragments) continue;
        return null;
      }
      finalBlockIndex = Math.max(finalBlockIndex, blockIndex!);
    }
  }
  return Math.min(input.blocks.length, finalBlockIndex + 1);
}

function normalizePositionTransforms(
  transform: LayoutPositionTransform | null | undefined,
): readonly LayoutPositionTransform[] {
  if (!transform || !Number.isFinite(transform.atChar) || !Number.isFinite(transform.delta) || transform.delta === 0) {
    return [];
  }
  return [{ atChar: transform.atChar, delta: transform.delta }];
}

function applyPositionTransforms(position: number, transforms: readonly LayoutPositionTransform[]): number {
  let current = position;
  for (const transform of transforms) {
    if (current >= transform.atChar) current += transform.delta;
  }
  return current;
}

class SplicedBlockResumeCheckpointMap implements ReadonlyMap<string, LayoutBlockResumeCheckpoint> {
  readonly #local = new Map<string, LayoutBlockResumeCheckpoint>();
  readonly #cache = new Map<string, LayoutBlockResumeCheckpoint>();
  readonly #input: {
    previous: ReadonlyMap<string, LayoutBlockResumeCheckpoint>;
    local: ReadonlyMap<string, LayoutBlockResumeCheckpoint>;
    checkpointPageIndex: number;
    relaidPageCount: number;
    sourceTailStartPageIndex: number;
    pageIndexDelta: number;
    previousToCurrentBlockId: ReadonlyMap<string, string> | null;
    currentToPreviousBlockId: ReadonlyMap<string, string> | null;
    positionTransforms: readonly LayoutPositionTransform[];
    suffixStartBlockId: string | null;
    checkpointPagePrefixFragmentCount: number | null;
  };

  constructor(input: {
    previous: ReadonlyMap<string, LayoutBlockResumeCheckpoint>;
    local: ReadonlyMap<string, LayoutBlockResumeCheckpoint>;
    checkpointPageIndex: number;
    relaidPageCount: number;
    sourceTailStartPageIndex: number;
    pageIndexDelta: number;
    previousToCurrentBlockId: ReadonlyMap<string, string> | null;
    currentToPreviousBlockId: ReadonlyMap<string, string> | null;
    positionTransforms: readonly LayoutPositionTransform[];
    suffixStartBlockId: string | null;
    checkpointPagePrefixFragmentCount: number | null;
  }) {
    this.#input = input;
    for (const [blockId, checkpoint] of input.local) {
      if (checkpoint.pageIndex >= input.relaidPageCount) continue;
      // The local run's stamp for the SUFFIX-START block reflects the seeded
      // resume posture (top of the relaid window), not the pre-break state a
      // cold run records on the preceding page. When the previous layout
      // holds an admissible stamp for that block — identical prefix pages
      // make it exact — prefer it so the spliced sidecar equals cold's and a
      // later resume replays the same break decision (SD-3772 stitched-plane
      // one-line drift).
      if (blockId === input.suffixStartBlockId && this.#admissiblePreviousCheckpoint(blockId) != null) {
        continue;
      }
      this.#local.set(blockId, {
        ...checkpoint,
        pageIndex: checkpoint.pageIndex + input.checkpointPageIndex,
      });
    }
  }

  #admissiblePreviousCheckpoint(blockId: string): LayoutBlockResumeCheckpoint | null {
    const previousBlockId = this.#input.currentToPreviousBlockId?.get(blockId) ?? blockId;
    const previous = this.#input.previous.get(previousBlockId);
    if (!previous) return null;
    if (previous.pageIndex < this.#input.checkpointPageIndex) return previous;
    // A PARTIAL (mid-page) checkpoint retains the checkpoint page's fragment
    // prefix verbatim, so previous stamps whose state lies within that
    // retained prefix remain exact (page-local cursor state; prefix pm
    // positions precede the edit and are unshifted).
    if (
      previous.pageIndex === this.#input.checkpointPageIndex &&
      this.#input.checkpointPagePrefixFragmentCount != null &&
      Number.isInteger(previous.prefixFragmentCount) &&
      previous.prefixFragmentCount <= this.#input.checkpointPagePrefixFragmentCount
    ) {
      return previous;
    }
    return null;
  }

  get size(): number {
    let count = 0;
    for (const _entry of this) count += 1;
    return count;
  }

  get(blockId: string): LayoutBlockResumeCheckpoint | undefined {
    const local = this.#local.get(blockId);
    if (local) return local;
    const cached = this.#cache.get(blockId);
    if (cached) return cached;
    const previousBlockId = this.#input.currentToPreviousBlockId?.get(blockId) ?? blockId;
    const previous = this.#input.previous.get(previousBlockId);
    if (!previous) return undefined;
    const retainedPrefix = previous.pageIndex < this.#input.checkpointPageIndex;
    const retainedTail = previous.pageIndex >= this.#input.sourceTailStartPageIndex;
    const retainedCheckpointPagePrefix =
      !retainedPrefix && !retainedTail && this.#admissiblePreviousCheckpoint(blockId) != null;
    if (!retainedPrefix && !retainedTail && !retainedCheckpointPagePrefix) return undefined;
    const current: LayoutBlockResumeCheckpoint = {
      ...previous,
      blockId,
      pageIndex: previous.pageIndex + (retainedTail ? this.#input.pageIndexDelta : 0),
      footnoteAnchorsThisPage: retainedTail
        ? previous.footnoteAnchorsThisPage.map((anchor) => ({
            ...anchor,
            pmPos: applyPositionTransforms(anchor.pmPos, this.#input.positionTransforms),
          }))
        : previous.footnoteAnchorsThisPage,
    };
    this.#cache.set(blockId, current);
    return current;
  }

  has(blockId: string): boolean {
    return this.get(blockId) != null;
  }

  *entries(): MapIterator<[string, LayoutBlockResumeCheckpoint]> {
    const emitted = new Set<string>();
    for (const entry of this.#local) {
      emitted.add(entry[0]);
      yield entry;
    }
    for (const [previousBlockId] of this.#input.previous) {
      const currentBlockId = this.#input.previousToCurrentBlockId?.get(previousBlockId) ?? previousBlockId;
      if (emitted.has(currentBlockId)) continue;
      const checkpoint = this.get(currentBlockId);
      if (!checkpoint) continue;
      emitted.add(currentBlockId);
      yield [currentBlockId, checkpoint];
    }
  }

  [Symbol.iterator](): MapIterator<[string, LayoutBlockResumeCheckpoint]> {
    return this.entries();
  }

  *keys(): MapIterator<string> {
    for (const [blockId] of this) yield blockId;
  }

  *values(): MapIterator<LayoutBlockResumeCheckpoint> {
    for (const [, checkpoint] of this) yield checkpoint;
  }

  forEach(
    callbackfn: (
      value: LayoutBlockResumeCheckpoint,
      key: string,
      map: ReadonlyMap<string, LayoutBlockResumeCheckpoint>,
    ) => void,
    thisArg?: unknown,
  ): void {
    for (const [blockId, checkpoint] of this) callbackfn.call(thisArg, checkpoint, blockId, this);
  }
}

function createSplicedBlockResumeCheckpointMap(input: {
  previous: ReadonlyMap<string, LayoutBlockResumeCheckpoint> | undefined;
  local: ReadonlyMap<string, LayoutBlockResumeCheckpoint> | undefined;
  checkpointPageIndex: number;
  relaidPageCount: number;
  sourceTailStartPageIndex: number;
  pageIndexDelta: number;
  previousToCurrentBlockId: ReadonlyMap<string, string> | null;
  currentToPreviousBlockId: ReadonlyMap<string, string> | null;
  positionTransforms: readonly LayoutPositionTransform[];
  suffixStartBlockId: string | null;
  checkpointPagePrefixFragmentCount: number | null;
}): ReadonlyMap<string, LayoutBlockResumeCheckpoint> | undefined {
  if (!input.previous || !input.local) return undefined;
  return new SplicedBlockResumeCheckpointMap({ ...input, previous: input.previous, local: input.local });
}

interface LazyPageSegment {
  targetStart: number;
  length: number;
  sourcePages: Page[];
  sourceStart: number;
  /** Every retained-tail position is after the proved local edit frontier. */
  positionDelta: number;
  pageIndexDelta: number;
  sectionPageNumberDeltas: ReadonlyMap<number, number> | null;
  displayPageNumberTransforms: readonly IncrementalDisplayPageNumberTransform[] | null;
  blockIdRewrites: ReadonlyMap<string, string> | null;
  /** Lazily stamp the canonical empty note row on proved note-free pages. */
  ensureEmptyFootnoteMetadata: boolean;
}

interface LazyPageSequence {
  segments: readonly LazyPageSegment[];
  cache: Map<number, Page>;
}

const lazyPageSequences = new WeakMap<Page[], LazyPageSequence>();

/**
 * Compose retained prefix/local relayout/retained tail without spreading the
 * document-sized prefix or tail. Nested warm edits flatten the prior segment
 * descriptor, so revealing a retained page never walks a generation-deep
 * proxy chain.
 */
function createSplicedPageSequence(input: {
  previousPages: Page[];
  prefixPageCount: number;
  relaidPages: Page[];
  relaidPageCount: number;
  sourceTailStartPageIndex: number;
}): Page[] {
  const segments: LazyPageSegment[] = [];
  appendPageSequenceSlice(segments, input.previousPages, 0, input.prefixPageCount);
  appendPageSequenceSlice(segments, input.relaidPages, 0, input.relaidPageCount);
  appendPageSequenceSlice(segments, input.previousPages, input.sourceTailStartPageIndex, input.previousPages.length);
  return createLazyPageSequence(segments);
}

function appendPageSequenceSlice(
  target: LazyPageSegment[],
  sourcePages: Page[],
  sourceStart: number,
  sourceEnd: number,
): void {
  if (sourceEnd <= sourceStart) return;
  const descriptor = lazyPageSequences.get(sourcePages);
  if (!descriptor) {
    target.push({
      targetStart: pageSegmentLength(target),
      length: sourceEnd - sourceStart,
      sourcePages,
      sourceStart,
      positionDelta: 0,
      pageIndexDelta: 0,
      sectionPageNumberDeltas: null,
      displayPageNumberTransforms: null,
      blockIdRewrites: null,
      ensureEmptyFootnoteMetadata: false,
    });
    return;
  }
  for (const segment of descriptor.segments) {
    const segmentEnd = segment.targetStart + segment.length;
    const overlapStart = Math.max(sourceStart, segment.targetStart);
    const overlapEnd = Math.min(sourceEnd, segmentEnd);
    if (overlapEnd <= overlapStart) continue;
    target.push({
      ...segment,
      targetStart: pageSegmentLength(target),
      length: overlapEnd - overlapStart,
      sourceStart: segment.sourceStart + overlapStart - segment.targetStart,
    });
  }
}

function pageSegmentLength(segments: readonly LazyPageSegment[]): number {
  const last = segments[segments.length - 1];
  return last ? last.targetStart + last.length : 0;
}

function createLazyPageSequence(segments: readonly LazyPageSegment[]): Page[] {
  const length = pageSegmentLength(segments);
  const target: Page[] = [];
  target.length = length;
  const descriptor: LazyPageSequence = { segments, cache: new Map() };
  const readIndex = (property: string | symbol): number | null => {
    if (typeof property !== 'string' || !/^(0|[1-9]\d*)$/.test(property)) return null;
    const index = Number(property);
    return index < length ? index : null;
  };
  const readPage = (index: number): Page => {
    const cached = descriptor.cache.get(index);
    if (cached) return cached;
    let low = 0;
    let high = segments.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const segment = segments[middle]!;
      if (index < segment.targetStart) high = middle - 1;
      else if (index >= segment.targetStart + segment.length) low = middle + 1;
      else {
        const sourcePage = segment.sourcePages[segment.sourceStart + index - segment.targetStart];
        if (!sourcePage) throw new RangeError(`Layout page index ${index} is out of range.`);
        const page =
          segment.positionDelta !== 0 ||
          segment.pageIndexDelta !== 0 ||
          (segment.sectionPageNumberDeltas?.size ?? 0) > 0 ||
          segment.displayPageNumberTransforms != null ||
          hasBlockIdRewrites(segment.blockIdRewrites) ||
          segment.ensureEmptyFootnoteMetadata
            ? materializeAdoptedLayoutPage(
                sourcePage,
                segment.positionDelta === 0 ? [] : [{ atChar: Number.NEGATIVE_INFINITY, delta: segment.positionDelta }],
                segment.pageIndexDelta,
                segment.blockIdRewrites,
                segment.sectionPageNumberDeltas,
                segment.displayPageNumberTransforms,
              )
            : sourcePage;
        if (segment.ensureEmptyFootnoteMetadata) {
          page.footnoteReserved = 0;
          page.footnoteLedger = {
            pageIndex: index,
            anchorIds: [],
            mandatorySliceIds: [],
            continuationSliceIds: [],
            extendedSliceIds: [],
            continuationIn: [],
            continuationOut: [],
            mandatoryReservePx: 0,
            preferredReservePx: 0,
            actualBandHeightPx: 0,
            appliedBodyReservePx: 0,
            deadReservePx: 0,
            lastAnchorRenderedLines: 0,
          };
        }
        descriptor.cache.set(index, page);
        return page;
      }
    }
    throw new RangeError(`Layout page index ${index} is out of range.`);
  };
  const pages = new Proxy(target, {
    get(object, property, receiver): unknown {
      const index = readIndex(property);
      return index == null ? Reflect.get(object, property, receiver) : readPage(index);
    },
    has(object, property): boolean {
      return readIndex(property) != null || Reflect.has(object, property);
    },
    getOwnPropertyDescriptor(object, property): PropertyDescriptor | undefined {
      const index = readIndex(property);
      if (index == null) return Reflect.getOwnPropertyDescriptor(object, property);
      return { configurable: true, enumerable: true, writable: false, value: readPage(index) };
    },
    set(): boolean {
      return false;
    },
    defineProperty(): boolean {
      return false;
    },
    deleteProperty(): boolean {
      return false;
    },
  });
  lazyPageSequences.set(pages, descriptor);
  return pages;
}

const composedBlockIdRewriteMaps = new WeakSet<ReadonlyMap<string, string>>();

class ComposedBlockIdRewriteMap extends Map<string, string> {
  readonly #existing: ReadonlyMap<string, string>;
  readonly #next: ReadonlyMap<string, string>;
  #materialized: Map<string, string> | null = null;

  constructor(existing: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>) {
    super();
    this.#existing = existing;
    this.#next = next;
    composedBlockIdRewriteMaps.add(this);
  }

  override get(sourceId: string): string | undefined {
    const intermediate = this.#existing.get(sourceId) ?? sourceId;
    const current = this.#next.get(intermediate) ?? intermediate;
    return current === sourceId ? undefined : current;
  }

  override has(sourceId: string): boolean {
    return this.get(sourceId) != null;
  }

  #materialize(): Map<string, string> {
    if (this.#materialized) return this.#materialized;
    const result = new Map<string, string>();
    for (const sourceId of this.#existing.keys()) {
      const currentId = this.get(sourceId);
      if (currentId != null) result.set(sourceId, currentId);
    }
    for (const sourceId of this.#next.keys()) {
      if (result.has(sourceId)) continue;
      const currentId = this.get(sourceId);
      if (currentId != null) result.set(sourceId, currentId);
    }
    this.#materialized = result;
    return result;
  }

  override get size(): number {
    return this.#materialize().size;
  }

  override entries(): MapIterator<[string, string]> {
    return this.#materialize().entries();
  }

  override [Symbol.iterator](): MapIterator<[string, string]> {
    return this.entries();
  }

  override keys(): MapIterator<string> {
    return this.#materialize().keys();
  }

  override values(): MapIterator<string> {
    return this.#materialize().values();
  }

  override forEach(
    callbackfn: (value: string, key: string, map: Map<string, string>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.#materialize()) callbackfn.call(thisArg, value, key, this);
  }

  override set(): this {
    throw new Error('composed block-id rewrites are immutable');
  }

  override delete(): boolean {
    throw new Error('composed block-id rewrites are immutable');
  }

  override clear(): void {
    throw new Error('composed block-id rewrites are immutable');
  }
}

function hasBlockIdRewrites(rewrites: ReadonlyMap<string, string> | null): boolean {
  return rewrites != null && (composedBlockIdRewriteMaps.has(rewrites) || rewrites.size > 0);
}

function composeBlockIdRewrites(
  existing: ReadonlyMap<string, string> | null,
  next: ReadonlyMap<string, string> | null,
): ReadonlyMap<string, string> | null {
  if (!hasBlockIdRewrites(existing)) return hasBlockIdRewrites(next) ? next : null;
  if (!hasBlockIdRewrites(next)) return existing;
  const existingRewrites = existing!;
  const nextRewrites = next!;
  if (
    composedBlockIdRewriteMaps.has(existingRewrites) ||
    composedBlockIdRewriteMaps.has(nextRewrites) ||
    readStructuralBlockIdRewriteDescriptor(existingRewrites) != null ||
    readStructuralBlockIdRewriteDescriptor(nextRewrites) != null
  ) {
    return new ComposedBlockIdRewriteMap(existingRewrites, nextRewrites);
  }
  const result = new Map<string, string>();
  for (const [sourceId, currentId] of existingRewrites) {
    const rewritten = nextRewrites.get(currentId) ?? currentId;
    if (rewritten !== sourceId) result.set(sourceId, rewritten);
  }
  // A segment can contain pages authored in the immediately previous
  // generation as well as older lazily adopted pages. Preserve direct next
  // rewrites for the former while the composed rows cover the latter.
  for (const [sourceId, currentId] of nextRewrites) {
    if (!result.has(sourceId) && sourceId !== currentId) result.set(sourceId, currentId);
  }
  return result.size > 0 ? result : null;
}

function composeSectionPageNumberDeltas(
  existing: ReadonlyMap<number, number> | null,
  transform: IncrementalSectionPageNumberTransform | null,
): ReadonlyMap<number, number> | null {
  if (!transform || transform.delta === 0) return existing;
  const composed = new Map(existing ?? []);
  const delta = (composed.get(transform.sectionIndex) ?? 0) + transform.delta;
  if (delta === 0) composed.delete(transform.sectionIndex);
  else composed.set(transform.sectionIndex, delta);
  return composed.size > 0 ? composed : null;
}

function composeDisplayPageNumberTransforms(
  existing: readonly IncrementalDisplayPageNumberTransform[] | null,
  transform: IncrementalDisplayPageNumberTransform | null | undefined,
): readonly IncrementalDisplayPageNumberTransform[] | null {
  if (!transform) return existing;
  const composed = new Map<string, IncrementalDisplayPageNumberTransform>();
  for (const current of existing ?? []) {
    composed.set(`${current.startSectionIndex}:${current.endSectionIndexExclusive}`, current);
  }
  const key = `${transform.startSectionIndex}:${transform.endSectionIndexExclusive}`;
  const delta = (composed.get(key)?.delta ?? 0) + transform.delta;
  if (delta === 0) composed.delete(key);
  else composed.set(key, { ...transform, delta });
  return [...composed.values()];
}

function addAdoptionTransform(pages: Page[], adoption: IncrementalLayoutTailAdoption): Page[] {
  const source = lazyPageSequences.get(pages);
  if (!source) return pages;
  const adoptionDelta = adoption.positionTransforms.reduce((total, transform) => total + transform.delta, 0);
  const transformed: LazyPageSegment[] = [];
  const appendRange = (segment: LazyPageSegment, start: number, end: number, adopt: boolean): void => {
    if (end <= start) return;
    transformed.push({
      ...segment,
      targetStart: pageSegmentLength(transformed),
      length: end - start,
      sourceStart: segment.sourceStart + start - segment.targetStart,
      positionDelta: segment.positionDelta + (adopt ? adoptionDelta : 0),
      pageIndexDelta: segment.pageIndexDelta + (adopt ? adoption.pageIndexDelta : 0),
      sectionPageNumberDeltas: adopt
        ? composeSectionPageNumberDeltas(segment.sectionPageNumberDeltas, adoption.sectionPageNumberTransform)
        : segment.sectionPageNumberDeltas,
      displayPageNumberTransforms: adopt
        ? composeDisplayPageNumberTransforms(segment.displayPageNumberTransforms, adoption.displayPageNumberTransform)
        : segment.displayPageNumberTransforms,
      blockIdRewrites: adopt
        ? composeBlockIdRewrites(segment.blockIdRewrites, adoption.blockIdRewrites ?? null)
        : segment.blockIdRewrites,
    });
  };
  for (const segment of source.segments) {
    const start = segment.targetStart;
    const end = start + segment.length;
    appendRange(segment, start, Math.min(end, adoption.startPageIndex), false);
    appendRange(segment, Math.max(start, adoption.startPageIndex), Math.min(end, adoption.endPageIndexExclusive), true);
    appendRange(segment, Math.max(start, adoption.endPageIndexExclusive), end, false);
  }
  return createLazyPageSequence(transformed);
}

function ensureEmptyFootnoteMetadataOutsideFinalizedPages(
  pages: Page[],
  finalizedPageIndexes: ReadonlySet<number>,
): Page[] {
  const source = lazyPageSequences.get(pages);
  if (!source) return pages;
  const transformed: LazyPageSegment[] = [];
  const appendRange = (segment: LazyPageSegment, start: number, end: number, ensureEmpty: boolean): void => {
    if (end <= start) return;
    transformed.push({
      ...segment,
      targetStart: pageSegmentLength(transformed),
      length: end - start,
      sourceStart: segment.sourceStart + start - segment.targetStart,
      ensureEmptyFootnoteMetadata: ensureEmpty || segment.ensureEmptyFootnoteMetadata,
    });
  };
  const finalized = [...finalizedPageIndexes]
    .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < pages.length)
    .sort((left, right) => left - right);
  for (const segment of source.segments) {
    const segmentStart = segment.targetStart;
    const segmentEnd = segmentStart + segment.length;
    let cursor = segmentStart;
    for (const pageIndex of finalized) {
      if (pageIndex < cursor || pageIndex >= segmentEnd) continue;
      appendRange(segment, cursor, pageIndex, true);
      appendRange(segment, pageIndex, pageIndex + 1, false);
      cursor = pageIndex + 1;
    }
    appendRange(segment, cursor, segmentEnd, true);
  }
  return createLazyPageSequence(transformed);
}

/**
 * Retained source pages stay private. Any raw-layout consumer that reads an
 * adopted target page receives a current-coordinate clone, so bypassing the
 * localized resolver cannot expose source-generation PM/page metadata.
 */
function guardAdoptedLayoutPages(
  layout: Layout,
  adoption: IncrementalLayoutTailAdoption,
  numberingContext: NumberingContext | null = null,
): Layout {
  // The generic full numbering finalizer owns formats/restarts/chapters that
  // cannot be represented by a constant page-index delta. Keep the lazy
  // source sequence and apply its exact target-page display record when that
  // adopted page is materialized. Decimal continuous numbering can retain the
  // cheaper composed-segment transform.
  const transformedSequence = numberingContext == null ? addAdoptionTransform(layout.pages, adoption) : layout.pages;
  if (transformedSequence !== layout.pages) return { ...layout, pages: transformedSequence };
  const sourcePages = layout.pages;
  const materializedPages = new Map<number, Page>();
  const sectionPageNumberDeltas = composeSectionPageNumberDeltas(null, adoption.sectionPageNumberTransform);
  const displayPageNumberTransforms = composeDisplayPageNumberTransforms(null, adoption.displayPageNumberTransform);
  const readPageIndex = (property: string | symbol): number | null => {
    if (typeof property !== 'string' || !/^(0|[1-9]\d*)$/.test(property)) return null;
    const pageIndex = Number(property);
    return pageIndex < sourcePages.length ? pageIndex : null;
  };
  const materializePage = (pageIndex: number): Page => {
    const sourcePage = sourcePages[pageIndex];
    if (!sourcePage) throw new RangeError(`Layout page index ${pageIndex} is out of range.`);
    if (pageIndex < adoption.startPageIndex || pageIndex >= adoption.endPageIndexExclusive) return sourcePage;
    const cached = materializedPages.get(pageIndex);
    if (cached) return cached;
    const currentPage = materializeAdoptedLayoutPage(
      sourcePage,
      adoption.positionTransforms,
      adoption.pageIndexDelta,
      adoption.blockIdRewrites ?? null,
      sectionPageNumberDeltas,
      displayPageNumberTransforms,
    );
    const displayInfo = numberingContext?.displayPages[pageIndex];
    if (displayInfo) {
      currentPage.number = pageIndex + 1;
      currentPage.numberText = displayInfo.displayText;
      currentPage.displayNumber = displayInfo.displayNumber;
      currentPage.pageNumberFormat = displayInfo.pageFormat;
      currentPage.pageNumberChapterText = displayInfo.chapterNumberText;
      currentPage.pageNumberChapterSeparator = displayInfo.chapterSeparator;
    }
    materializedPages.set(pageIndex, currentPage);
    return currentPage;
  };
  const pages = new Proxy(sourcePages, {
    get(target, property, receiver): unknown {
      const pageIndex = readPageIndex(property);
      if (pageIndex != null) return materializePage(pageIndex);
      return Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property): PropertyDescriptor | undefined {
      const pageIndex = readPageIndex(property);
      if (pageIndex == null) return Reflect.getOwnPropertyDescriptor(target, property);
      return {
        configurable: true,
        enumerable: true,
        writable: false,
        value: materializePage(pageIndex),
      };
    },
    set(): boolean {
      return false;
    },
    defineProperty(): boolean {
      return false;
    },
    deleteProperty(): boolean {
      return false;
    },
  }) as Page[];
  return { ...layout, pages };
}

function materializeAdoptedLayoutPage(
  sourcePage: Page,
  transforms: readonly LayoutPositionTransform[],
  pageIndexDelta: number,
  blockIdRewrites: ReadonlyMap<string, string> | null = null,
  sectionPageNumberDeltas: ReadonlyMap<number, number> | null = null,
  displayPageNumberTransforms: readonly IncrementalDisplayPageNumberTransform[] | null = null,
): Page {
  const seen = new WeakMap<object, unknown>();
  const clone = (value: unknown, key?: string, parentKey?: string): unknown => {
    if ((key === 'pmStart' || key === 'pmEnd') && typeof value === 'number') {
      return applyPositionTransforms(value, transforms);
    }
    if (parentKey === 'pmRange' && (key === 'from' || key === 'to') && typeof value === 'number') {
      return applyPositionTransforms(value, transforms);
    }
    if (key === 'blockId' && typeof value === 'string') {
      return blockIdRewrites?.get(value) ?? value;
    }
    if (key === 'pageIndex' && typeof value === 'number') return value + pageIndexDelta;
    if (value == null || typeof value !== 'object') return value;
    const existing = seen.get(value);
    if (existing) return existing;
    if (Array.isArray(value)) {
      const array: unknown[] = [];
      seen.set(value, array);
      for (const entry of value) array.push(clone(entry, undefined, key));
      return array;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    const object: Record<string, unknown> = {};
    seen.set(value, object);
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      object[entryKey] = clone(entryValue, entryKey, key);
    }
    return object;
  };

  const page = clone(sourcePage) as Page;
  page.number += pageIndexDelta;
  const sectionPageNumberDelta = sectionPageNumberDeltas?.get(page.sectionIndex ?? 0) ?? 0;
  if (sectionPageNumberDelta !== 0 && page.sectionPageNumber != null) {
    page.sectionPageNumber += sectionPageNumberDelta;
  }
  const pageSectionIndex = page.sectionIndex ?? 0;
  const displayPageNumberDelta =
    displayPageNumberTransforms == null
      ? pageIndexDelta
      : displayPageNumberTransforms.reduce(
          (delta, transform) =>
            pageSectionIndex >= transform.startSectionIndex && pageSectionIndex < transform.endSectionIndexExclusive
              ? delta + transform.delta
              : delta,
          0,
        );
  if (page.displayNumber != null) page.displayNumber += displayPageNumberDelta;
  if (page.effectivePageNumber != null) page.effectivePageNumber += displayPageNumberDelta;
  if (page.numberText != null && /^\d+$/.test(page.numberText)) {
    page.numberText = String(Number(page.numberText) + displayPageNumberDelta);
  }
  return page;
}

function haveExactUniqueIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  if (leftSet.size !== left.length) return false;
  for (const id of right) {
    if (!leftSet.has(id)) return false;
  }
  return new Set(right).size === right.length;
}

function validateIncrementalPaginationProof(proof: IncrementalPaginationProof): string | null {
  const runtimeProof = proof as IncrementalPaginationProof & {
    globalDependenciesAbsent?: boolean;
    globalDependenciesFencedByDocumentStart?: boolean;
    globalDependenciesFencedByPageCheckpoint?: boolean;
    multiColumnSectionsProvedNonBalanceable?: boolean;
    admittedDependencyClasses?: unknown;
    pageReferencesAbsent?: boolean;
    pageReferenceDependencyClosure?: unknown;
    localKeepDependencyClosure?: unknown;
    nonFlowingPageRelativeAnchorDependency?: unknown;
  };
  const dependencyProfileValid =
    proof.profile === 'single-section-local-text'
      ? runtimeProof.globalDependenciesAbsent === true && runtimeProof.globalDependenciesFencedByDocumentStart !== true
      : proof.profile === 'document-start-local-text'
        ? runtimeProof.globalDependenciesAbsent === false &&
          runtimeProof.globalDependenciesFencedByDocumentStart === true &&
          runtimeProof.multiColumnSectionsProvedNonBalanceable === true
        : proof.profile === 'page-checkpoint-local-text'
          ? runtimeProof.globalDependenciesAbsent === false &&
            runtimeProof.globalDependenciesFencedByPageCheckpoint === true &&
            areValidPageCheckpointDependencyClasses(runtimeProof.admittedDependencyClasses) &&
            hasValidKeepCheckpointClosure(
              runtimeProof.admittedDependencyClasses,
              runtimeProof.localKeepDependencyClosure,
            ) &&
            // SD-3772 D1: fail closed unless the host proved every
            // multi-column section genuinely unequal (balancing inert).
            runtimeProof.multiColumnSectionsProvedNonBalanceable === true
          : false;
  if (
    !dependencyProfileValid ||
    proof.blockIdsUnchanged !== true ||
    proof.blockIdsUnique !== true ||
    proof.renderInputsUnchanged !== true ||
    !hasValidPageReferenceClosure(
      proof.profile,
      runtimeProof.pageReferencesAbsent,
      runtimeProof.admittedDependencyClasses,
      runtimeProof.pageReferenceDependencyClosure,
    ) ||
    !hasCoherentNonFlowingPageRelativeAnchorProof(
      runtimeProof.admittedDependencyClasses,
      runtimeProof.nonFlowingPageRelativeAnchorDependency,
    )
  ) {
    return 'dependency-proof-invalid';
  }
  return null;
}

function hasCoherentNonFlowingPageRelativeAnchorProof(classes: unknown, proof: unknown): boolean {
  const admitted = Array.isArray(classes) && classes.includes('non-flowing-page-relative-body-anchors');
  if (!admitted) return proof == null;
  if (!proof || typeof proof !== 'object') return false;
  const value = proof as NonFlowingPageRelativeAnchorDependencyProof;
  return (
    value.version === 1 &&
    Number.isInteger(value.sourceLayoutEpoch) &&
    typeof value.inventoryFingerprint === 'string' &&
    value.inventoryFingerprint.length > 0 &&
    Array.isArray(value.entries) &&
    value.entries.length > 0
  );
}

function validateNonFlowingPageRelativeAnchorDependency(input: {
  proof: IncrementalPaginationProof | null | undefined;
  previousLayout: Layout;
  blocks: readonly FlowBlock[];
  currentBlockIndexById: ReadonlyMap<string, number> | null | undefined;
  previousBlockPageIndex: ReadonlyMap<string, { firstPage: number; lastPage: number }> | null | undefined;
  blockIdRewrites: IncrementalLayoutReuseOptions['blockIdRewrites'];
  dirtyBlockIds: readonly string[];
}): string | null {
  if (input.proof?.profile !== 'page-checkpoint-local-text') return null;
  const classes = input.proof.admittedDependencyClasses;
  const admitted = classes.includes('non-flowing-page-relative-body-anchors');
  const dependency = input.proof.nonFlowingPageRelativeAnchorDependency;
  if (!admitted) return dependency == null ? null : 'page-relative-anchor-class-missing';
  if (!dependency || dependency.sourceLayoutEpoch !== input.previousLayout.layoutEpoch) {
    return 'page-relative-anchor-epoch-mismatch';
  }
  if (!input.currentBlockIndexById || !input.previousBlockPageIndex) {
    return 'page-relative-anchor-index-missing';
  }
  const dirty = new Set(input.dirtyBlockIds);
  const seen = new Set<string>();
  const previousToCurrent = input.blockIdRewrites?.previousToCurrent;
  const provedAnchorIds = new Set(
    dependency.entries.map((entry) => previousToCurrent?.get(entry.blockId) ?? entry.blockId),
  );
  for (const dirtyBlockId of dirty) {
    const dirtyBlockIndex = input.currentBlockIndexById.get(dirtyBlockId);
    const dirtyBlock = Number.isInteger(dirtyBlockIndex) ? input.blocks[dirtyBlockIndex!] : null;
    const dirtyAnchorBlock = dirtyBlock && 'anchor' in dirtyBlock ? dirtyBlock : null;
    if (
      dirtyAnchorBlock?.anchor?.isAnchored === true &&
      isPageRelativeAnchor(dirtyAnchorBlock) &&
      !provedAnchorIds.has(dirtyBlockId)
    ) {
      return 'page-relative-anchor-inventory-changed';
    }
  }
  for (const entry of dependency.entries) {
    const currentBlockId = previousToCurrent?.get(entry.blockId) ?? entry.blockId;
    const currentCarrierParagraphId = previousToCurrent?.get(entry.carrierParagraphId) ?? entry.carrierParagraphId;
    if (
      typeof entry.blockId !== 'string' ||
      entry.blockId.length === 0 ||
      seen.has(entry.blockId) ||
      dirty.has(currentBlockId) ||
      dirty.has(currentCarrierParagraphId)
    ) {
      return 'page-relative-anchor-inventory-invalid-or-dirty';
    }
    const blockIndex = input.currentBlockIndexById.get(currentBlockId);
    const block = Number.isInteger(blockIndex) ? input.blocks[blockIndex!] : null;
    if (
      !block ||
      block.id !== currentBlockId ||
      block.kind !== 'image' ||
      block.anchor?.isAnchored !== true ||
      !isPageRelativeAnchor(block) ||
      block.wrap?.type !== 'None' ||
      (block.attrs as { anchorParagraphId?: unknown } | undefined)?.anchorParagraphId !== currentCarrierParagraphId
    ) {
      return 'page-relative-anchor-current-shape-mismatch';
    }
    const pageRange = input.previousBlockPageIndex.get(entry.blockId);
    const sourcePage = input.previousLayout.pages[entry.sourcePageIndex];
    if (
      !pageRange ||
      pageRange.firstPage !== entry.sourcePageIndex ||
      pageRange.lastPage !== entry.sourcePageIndex ||
      !sourcePage?.fragments.some((fragment) => fragment.blockId === entry.blockId) ||
      (sourcePage.sectionIndex ?? 0) !== entry.sectionIndex
    ) {
      return 'page-relative-anchor-source-page-mismatch';
    }
    seen.add(entry.blockId);
  }
  return seen.size === dependency.entries.length ? null : 'page-relative-anchor-inventory-mismatch';
}

function hasValidPageReferenceClosure(profile: unknown, absent: unknown, classes: unknown, closure: unknown): boolean {
  if (absent === true) return closure == null;
  if (absent !== false) return false;
  if (profile === 'page-checkpoint-local-text') {
    if (!Array.isArray(classes) || !classes.includes('page-references')) return false;
  } else if (profile !== 'document-start-local-text') {
    return false;
  }
  if (!closure || typeof closure !== 'object') return false;
  const value = closure as Record<string, unknown>;
  const references = value.referenceBlockIds;
  const targets = value.targetBookmarkIds;
  return (
    Array.isArray(references) &&
    references.length > 0 &&
    references.every((item) => typeof item === 'string' && item.length > 0) &&
    new Set(references).size === references.length &&
    Array.isArray(targets) &&
    targets.length > 0 &&
    targets.every((item) => typeof item === 'string' && item.length > 0) &&
    new Set(targets).size === targets.length
  );
}

function hasValidKeepCheckpointClosure(classes: unknown, closure: unknown): boolean {
  if (!Array.isArray(classes) || !classes.includes('keep-constraints')) return true;
  if (!closure || typeof closure !== 'object') return false;
  const value = closure as Record<string, unknown>;
  return (
    Number.isInteger(value.checkpointPageIndex) &&
    (value.checkpointBlockId === null || typeof value.checkpointBlockId === 'string') &&
    (value.predecessorBlockId === null || typeof value.predecessorBlockId === 'string')
  );
}

function supportsLocalizedSectionNumbering(options: LayoutOptions): boolean {
  const sections = options.sectionMetadata ?? [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]!;
    if (section.sectionIndex !== index) return false;
    const numbering = section.numbering;
    if (!numbering) continue;
    if (numbering.start != null && (!Number.isInteger(numbering.start) || numbering.start < 1)) return false;
    if (numbering.chapterStyle != null || numbering.chapterSeparator != null) return false;
  }
  return true;
}

function supportsLocalizedDecimalNumbering(options: LayoutOptions): boolean {
  const sections = options.sectionMetadata ?? [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]!;
    if (section.sectionIndex !== index) return false;
    const numbering = section.numbering;
    if (!numbering) continue;
    if (numbering.format != null && numbering.format !== 'decimal') return false;
    if (numbering.start != null && (!Number.isInteger(numbering.start) || numbering.start < 1)) return false;
    if (numbering.chapterStyle != null || numbering.chapterSeparator != null) return false;
  }
  return true;
}

function buildDisplayPageNumberTransform(
  options: LayoutOptions,
  startSectionIndex: number,
  delta: number,
): IncrementalDisplayPageNumberTransform | null {
  if (!supportsLocalizedDecimalNumbering(options) || !Number.isInteger(startSectionIndex) || startSectionIndex < 0) {
    return null;
  }
  const sections = options.sectionMetadata ?? [];
  if (sections.length > 0 && sections[startSectionIndex]?.sectionIndex !== startSectionIndex) return null;
  let endSectionIndexExclusive = Number.MAX_SAFE_INTEGER;
  for (let sectionIndex = startSectionIndex + 1; sectionIndex < sections.length; sectionIndex += 1) {
    if (sections[sectionIndex]?.numbering?.start == null) continue;
    endSectionIndexExclusive = sectionIndex;
    break;
  }
  return { startSectionIndex, endSectionIndexExclusive, delta };
}

function validateProvedWarmPaginationInputs(
  reuse: IncrementalLayoutReuseOptions,
  blocks: readonly FlowBlock[],
  dirty: ReturnType<typeof computeDirtyRegions>,
): string | null {
  if (!reuse.dependencyProof) return 'dependency-proof-missing';
  if (!reuse.provedDirtyRegion || reuse.provedDirtyRegion !== dirty) return 'proved-dirty-region-missing';
  if (!reuse.currentBlockIndexById) return 'current-block-index-missing';
  if (reuse.currentBlockIndexById.size !== blocks.length) return 'duplicate-block-id';
  if (!reuse.previousPageStartKeyIndex) return 'page-start-key-index-missing';
  const hasBlockCountChange = dirty.insertedBlockIds.length > 0 || dirty.deletedBlockIds.length > 0;
  if (hasBlockCountChange) {
    if (!reuse.previousBlockIndexById || !reuse.blockIdRewrites) {
      return 'structural-block-id-rewrite-proof-missing';
    }
    const { previousToCurrent, currentToPrevious } = reuse.blockIdRewrites;
    const structuralRewriteProof = validateStructuralBlockIdRewritePair(
      previousToCurrent,
      currentToPrevious,
      reuse.previousBlockIndexById.size,
      reuse.currentBlockIndexById.size,
    );
    if (!structuralRewriteProof) {
      for (const [previousId, currentId] of previousToCurrent) {
        if (
          currentToPrevious.get(currentId) !== previousId ||
          !reuse.previousBlockIndexById.has(previousId) ||
          !reuse.currentBlockIndexById.has(currentId) ||
          !dirty.stableBlockIds.has(currentId)
        ) {
          return 'structural-block-id-rewrite-proof-invalid';
        }
      }
      for (const [currentId, previousId] of currentToPrevious) {
        if (previousToCurrent.get(previousId) !== currentId) {
          return 'structural-block-id-rewrite-proof-invalid';
        }
      }
    }
  }
  return null;
}

const STRUCTURAL_BLOCK_ID_REWRITE_DESCRIPTOR = Symbol.for('superdoc.v2.structural-block-id-rewrite.v1');

interface StructuralBlockIdRewriteDescriptor {
  version: 1;
  token: object;
  direction: 'previous-to-current' | 'current-to-previous';
  sourceStartIndex: number;
  targetStartIndex: number;
  localRewriteCount?: number;
  sourceSize: number;
  targetSize: number;
}

function readStructuralBlockIdRewriteDescriptor(
  value: ReadonlyMap<string, string>,
): StructuralBlockIdRewriteDescriptor | null {
  const descriptor = (
    value as ReadonlyMap<string, string> & {
      [STRUCTURAL_BLOCK_ID_REWRITE_DESCRIPTOR]?: StructuralBlockIdRewriteDescriptor;
    }
  )[STRUCTURAL_BLOCK_ID_REWRITE_DESCRIPTOR];
  return descriptor?.version === 1 ? descriptor : null;
}

function validateStructuralBlockIdRewritePair(
  previousToCurrent: ReadonlyMap<string, string>,
  currentToPrevious: ReadonlyMap<string, string>,
  previousSize: number,
  currentSize: number,
): boolean {
  const forward = readStructuralBlockIdRewriteDescriptor(previousToCurrent);
  const reverse = readStructuralBlockIdRewriteDescriptor(currentToPrevious);
  return (
    forward != null &&
    reverse != null &&
    forward.token === reverse.token &&
    forward.direction === 'previous-to-current' &&
    reverse.direction === 'current-to-previous' &&
    forward.sourceStartIndex === reverse.sourceStartIndex &&
    forward.targetStartIndex === reverse.targetStartIndex &&
    (forward.localRewriteCount ?? 0) === (reverse.localRewriteCount ?? 0) &&
    forward.sourceSize === previousSize &&
    reverse.sourceSize === previousSize &&
    forward.targetSize === currentSize &&
    reverse.targetSize === currentSize &&
    previousToCurrent.size === previousSize - forward.sourceStartIndex + (forward.localRewriteCount ?? 0) &&
    currentToPrevious.size === currentSize - forward.targetStartIndex + (forward.localRewriteCount ?? 0)
  );
}

function buildPageStartKeyIndex(keys: readonly string[]): ReadonlyMap<string, readonly number[]> {
  const index = new Map<string, number[]>();
  keys.forEach((key, pageIndex) => {
    const pages = index.get(key);
    if (pages) pages.push(pageIndex);
    else index.set(key, [pageIndex]);
  });
  return index;
}

function pageContainsAnyBlock(page: Page | undefined, blockIds: readonly string[]): boolean {
  if (!page || blockIds.length === 0) return false;
  const targetIds = new Set(blockIds);
  return page.fragments.some((fragment) => targetIds.has(fragment.blockId));
}

function pageContainsBlock(page: Page | undefined, blockId: string): boolean {
  return page?.fragments.some((fragment) => fragment.blockId === blockId) === true;
}

/**
 * A start-key match alone is not a pagination fixed point. Preserve the
 * complete page-start geometry/carry context used by the proved profile so a
 * matching block id cannot adopt a tail under different margins, columns,
 * numbering, or first-fragment placement.
 */
function pagesShareConvergenceBoundary(
  previous: Page | undefined,
  next: Page | undefined,
  nextToPreviousBlockId: ReadonlyMap<string, string> | null = null,
  ignoreFootnoteReserved = false,
): boolean {
  if (!previous || !next) return false;
  return (
    buildPageConvergenceSignature(previous, null, ignoreFootnoteReserved) ===
    buildPageConvergenceSignature(next, nextToPreviousBlockId, ignoreFootnoteReserved)
  );
}

function findPageConvergenceMismatchField(
  previous: Page,
  next: Page,
  nextToPreviousBlockId: ReadonlyMap<string, string> | null,
  ignoreFootnoteReserved = false,
): string {
  const previousValue = JSON.parse(buildPageConvergenceSignature(previous, null, ignoreFootnoteReserved)) as Record<
    string,
    unknown
  >;
  const nextValue = JSON.parse(
    buildPageConvergenceSignature(next, nextToPreviousBlockId, ignoreFootnoteReserved),
  ) as Record<string, unknown>;
  for (const key of Object.keys(previousValue)) {
    if (JSON.stringify(previousValue[key]) !== JSON.stringify(nextValue[key])) return key;
  }
  return 'unknown';
}

function canRebaseAdoptedPageNumbering(page: Page | undefined, pageIndexDelta: number): boolean {
  if (!page) return false;
  if (pageIndexDelta === 0) return true;
  if (page.pageNumberChapterText != null || page.pageNumberChapterSeparator != null) return false;
  if (page.pageNumberFormat != null && page.pageNumberFormat !== 'decimal') return false;
  if (page.numberText != null && !/^\d+$/.test(page.numberText)) return false;
  return true;
}

function buildPageConvergenceSignature(
  page: Page,
  blockIdRewrite: ReadonlyMap<string, string> | null = null,
  ignoreFootnoteReserved = false,
): string {
  const first = page.fragments[0] as (Fragment & Record<string, unknown>) | undefined;
  return JSON.stringify({
    // Display-number strings are finalized after layoutDocument returns and
    // therefore are not present on the in-progress candidate page. Their
    // dependencies are excluded by the narrow profile above; physical number
    // and section state are the boundary-time numbering proof.
    size: page.size ?? null,
    margins: page.margins ?? null,
    baseMargins: page.baseMargins ?? null,
    columns: page.columns ?? null,
    columnRegions: page.columnRegions ?? null,
    sectionIndex: page.sectionIndex ?? 0,
    sectionRefs: page.sectionRefs ?? null,
    orientation: page.orientation ?? null,
    vAlign: page.vAlign ?? null,
    footnoteReserved: ignoreFootnoteReserved ? null : (page.footnoteReserved ?? 0),
    first: first
      ? {
          kind: first.kind,
          blockId: blockIdRewrite?.get(first.blockId) ?? first.blockId,
          x: first.x,
          y: first.y,
          width: first.width,
          height: first.height ?? null,
          fromLine: first.fromLine ?? null,
          toLine: first.toLine ?? null,
          fromRow: first.fromRow ?? null,
          toRow: first.toRow ?? null,
          columnIndex: first.columnIndex ?? null,
          continuesFromPrev: first.continuesFromPrev === true,
          partialRow: first.partialRow ?? null,
        }
      : null,
  });
}

function readFirstPageBlockId(page: { fragments?: Fragment[] } | undefined): string | null {
  const first = page?.fragments?.[0];
  return typeof first?.blockId === 'string' ? first.blockId : null;
}

function pageStartsAtCleanBlockBoundary(page: { fragments?: Fragment[] } | undefined): boolean {
  const first = page?.fragments?.[0];
  if (!first) return true;
  if ('continuesFromPrev' in first && first.continuesFromPrev === true) return false;
  const fromLine = 'fromLine' in first ? first.fromLine : 0;
  const fromRow = 'fromRow' in first ? first.fromRow : 0;
  const partialRow = 'partialRow' in first ? first.partialRow : undefined;
  return (fromLine ?? 0) === 0 && (fromRow ?? 0) === 0 && partialRow == null;
}

function findSafePartialPageCheckpoint(input: {
  layout: Layout;
  pages: readonly Page[];
  previousBlockId: string;
  currentBlockId: string;
  currentBlockIndexById: ReadonlyMap<string, number>;
  blocks: readonly FlowBlock[];
  expectedPageIndex: number;
  stableBlockIds: ReadonlySet<string>;
  previousToCurrentBlockId: ReadonlyMap<string, string> | null;
}):
  | {
      ok: true;
      checkpoint: LayoutBlockResumeCheckpoint;
      previousBlockId: string;
      prefixFragments: readonly Fragment[];
    }
  | { ok: false; reason: string } {
  const checkpoint = input.layout.blockResumeCheckpoints?.get(input.previousBlockId);
  if (!checkpoint || checkpoint.blockId !== input.previousBlockId) return { ok: false, reason: 'sidecar-missing' };
  if (checkpoint.pageIndex !== input.expectedPageIndex || checkpoint.pageIndex < 0) {
    return { ok: false, reason: 'page-index-mismatch' };
  }
  const page = input.pages[checkpoint.pageIndex];
  if (!page) return { ok: false, reason: 'page-missing' };
  const currentBlockIndex = input.currentBlockIndexById.get(input.currentBlockId);
  if (!Number.isInteger(currentBlockIndex) || input.blocks[currentBlockIndex!]?.kind !== 'paragraph') {
    return { ok: false, reason: 'current-block-not-paragraph' };
  }
  if (
    !Number.isInteger(checkpoint.prefixFragmentCount) ||
    checkpoint.prefixFragmentCount <= 0 ||
    checkpoint.prefixFragmentCount >= page.fragments.length ||
    page.fragments[checkpoint.prefixFragmentCount]?.blockId !== input.previousBlockId
  ) {
    return { ok: false, reason: 'fragment-boundary-mismatch' };
  }
  const dirtyFragment = page.fragments[checkpoint.prefixFragmentCount]!;
  if (
    (dirtyFragment.kind !== 'para' && dirtyFragment.kind !== 'list-item') ||
    dirtyFragment.fromLine !== 0 ||
    dirtyFragment.continuesFromPrev === true
  ) {
    return { ok: false, reason: 'dirty-fragment-not-fresh-paragraph' };
  }
  const prefixFragments = page.fragments.slice(0, checkpoint.prefixFragmentCount);
  // The first block-local resume profile deliberately excludes page-local
  // floats and tables. Their placement registries are not part of this
  // checkpoint yet, so admitting one would manufacture geometry state.
  if (
    prefixFragments.some(
      (fragment) =>
        (fragment.kind !== 'para' && fragment.kind !== 'list-item') ||
        !input.stableBlockIds.has(input.previousToCurrentBlockId?.get(fragment.blockId) ?? fragment.blockId),
    )
  ) {
    return { ok: false, reason: 'prefix-fragment-unsupported-or-unstable' };
  }
  if (
    checkpoint.columnIndex !== 0 ||
    checkpoint.constraintBoundaries.length !== 0 ||
    checkpoint.activeConstraintIndex !== -1 ||
    !Number.isFinite(checkpoint.cursorY) ||
    !Number.isFinite(checkpoint.maxCursorY) ||
    !Number.isFinite(checkpoint.trailingSpacing) ||
    !Number.isFinite(checkpoint.footnoteDemandThisPage) ||
    !Number.isInteger(checkpoint.footnoteRefsThisPage) ||
    checkpoint.footnoteRefsThisPage < 0
  ) {
    return { ok: false, reason: 'paginator-state-invalid-or-multicolumn' };
  }
  return { ok: true, checkpoint, previousBlockId: input.previousBlockId, prefixFragments };
}

function pageContainsOnlyStableBlocks(
  page: { fragments?: Fragment[] } | undefined,
  stableBlockIds: ReadonlySet<string>,
  blockIdRewrite: ReadonlyMap<string, string> | null = null,
  currentBodyBlockIndex: ReadonlyMap<string, number> | null = null,
): boolean {
  const fragments = page?.fragments ?? [];
  return fragments.every((fragment) => {
    if (typeof fragment.blockId !== 'string') return false;
    const blockId = blockIdRewrite?.get(fragment.blockId) ?? fragment.blockId;
    return stableBlockIds.has(blockId) || (currentBodyBlockIndex != null && !currentBodyBlockIndex.has(blockId));
  });
}

function collectFootnoteOutputPageIndexes(
  plan: FootnoteLayoutPlan,
  reservesByPageIndex: readonly number[],
): Set<number> {
  // `ledgersByPage` intentionally includes empty accounting rows for every
  // page. Treating its keys as note output made the supposedly sparse retained
  // hint cover the whole document and prevented a proved tail from adopting
  // unchanged footnote bands.
  const pageIndexes = new Set<number>(plan.slicesByPage.keys());
  reservesByPageIndex.forEach((reserve, pageIndex) => {
    if (reserve > 0) pageIndexes.add(pageIndex);
  });
  return pageIndexes;
}

function collectFootnoteReinjectionPageIndexes(
  pageCount: number,
  currentNotePageIndexes: ReadonlySet<number>,
  previousNotePageIndexes: ReadonlySet<number>,
  tailAdoption: IncrementalLayoutTailAdoption | null,
): Set<number> {
  const pageIndexes = new Set<number>();
  const add = (pageIndex: number): void => {
    if (Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < pageCount) pageIndexes.add(pageIndex);
  };
  currentNotePageIndexes.forEach(add);
  previousNotePageIndexes.forEach((sourcePageIndex) => {
    // Retained prefixes preserve their source index. Keeping the raw index is
    // also harmless for a locally relaid page and avoids guessing the exact
    // prefix boundary from the tail-only adoption descriptor.
    add(sourcePageIndex);
    if (
      tailAdoption &&
      sourcePageIndex >= tailAdoption.sourcePageStartIndex &&
      sourcePageIndex < tailAdoption.sourcePageEndIndexExclusive
    ) {
      add(tailAdoption.startPageIndex + sourcePageIndex - tailAdoption.sourcePageStartIndex);
    }
  });
  return pageIndexes;
}

function createPageSequenceWithReplacements(pages: Page[], replacements: ReadonlyMap<number, Page>): Page[] {
  if (replacements.size === 0) return pages;
  const segments: LazyPageSegment[] = [];
  let sourceStart = 0;
  for (const [pageIndex, replacement] of [...replacements].sort((left, right) => left[0] - right[0])) {
    appendPageSequenceSlice(segments, pages, sourceStart, pageIndex);
    appendPageSequenceSlice(segments, [replacement], 0, 1);
    sourceStart = pageIndex + 1;
  }
  appendPageSequenceSlice(segments, pages, sourceStart, pages.length);
  return createLazyPageSequence(segments);
}

/**
 * A retained body page already contains its source-generation footnote band.
 * Clone only previous/current note pages before the finalizer mutates them,
 * remove fragments outside the current body block plane (the typed
 * note-finalizer class used by the convergence proof), and clear the old band
 * ledger. Sparse replacements retain the lazy prefix/tail descriptor, so the
 * current fixed-point plan can inject one authoritative band without touching
 * retained source objects or materializing unrelated pages.
 */
function prepareRetainedPagesForFootnoteReinjection(
  layout: Layout,
  currentBodyBlockIndex: ReadonlyMap<string, number>,
  pageIndexesToFinalize: ReadonlySet<number>,
  previousToCurrentBlockId: ReadonlyMap<string, string> | null,
): Layout {
  const replacements = new Map<number, Page>();
  for (const pageIndex of pageIndexesToFinalize) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= layout.pages.length) continue;
    const page = layout.pages[pageIndex];
    if (!page) continue;
    const { footnoteLedger: _retainedFootnoteLedger, ...pageWithoutFootnoteLedger } = page;
    replacements.set(pageIndex, {
      ...pageWithoutFootnoteLedger,
      fragments: page.fragments.filter((fragment) => {
        const currentBlockId = previousToCurrentBlockId?.get(fragment.blockId) ?? fragment.blockId;
        return currentBodyBlockIndex.has(currentBlockId);
      }),
    });
  }
  return {
    ...layout,
    pages: createPageSequenceWithReplacements(layout.pages, replacements),
  };
}

function buildPageStartKey(
  page: { fragments?: Fragment[]; sectionIndex?: number } | undefined,
  blockIdRewrite: ReadonlyMap<string, string> | null = null,
): string {
  const fragments = page?.fragments ?? [];
  const first = fragments[0];
  const sectionIndex = readFiniteNumber(page?.sectionIndex) ?? 0;
  if (!first) return `#empty#0#${sectionIndex}#0`;
  const rawBlockId = typeof first.blockId === 'string' ? first.blockId : '#unknown';
  const blockId = blockIdRewrite?.get(rawBlockId) ?? rawBlockId;
  const fromLine = 'fromLine' in first ? readFiniteNumber(first.fromLine) : null;
  const fromRow = 'fromRow' in first ? readFiniteNumber(first.fromRow) : null;
  const carry = 'continuesFromPrev' in first && first.continuesFromPrev === true ? 1 : 0;
  return `${blockId}#${fromLine ?? fromRow ?? 0}#${sectionIndex}#${carry}`;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function* buildBlockByIdSteps(
  blocks: FlowBlock[],
  checkpointEveryBlocks: number | null,
): Generator<LayoutExecutionCheckpoint, ReadonlyMap<string, FlowBlock>, void> {
  const blockById = new Map<string, FlowBlock>();
  for (let index = 0; index < blocks.length; index += 1) {
    if (checkpointEveryBlocks != null && index % checkpointEveryBlocks === 0) {
      yield { phase: 'numbering-context:chapter', index, total: blocks.length };
    }
    const block = blocks[index]!;
    blockById.set(block.id, block);
  }
  return blockById;
}

function drainNumberingSteps<T>(steps: Generator<LayoutExecutionCheckpoint, T, void>): T {
  while (true) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

async function drainNumberingStepsCooperatively<T>(
  steps: Generator<LayoutExecutionCheckpoint, T, void>,
  execution: LayoutExecutionControl,
): Promise<T> {
  try {
    while (true) {
      const step = steps.next();
      if (step.done) return step.value;
      await checkpointLayoutExecution(execution, step.value);
    }
  } finally {
    steps.return?.(undefined as never);
  }
}

function buildBlockById(blocks: FlowBlock[]): ReadonlyMap<string, FlowBlock> {
  return drainNumberingSteps(buildBlockByIdSteps(blocks, null));
}

function buildBlockByIdCooperatively(
  blocks: FlowBlock[],
  execution: LayoutExecutionControl,
): Promise<ReadonlyMap<string, FlowBlock>> {
  return drainNumberingStepsCooperatively(
    buildBlockByIdSteps(blocks, Math.max(1, Math.floor(execution.checkpointEveryBlocks ?? 16))),
    execution,
  );
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

function* buildChapterContextSignatureSteps(
  layout: Layout,
  checkpointEveryBlocks: number | null,
): Generator<LayoutExecutionCheckpoint, string, void> {
  let signature = '';
  let fragmentOrdinal = 0;
  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    if (checkpointEveryBlocks != null && pageIndex % checkpointEveryBlocks === 0) {
      yield { phase: 'numbering-context:chapter', index: pageIndex, total: layout.pages.length };
    }
    const page = layout.pages[pageIndex]!;
    const fragmentBlockIds: string[] = [];
    for (const fragment of page.fragments) {
      if (checkpointEveryBlocks != null && fragmentOrdinal % checkpointEveryBlocks === 0) {
        yield { phase: 'numbering-context:chapter', index: fragmentOrdinal };
      }
      fragmentOrdinal += 1;
      fragmentBlockIds.push(getFragmentBlockId(fragment));
    }
    const pageSignature = [page.number, page.sectionIndex ?? 0, page.fragments.length, fragmentBlockIds.join(',')].join(
      ':',
    );
    signature += `${pageIndex === 0 ? '' : '|'}${pageSignature}`;
  }
  return signature;
}

function buildChapterContextSignature(layout: Layout): string {
  return drainNumberingSteps(buildChapterContextSignatureSteps(layout, null));
}

function buildChapterContextSignatureCooperatively(layout: Layout, execution: LayoutExecutionControl): Promise<string> {
  return drainNumberingStepsCooperatively(
    buildChapterContextSignatureSteps(layout, Math.max(1, Math.floor(execution.checkpointEveryBlocks ?? 16))),
    execution,
  );
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

function* buildConservativePrelayoutPageResolverSteps(
  blocks: FlowBlock[],
  sections: SectionMetadata[],
  checkpointEveryBlocks: number | null,
): Generator<LayoutExecutionCheckpoint, PageResolver | undefined, void> {
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

  for (let sectionOrdinal = 0; sectionOrdinal < sections.length; sectionOrdinal += 1) {
    if (checkpointEveryBlocks != null && sectionOrdinal % checkpointEveryBlocks === 0) {
      yield { phase: 'numbering-context:chapter', index: sectionOrdinal, total: sections.length };
    }
    const section = sections[sectionOrdinal]!;
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

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      if (checkpointEveryBlocks != null && blockIndex % checkpointEveryBlocks === 0) {
        yield { phase: 'numbering-context:chapter', index: blockIndex, total: blocks.length };
      }
      const block = blocks[blockIndex]!;
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

function buildConservativePrelayoutPageResolver(
  blocks: FlowBlock[],
  sections: SectionMetadata[],
): PageResolver | undefined {
  return drainNumberingSteps(buildConservativePrelayoutPageResolverSteps(blocks, sections, null));
}

function buildConservativePrelayoutPageResolverCooperatively(
  blocks: FlowBlock[],
  sections: SectionMetadata[],
  execution: LayoutExecutionControl,
): Promise<PageResolver | undefined> {
  return drainNumberingStepsCooperatively(
    buildConservativePrelayoutPageResolverSteps(
      blocks,
      sections,
      Math.max(1, Math.floor(execution.checkpointEveryBlocks ?? 16)),
    ),
    execution,
  );
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

async function getChapterContextByPageCooperatively(
  layout: Layout,
  sections: SectionMetadata[],
  blockById: ReadonlyMap<string, FlowBlock>,
  cache: ChapterContextCache,
  execution: LayoutExecutionControl,
): Promise<Map<number, ChapterPageInfo> | undefined> {
  if (!sectionsHaveChapterNumbering(sections)) {
    return undefined;
  }

  const signature = await buildChapterContextSignatureCooperatively(layout, execution);
  if (cache.signature === signature && cache.context) {
    return cache.context;
  }

  const context = await buildChapterContextByPageCooperatively(layout, blockById, sections, execution);
  cache.signature = signature;
  cache.context = context;
  return context;
}

function* applyNumberingContextToLayoutSteps(
  layout: Layout,
  numberingCtx: NumberingContext,
  reuse?: IncrementalLayoutReuseSummary,
  checkpointEveryBlocks: number | null = null,
): Generator<LayoutExecutionCheckpoint, void, void> {
  for (let pageIndex = 0; pageIndex < layout.pages.length; pageIndex += 1) {
    if (checkpointEveryBlocks != null && pageIndex % checkpointEveryBlocks === 0) {
      yield { phase: 'numbering-context:page', index: pageIndex, total: layout.pages.length };
    }
    // Retained pages preserve their source-generation object/metadata. Their
    // current physical/display numbering is applied by the localized resolved
    // page materializer; mutating them here would corrupt the last-good state.
    if (
      (reuse?.checkpointPageIndex != null && pageIndex < reuse.checkpointPageIndex) ||
      (reuse?.tailAdoption != null &&
        pageIndex >= reuse.tailAdoption.startPageIndex &&
        pageIndex < reuse.tailAdoption.endPageIndexExclusive)
    ) {
      continue;
    }
    const page = layout.pages[pageIndex]!;
    const displayInfo = numberingCtx.displayPages[pageIndex];
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

function applyNumberingContextToLayout(
  layout: Layout,
  numberingCtx: NumberingContext,
  reuse?: IncrementalLayoutReuseSummary,
): void {
  drainNumberingSteps(applyNumberingContextToLayoutSteps(layout, numberingCtx, reuse));
}

function applyNumberingContextToLayoutCooperatively(
  layout: Layout,
  numberingCtx: NumberingContext,
  reuse: IncrementalLayoutReuseSummary | undefined,
  execution: LayoutExecutionControl,
): Promise<void> {
  return drainNumberingStepsCooperatively(
    applyNumberingContextToLayoutSteps(
      layout,
      numberingCtx,
      reuse,
      Math.max(1, Math.floor(execution.checkpointEveryBlocks ?? 16)),
    ),
    execution,
  );
}

function* applyLocalizedSectionNumberingSteps(
  layout: Layout,
  reuse: IncrementalLayoutReuseSummary,
  sections: readonly SectionMetadata[],
  checkpointEveryBlocks: number | null,
): Generator<LayoutExecutionCheckpoint, void, void> {
  const startPageIndex = reuse.checkpointPageIndex ?? 0;
  const endPageIndexExclusive = reuse.tailAdoption?.startPageIndex ?? layout.pages.length;
  const sectionByIndex = new Map<number, SectionMetadata>();
  for (let sectionOrdinal = 0; sectionOrdinal < sections.length; sectionOrdinal += 1) {
    if (checkpointEveryBlocks != null && sectionOrdinal % checkpointEveryBlocks === 0) {
      yield { phase: 'numbering-context:page', index: sectionOrdinal, total: sections.length };
    }
    const section = sections[sectionOrdinal]!;
    sectionByIndex.set(section.sectionIndex, section);
  }
  let priorSectionIndex: number | null = null;
  let sectionPageNumber = 0;
  let displayNumber = 0;
  for (let pageIndex = 0; pageIndex < endPageIndexExclusive; pageIndex += 1) {
    if (checkpointEveryBlocks != null && pageIndex % checkpointEveryBlocks === 0) {
      yield { phase: 'numbering-context:page', index: pageIndex, total: endPageIndexExclusive };
    }
    const page = layout.pages[pageIndex];
    if (!page) continue;
    const sectionIndex = page.sectionIndex ?? 0;
    const numbering = sectionByIndex.get(sectionIndex)?.numbering;
    const sectionStart = numbering?.start;
    const pageFormat = numbering?.format ?? 'decimal';
    sectionPageNumber = priorSectionIndex == null || sectionIndex !== priorSectionIndex ? 1 : sectionPageNumber + 1;
    displayNumber =
      priorSectionIndex == null
        ? (sectionStart ?? 1)
        : sectionIndex !== priorSectionIndex && sectionStart != null
          ? sectionStart
          : displayNumber + 1;
    priorSectionIndex = sectionIndex;
    if (pageIndex < startPageIndex) continue;
    page.number = pageIndex + 1;
    page.sectionPageNumber = sectionPageNumber;
    page.numberText = formatSectionPageNumberText({ displayNumber, pageFormat });
    page.displayNumber = displayNumber;
    page.pageNumberFormat = pageFormat;
    page.pageNumberChapterText = undefined;
    page.pageNumberChapterSeparator = undefined;
  }
}

function applyLocalizedSectionNumbering(
  layout: Layout,
  reuse: IncrementalLayoutReuseSummary,
  sections: readonly SectionMetadata[],
): void {
  drainNumberingSteps(applyLocalizedSectionNumberingSteps(layout, reuse, sections, null));
}

function applyLocalizedSectionNumberingCooperatively(
  layout: Layout,
  reuse: IncrementalLayoutReuseSummary,
  sections: readonly SectionMetadata[],
  execution: LayoutExecutionControl,
): Promise<void> {
  return drainNumberingStepsCooperatively(
    applyLocalizedSectionNumberingSteps(
      layout,
      reuse,
      sections,
      Math.max(1, Math.floor(execution.checkpointEveryBlocks ?? 16)),
    ),
    execution,
  );
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
  const displayPages = computeDisplayPageNumber(layout.pages, sections, chapterInfoByPage).map(
    (displayPage, pageIndex) => ({
      ...displayPage,
      // An adopted source page can move to a different target index. Physical
      // page identity belongs to the target layout array, not the retained
      // Page.number value, which remains source-generation metadata until a
      // mounted page is materialized.
      physicalPage: pageIndex + 1,
      pageFormat: sectionByIndex.get(displayPage.sectionIndex)?.numbering?.format ?? 'decimal',
    }),
  );

  return {
    totalPages,
    displayPages,
  };
}

async function buildNumberingContextCooperatively(
  layout: Layout,
  sections: SectionMetadata[],
  blockById: ReadonlyMap<string, FlowBlock>,
  chapterContextCache: ChapterContextCache,
  execution: LayoutExecutionControl,
): Promise<NumberingContext> {
  const totalPages = layout.pages.length;
  const chapterInfoByPage = await getChapterContextByPageCooperatively(
    layout,
    sections,
    blockById,
    chapterContextCache,
    execution,
  );
  const checkpointEveryBlocks = Math.max(1, Math.floor(execution.checkpointEveryBlocks ?? 16));
  const sectionByIndex = new Map<number, SectionMetadata>();
  for (let sectionOrdinal = 0; sectionOrdinal < sections.length; sectionOrdinal += 1) {
    if (sectionOrdinal % checkpointEveryBlocks === 0) {
      await checkpointLayoutExecution(execution, {
        phase: 'numbering-context:page',
        index: sectionOrdinal,
        total: sections.length,
      });
    }
    const section = sections[sectionOrdinal]!;
    sectionByIndex.set(section.sectionIndex, section);
  }

  const computedDisplayPages = await computeDisplayPageNumberCooperatively(
    layout.pages,
    sections,
    chapterInfoByPage,
    execution,
  );
  const displayPages: NumberingContext['displayPages'] = [];
  for (let pageIndex = 0; pageIndex < computedDisplayPages.length; pageIndex += 1) {
    if (pageIndex % checkpointEveryBlocks === 0) {
      await checkpointLayoutExecution(execution, {
        phase: 'numbering-context:page',
        index: pageIndex,
        total: computedDisplayPages.length,
      });
    }
    const displayPage = computedDisplayPages[pageIndex]!;
    displayPages.push({
      ...displayPage,
      physicalPage: pageIndex + 1,
      pageFormat: sectionByIndex.get(displayPage.sectionIndex)?.numbering?.format ?? 'decimal',
    });
  }

  return { totalPages, displayPages };
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
  execution?: LayoutExecutionControl,
): Promise<Measure[]> {
  const updatedMeasures: Measure[] = [...measures];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Only re-measure affected blocks
    if (!affectedBlockIds.has(block.id)) {
      continue;
    }

    if (execution) {
      await checkpointLayoutExecution(execution, { phase: 'page-token:prepare', index: i, total: blocks.length });
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
      throwIfLayoutExecutionAborted(execution);
      // Error handling per plan: log warning, keep prior layout for block
      console.warn(`[incrementalLayout] Failed to re-measure block ${block.id} after token resolution:`, error);
      // Keep the old measure - don't update updatedMeasures[i]
    }
  }

  return updatedMeasures;
}
