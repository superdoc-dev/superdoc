import type { FootnotePageLedger, Layout } from '@superdoc/contracts';

export type FootnoteWindowScoreReason =
  | 'globally-safe'
  | 'cluster-spill'
  | 'new-mandatory-only'
  | 'candidate-not-improved'
  | 'page-count-grew'
  | 'dead-reserve-bloat';

export type FootnotePreferredReserveCandidate = {
  pageIndex: number;
  anchorIds: string[];
  mandatoryReservePx: number;
  preferredReservePx: number;
  reserveDeltaPx: number;
  actualBandHeightPx: number;
  lastAnchorRenderedLines: number;
};

export type FootnoteWindowStats = {
  totalPages: number;
  mandatoryOnlyCount: number;
  deadReserveSum: number;
  clusterSplitCount: number;
  candidateRenderedLines?: number;
  /**
   * Analyzer-only metric. Runtime layout does not know the Word baseline, but
   * the scorer can carry this when a caller has external alignment data.
   */
  driftEvents?: number;
};

export type FootnoteWindowScoreInput = {
  beforeLayout: Layout;
  afterLayout: Layout;
  candidatePageIndex: number;
  candidateAnchorId?: string;
  beforeLedger: FootnotePageLedger[];
  afterLedger: FootnotePageLedger[];
  windowAhead?: number;
  preferredDeltaThresholdPx?: number;
  mandatoryOnlyTolerancePx?: number;
  deadReserveBloatThresholdPx?: number;
  wholeDocumentDeadReserveBloatThresholdPx?: number;
};

export type FootnoteWindowScoreResult = {
  accept: boolean;
  reason: FootnoteWindowScoreReason;
  before: FootnoteWindowStats;
  after: FootnoteWindowStats;
};

type FootnoteLedgerDiagnostics = {
  mandatoryOnlyCount: number;
  mandatoryOnlyAnchorIds: Set<string>;
  deadReserveSum: number;
  clusterSplitCount: number;
  clusterSplitAnchorIds: Set<string>;
};

const DEFAULT_WINDOW_AHEAD = 3;
const DEFAULT_PREFERRED_DELTA_THRESHOLD_PX = 8;
const DEFAULT_MANDATORY_ONLY_TOLERANCE_PX = 2;
const DEFAULT_DEAD_RESERVE_BLOAT_THRESHOLD_PX = 128;
const DEFAULT_WHOLE_DOCUMENT_DEAD_RESERVE_BLOAT_THRESHOLD_PX = 128;
const FULL_ANCHOR_RENDER_SENTINEL = Number.MAX_SAFE_INTEGER;
const DEFAULT_TRIAL_TARGET_COUNT = 12;

export const isMandatoryOnlyFootnotePage = (
  ledger: FootnotePageLedger,
  preferredDeltaThresholdPx = DEFAULT_PREFERRED_DELTA_THRESHOLD_PX,
  mandatoryOnlyTolerancePx = DEFAULT_MANDATORY_ONLY_TOLERANCE_PX,
): boolean => {
  if (ledger.anchorIds.length === 0) return false;
  return (
    Math.abs(ledger.actualBandHeightPx - ledger.mandatoryReservePx) <= mandatoryOnlyTolerancePx &&
    ledger.preferredReservePx - ledger.mandatoryReservePx > preferredDeltaThresholdPx &&
    ledger.lastAnchorRenderedLines <= 1
  );
};

/**
 * SD-2656 (post-Vivienne-feedback): a page whose LAST anchor partially rendered
 * but spilled to a later page. The user-visible bug is a footnote split across
 * pages even when the preferred reserve would fit the whole anchor on the
 * anchor page (Word does keep it together).
 *
 * The "mandatory-only" predicate catches first-line-only splits; this predicate
 * catches partial splits (lastAnchorRenderedLines > 1 but the rest still spilled).
 * Both feed into the same scorer trial. The scorer's accept criteria
 * (no new cluster spills, no new mandatory-only pages, bounded dead-reserve
 * growth, candidate rendered lines improved) still gates whether the bump
 * actually lands.
 */
