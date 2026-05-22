import { describe, expect, it } from 'vitest';
import type { FootnotePageLedger, Layout } from '@superdoc/contracts';
import {
  getPreferredReserveCandidates,
  getPreferredReserveTrialTargets,
  scoreFootnoteWindow,
  summarizeFootnoteWindow,
} from '../src/footnote-scorer';

const makeLedger = (pageIndex: number, overrides: Partial<FootnotePageLedger> = {}): FootnotePageLedger => ({
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
  ...overrides,
});

const makeLayout = (pageCount: number, ledgers: FootnotePageLedger[]): Layout =>
  ({
    pages: Array.from({ length: pageCount }, (_, pageIndex) => ({
      number: pageIndex + 1,
      fragments: [],
      footnoteLedger: ledgers.find((ledger) => ledger.pageIndex === pageIndex),
    })),
  }) as Layout;

describe('SD-2656 footnote preferred-reserve scorer', () => {
  it('selects only mandatory-only pages as preferred-reserve candidates', () => {
    const ledgers = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
      makeLedger(1, {
        anchorIds: ['2'],
        mandatoryReservePx: 44,
        preferredReservePx: 96,
        actualBandHeightPx: 72,
        lastAnchorRenderedLines: 3,
      }),
      makeLedger(2, {
        anchorIds: ['3'],
        mandatoryReservePx: 40,
        preferredReservePx: 44,
        actualBandHeightPx: 40,
        lastAnchorRenderedLines: 1,
      }),
    ];

    expect(getPreferredReserveCandidates(ledgers)).toEqual([
      {
        pageIndex: 0,
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        reserveDeltaPx: 85,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      },
    ]);
  });

  it('summarizes only the candidate page window', () => {
    const ledgers = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        deadReservePx: 0,
        lastAnchorRenderedLines: 1,
      }),
      makeLedger(4, {
        anchorIds: ['9'],
        mandatoryReservePx: 36,
        preferredReservePx: 140,
        actualBandHeightPx: 36,
        deadReservePx: 50,
        lastAnchorRenderedLines: 1,
      }),
    ];

    expect(summarizeFootnoteWindow(makeLayout(5, ledgers), ledgers, 0, 1)).toMatchObject({
      totalPages: 5,
      mandatoryOnlyCount: 1,
      deadReserveSum: 0,
      clusterSplitCount: 0,
    });
  });

  it('creates partial preferred-reserve targets when full preferred may be unsafe', () => {
    const [candidate] = getPreferredReserveCandidates([
      makeLedger(0, {
        anchorIds: ['17', '18', '19'],
        mandatoryReservePx: 133,
        preferredReservePx: 601,
        actualBandHeightPx: 133,
        lastAnchorRenderedLines: 1,
      }),
    ]);

    const targets = getPreferredReserveTrialTargets(candidate, 133);

    expect(targets[0]).toBe(601);
    expect(targets).toContain(367);
    expect(targets).toContain(229);
    expect(targets.every((target) => target > 133 && target <= 601)).toBe(true);
  });

  it('accepts a trial only when it reduces mandatory-only pages without growing pages or slack', () => {
    const beforeLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];
    const afterLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 121,
        lastAnchorRenderedLines: 8,
      }),
    ];

    const result = scoreFootnoteWindow({
      beforeLayout: makeLayout(1, beforeLedger),
      afterLayout: makeLayout(1, afterLedger),
      candidatePageIndex: 0,
      beforeLedger,
      afterLedger,
    });

    expect(result.accept).toBe(true);
    expect(result.reason).toBe('globally-safe');
    expect(result.before.mandatoryOnlyCount).toBe(1);
    expect(result.after.mandatoryOnlyCount).toBe(0);
  });

  it('rejects a trial that grows page count even if the candidate page improves', () => {
    const beforeLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];
    const afterLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 121,
        lastAnchorRenderedLines: 8,
      }),
    ];

    const result = scoreFootnoteWindow({
      beforeLayout: makeLayout(1, beforeLedger),
      afterLayout: makeLayout(2, afterLedger),
      candidatePageIndex: 0,
      beforeLedger,
      afterLedger,
    });

    expect(result.accept).toBe(false);
    expect(result.reason).toBe('page-count-grew');
  });

  it('accepts a direct candidate-line improvement without requiring unrelated pages to change', () => {
    const beforeLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
      makeLedger(1, {
        anchorIds: ['2'],
        mandatoryReservePx: 36,
        preferredReservePx: 75,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];
    const afterLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 75,
        lastAnchorRenderedLines: 4,
      }),
      makeLedger(1, {
        anchorIds: ['2'],
        mandatoryReservePx: 36,
        preferredReservePx: 75,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];

    const result = scoreFootnoteWindow({
      beforeLayout: makeLayout(2, beforeLedger),
      afterLayout: makeLayout(2, afterLedger),
      candidatePageIndex: 0,
      candidateAnchorId: '1',
      beforeLedger,
      afterLedger,
    });

    expect(result.accept).toBe(true);
    expect(result.reason).toBe('globally-safe');
    expect(result.before.candidateRenderedLines).toBe(1);
    expect(result.after.candidateRenderedLines).toBe(4);
  });

  it('rejects a direct candidate improvement that creates a new mandatory-only anchor', () => {
    const beforeLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];
    const afterLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 75,
        lastAnchorRenderedLines: 4,
      }),
      makeLedger(1, {
        anchorIds: ['2'],
        mandatoryReservePx: 36,
        preferredReservePx: 75,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];

    const result = scoreFootnoteWindow({
      beforeLayout: makeLayout(2, beforeLedger),
      afterLayout: makeLayout(2, afterLedger),
      candidatePageIndex: 0,
      candidateAnchorId: '1',
      beforeLedger,
      afterLedger,
    });

    expect(result.accept).toBe(false);
    expect(result.reason).toBe('new-mandatory-only');
  });

  it('rejects a reserve trial that does not render more of the target footnote', () => {
    const beforeLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];
    const afterLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 64,
        lastAnchorRenderedLines: 1,
      }),
    ];

    const result = scoreFootnoteWindow({
      beforeLayout: makeLayout(1, beforeLedger),
      afterLayout: makeLayout(1, afterLedger),
      candidatePageIndex: 0,
      candidateAnchorId: '1',
      beforeLedger,
      afterLedger,
    });

    expect(result.accept).toBe(false);
    expect(result.reason).toBe('candidate-not-improved');
    expect(result.after.candidateRenderedLines).toBe(result.before.candidateRenderedLines);
  });

  it('rejects a locally safe trial that creates a new mandatory-only anchor outside the page window', () => {
    const beforeLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];
    const afterLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 75,
        lastAnchorRenderedLines: 4,
      }),
      makeLedger(4, {
        anchorIds: ['9'],
        mandatoryReservePx: 36,
        preferredReservePx: 96,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
    ];

    const result = scoreFootnoteWindow({
      beforeLayout: makeLayout(5, beforeLedger),
      afterLayout: makeLayout(5, afterLedger),
      candidatePageIndex: 0,
      candidateAnchorId: '1',
      beforeLedger,
      afterLedger,
      windowAhead: 1,
    });

    expect(result.accept).toBe(false);
    expect(result.reason).toBe('new-mandatory-only');
  });

  it('rejects a locally safe trial that bloats dead reserve outside the page window', () => {
    const beforeLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 36,
        lastAnchorRenderedLines: 1,
      }),
      makeLedger(4, {
        deadReservePx: 0,
      }),
    ];
    const afterLedger = [
      makeLedger(0, {
        anchorIds: ['1'],
        mandatoryReservePx: 36,
        preferredReservePx: 121,
        actualBandHeightPx: 75,
        lastAnchorRenderedLines: 4,
      }),
      makeLedger(4, {
        deadReservePx: 256,
      }),
    ];

    const result = scoreFootnoteWindow({
      beforeLayout: makeLayout(5, beforeLedger),
      afterLayout: makeLayout(5, afterLedger),
      candidatePageIndex: 0,
      candidateAnchorId: '1',
      beforeLedger,
      afterLedger,
      windowAhead: 1,
    });

    expect(result.accept).toBe(false);
    expect(result.reason).toBe('dead-reserve-bloat');
  });
});