export const isSplitLastAnchorFootnotePage = (
  ledger: FootnotePageLedger,
  preferredDeltaThresholdPx = DEFAULT_PREFERRED_DELTA_THRESHOLD_PX,
): boolean => {
  if (ledger.anchorIds.length === 0) return false;
  const lastAnchorId = ledger.anchorIds[ledger.anchorIds.length - 1];
  const lastAnchorSpilled = ledger.continuationOut.some((entry) => entry.id === lastAnchorId);
  if (!lastAnchorSpilled) return false;
  return (
    ledger.preferredReservePx - ledger.mandatoryReservePx > preferredDeltaThresholdPx &&
    ledger.actualBandHeightPx < ledger.preferredReservePx - preferredDeltaThresholdPx
  );
};

export const getPreferredReserveCandidates = (
  ledgers: FootnotePageLedger[],
  preferredDeltaThresholdPx = DEFAULT_PREFERRED_DELTA_THRESHOLD_PX,
  mandatoryOnlyTolerancePx = DEFAULT_MANDATORY_ONLY_TOLERANCE_PX,
): FootnotePreferredReserveCandidate[] => {
  return ledgers
    .filter(
      (ledger) =>
        isMandatoryOnlyFootnotePage(ledger, preferredDeltaThresholdPx, mandatoryOnlyTolerancePx) ||
        isSplitLastAnchorFootnotePage(ledger, preferredDeltaThresholdPx),
    )
    .map((ledger) => ({
      pageIndex: ledger.pageIndex,
      anchorIds: ledger.anchorIds.slice(),
      mandatoryReservePx: ledger.mandatoryReservePx,
      preferredReservePx: ledger.preferredReservePx,
      reserveDeltaPx: ledger.preferredReservePx - ledger.mandatoryReservePx,
      actualBandHeightPx: ledger.actualBandHeightPx,
      lastAnchorRenderedLines: ledger.lastAnchorRenderedLines,
    }));
};

export const getPreferredReserveTrialTargets = (
  candidate: FootnotePreferredReserveCandidate,
  currentReservePx: number,
  preferredDeltaThresholdPx = DEFAULT_PREFERRED_DELTA_THRESHOLD_PX,
  maxTargets = DEFAULT_TRIAL_TARGET_COUNT,
): number[] => {
  const current = Number.isFinite(currentReservePx) ? Math.max(0, currentReservePx) : 0;
  const floor = Math.max(current, candidate.mandatoryReservePx);
  const ceiling = Math.max(floor, candidate.preferredReservePx);
  const delta = ceiling - floor;
  if (delta <= preferredDeltaThresholdPx) return [];

  const targets = new Set<number>();
  const addTarget = (value: number) => {
    if (!Number.isFinite(value)) return;
    const rounded = Math.ceil(Math.max(floor, Math.min(ceiling, value)));
    if (rounded - floor > preferredDeltaThresholdPx) targets.add(rounded);
  };

  // Try full preferred first, then smaller partial reserves. Full preferred is
  // Word-like when safe, but large legal footnotes often need an intermediate
  // target: more than firstLine, less than the whole last footnote.
  [1, 0.75, 0.5, 0.33, 0.25, 0.15].forEach((fraction) => addTarget(floor + delta * fraction));
  [96, 72, 48, 24, 12].forEach((px) => addTarget(floor + Math.min(delta, px)));

  return Array.from(targets)
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, maxTargets));
};

export const collectFootnoteLedgers = (layout: Layout): FootnotePageLedger[] => {
  return layout.pages.flatMap((page) => (page.footnoteLedger ? [page.footnoteLedger] : []));
};

const getWindowBounds = (layout: Layout, candidatePageIndex: number, windowAhead: number) => ({
  windowStart: Math.max(0, candidatePageIndex),
  windowEnd: Math.min(layout.pages.length - 1, candidatePageIndex + Math.max(0, windowAhead)),
});

const getDocumentBounds = (layout: Layout) => ({
  windowStart: 0,
  windowEnd: Math.max(0, layout.pages.length - 1),
});

const isInWindow = (ledger: FootnotePageLedger, windowStart: number, windowEnd: number) =>
  ledger.pageIndex >= windowStart && ledger.pageIndex <= windowEnd;

const getLastAnchorId = (ledger: FootnotePageLedger | undefined): string | undefined => {
  if (!ledger || ledger.anchorIds.length === 0) return undefined;
  return ledger.anchorIds[ledger.anchorIds.length - 1];
};

const collectLedgerDiagnostics = (
  ledgers: FootnotePageLedger[],
  windowStart: number,
  windowEnd: number,
  preferredDeltaThresholdPx: number,
  mandatoryOnlyTolerancePx: number,
): FootnoteLedgerDiagnostics => {
  const diagnostics: FootnoteLedgerDiagnostics = {
    mandatoryOnlyCount: 0,
    mandatoryOnlyAnchorIds: new Set<string>(),
    deadReserveSum: 0,
    clusterSplitCount: 0,
    clusterSplitAnchorIds: new Set<string>(),
  };

  for (const ledger of ledgers) {
    if (!isInWindow(ledger, windowStart, windowEnd)) continue;

    diagnostics.deadReserveSum += Math.max(0, ledger.deadReservePx);

    if (isMandatoryOnlyFootnotePage(ledger, preferredDeltaThresholdPx, mandatoryOnlyTolerancePx)) {
      diagnostics.mandatoryOnlyCount += 1;
      const id = getLastAnchorId(ledger);
      if (id) diagnostics.mandatoryOnlyAnchorIds.add(id);
    }

    const anchorIds = new Set(ledger.anchorIds);
    let splitsCurrentAnchorCluster = false;
    for (const entry of ledger.continuationOut) {
      if (!anchorIds.has(entry.id)) continue;
      diagnostics.clusterSplitAnchorIds.add(entry.id);
      splitsCurrentAnchorCluster = true;
    }
    if (splitsCurrentAnchorCluster) diagnostics.clusterSplitCount += 1;
  }

  return diagnostics;
};

const hasNewId = (after: Set<string>, before: Set<string>): boolean => {
  for (const id of after) {
    if (!before.has(id)) return true;
  }
  return false;
};

const getCandidateRenderedLines = (
  ledgers: FootnotePageLedger[],
  candidateAnchorId: string | undefined,
): number | undefined => {
  if (!candidateAnchorId) return undefined;

  const anchorLedger = ledgers.find((ledger) => ledger.anchorIds.includes(candidateAnchorId));
  if (!anchorLedger) return undefined;

  const lastAnchorId = getLastAnchorId(anchorLedger);
  if (lastAnchorId === candidateAnchorId) return anchorLedger.lastAnchorRenderedLines;

  // If the candidate is no longer the last anchor on its page, the mandatory
  // rule requires it to be rendered fully before the new last anchor receives
  // only its first line. Treat that as a direct improvement over first-line
  // rendering while still letting continuationOut checks catch impossible
  // split states elsewhere.
  return FULL_ANCHOR_RENDER_SENTINEL;
};

const candidateRenderedLinesImproved = (before: FootnoteWindowStats, after: FootnoteWindowStats): boolean =>
  typeof before.candidateRenderedLines === 'number' &&
  typeof after.candidateRenderedLines === 'number' &&
  after.candidateRenderedLines > before.candidateRenderedLines;

export const summarizeFootnoteWindow = (
  layout: Layout,
  ledgers: FootnotePageLedger[],
  candidatePageIndex: number,
  windowAhead = DEFAULT_WINDOW_AHEAD,
  preferredDeltaThresholdPx = DEFAULT_PREFERRED_DELTA_THRESHOLD_PX,
  mandatoryOnlyTolerancePx = DEFAULT_MANDATORY_ONLY_TOLERANCE_PX,
  candidateAnchorId?: string,
): FootnoteWindowStats => {
  const { windowStart, windowEnd } = getWindowBounds(layout, candidatePageIndex, windowAhead);
  const diagnostics = collectLedgerDiagnostics(
    ledgers,
    windowStart,
    windowEnd,
    preferredDeltaThresholdPx,
    mandatoryOnlyTolerancePx,
  );

  return {
    totalPages: layout.pages.length,
    mandatoryOnlyCount: diagnostics.mandatoryOnlyCount,
    deadReserveSum: diagnostics.deadReserveSum,
    // A current-page anchor split is a continuation created by the page's own
    // anchor cluster. Continuation-in from prior pages is tracked separately and
    // is not counted here as a newly introduced split.
    clusterSplitCount: diagnostics.clusterSplitCount,
    candidateRenderedLines: getCandidateRenderedLines(ledgers, candidateAnchorId),
  };
};

export const scoreFootnoteWindow = (input: FootnoteWindowScoreInput): FootnoteWindowScoreResult => {
  const windowAhead = input.windowAhead ?? DEFAULT_WINDOW_AHEAD;
  const preferredDeltaThresholdPx = input.preferredDeltaThresholdPx ?? DEFAULT_PREFERRED_DELTA_THRESHOLD_PX;
  const mandatoryOnlyTolerancePx = input.mandatoryOnlyTolerancePx ?? DEFAULT_MANDATORY_ONLY_TOLERANCE_PX;
  const deadReserveBloatThresholdPx = input.deadReserveBloatThresholdPx ?? DEFAULT_DEAD_RESERVE_BLOAT_THRESHOLD_PX;
  const wholeDocumentDeadReserveBloatThresholdPx =
    input.wholeDocumentDeadReserveBloatThresholdPx ?? DEFAULT_WHOLE_DOCUMENT_DEAD_RESERVE_BLOAT_THRESHOLD_PX;
  const beforeCandidateLedger = input.beforeLedger.find((ledger) => ledger.pageIndex === input.candidatePageIndex);
  const candidateAnchorId = input.candidateAnchorId ?? getLastAnchorId(beforeCandidateLedger);

  const before = summarizeFootnoteWindow(
    input.beforeLayout,
    input.beforeLedger,
    input.candidatePageIndex,
    windowAhead,
    preferredDeltaThresholdPx,
    mandatoryOnlyTolerancePx,
    candidateAnchorId,
  );
  const after = summarizeFootnoteWindow(
    input.afterLayout,
    input.afterLedger,
    input.candidatePageIndex,
    windowAhead,
    preferredDeltaThresholdPx,
    mandatoryOnlyTolerancePx,
    candidateAnchorId,
  );
  const beforeBounds = getWindowBounds(input.beforeLayout, input.candidatePageIndex, windowAhead);
  const afterBounds = getWindowBounds(input.afterLayout, input.candidatePageIndex, windowAhead);
  const beforeWindowDiagnostics = collectLedgerDiagnostics(
    input.beforeLedger,
    beforeBounds.windowStart,
    beforeBounds.windowEnd,
    preferredDeltaThresholdPx,
    mandatoryOnlyTolerancePx,
  );
  const afterWindowDiagnostics = collectLedgerDiagnostics(
    input.afterLedger,
    afterBounds.windowStart,
    afterBounds.windowEnd,
    preferredDeltaThresholdPx,
    mandatoryOnlyTolerancePx,
  );
  const beforeDocumentBounds = getDocumentBounds(input.beforeLayout);
  const afterDocumentBounds = getDocumentBounds(input.afterLayout);
  const beforeDocumentDiagnostics = collectLedgerDiagnostics(
    input.beforeLedger,
    beforeDocumentBounds.windowStart,
    beforeDocumentBounds.windowEnd,
    preferredDeltaThresholdPx,
    mandatoryOnlyTolerancePx,
  );
  const afterDocumentDiagnostics = collectLedgerDiagnostics(
    input.afterLedger,
    afterDocumentBounds.windowStart,
    afterDocumentBounds.windowEnd,
    preferredDeltaThresholdPx,
    mandatoryOnlyTolerancePx,
  );

  // SD-2656 (Vivienne feedback): a trial that ELIMINATES a cluster split is a
  // direct user-visible win. Trade a larger dead-reserve growth for fewer
  // footnotes splitting across pages. Without this relaxation the scorer
  // accepts a smaller partial bump that improves mandatory-only count but
  // leaves the split intact — the user sees no change.
  const eliminatesSplitInWindow = beforeWindowDiagnostics.clusterSplitCount > afterWindowDiagnostics.clusterSplitCount;
  const eliminatesSplitInDoc = beforeDocumentDiagnostics.clusterSplitCount > afterDocumentDiagnostics.clusterSplitCount;

  if (after.totalPages > before.totalPages) {
    // SD-2656 (post-Vivienne+Carlsbad p43): allow exactly +1 page when the
    // trial eliminates a doc-level cluster split. Mirrors Word's behavior of
    // growing the document by one page to keep a footnote together when body
    // content is densely packed. Larger growth caps measured no improvement
    // on Carlsbad (4 remaining splits hit other gates regardless).
    const grewByOne = after.totalPages === before.totalPages + 1;
    if (!(grewByOne && eliminatesSplitInDoc)) {
      return { accept: false, reason: 'page-count-grew', before, after };
    }
  }
  if (
    after.clusterSplitCount > before.clusterSplitCount ||
    hasNewId(afterWindowDiagnostics.clusterSplitAnchorIds, beforeWindowDiagnostics.clusterSplitAnchorIds)
  ) {
    return { accept: false, reason: 'cluster-spill', before, after };
  }
  if (
    afterDocumentDiagnostics.clusterSplitAnchorIds.size > beforeDocumentDiagnostics.clusterSplitAnchorIds.size ||
    hasNewId(afterDocumentDiagnostics.clusterSplitAnchorIds, beforeDocumentDiagnostics.clusterSplitAnchorIds)
  ) {
    return { accept: false, reason: 'cluster-spill', before, after };
  }
  if (hasNewId(afterWindowDiagnostics.mandatoryOnlyAnchorIds, beforeWindowDiagnostics.mandatoryOnlyAnchorIds)) {
    return { accept: false, reason: 'new-mandatory-only', before, after };
  }
  if (hasNewId(afterDocumentDiagnostics.mandatoryOnlyAnchorIds, beforeDocumentDiagnostics.mandatoryOnlyAnchorIds)) {
    return { accept: false, reason: 'new-mandatory-only', before, after };
  }
  const windowDeadAllowance = eliminatesSplitInWindow ? deadReserveBloatThresholdPx * 2 : deadReserveBloatThresholdPx;
  const docDeadAllowance = eliminatesSplitInDoc
    ? wholeDocumentDeadReserveBloatThresholdPx * 2
    : wholeDocumentDeadReserveBloatThresholdPx;

  if (after.deadReserveSum > before.deadReserveSum + windowDeadAllowance) {
    return { accept: false, reason: 'dead-reserve-bloat', before, after };
  }
  if (afterDocumentDiagnostics.deadReserveSum > beforeDocumentDiagnostics.deadReserveSum + docDeadAllowance) {
    return { accept: false, reason: 'dead-reserve-bloat', before, after };
  }
  if (!candidateRenderedLinesImproved(before, after)) {
    return { accept: false, reason: 'candidate-not-improved', before, after };
  }

  return { accept: true, reason: 'globally-safe', before, after };
};
