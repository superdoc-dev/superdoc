import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

/**
 * SD-2656: ordered-cluster rule.
 *
 *   For a body page with N footnote refs [r1, r2, ..., rN]:
 *     - r1 through r_{N-1} MUST render completely on that page.
 *     - rN MUST render at least the first valid line/run on that page.
 *     - Only rN may continue onto subsequent pages.
 *
 * These tests build small synthetic fixtures where the rule is decisive:
 * footnote bodies large enough that the legacy "sum of fullHeight for every
 * anchor" demand model would split the cluster, but small enough that the
 * ordered-cluster demand (full of non-last + firstLine of last) leaves room
 * for the whole cluster on one body page.
 */

const BODY_LH = 24;
const FN_LH = 14;
const PAGE_H = 800;
const PAGE_W = 612;
const MARGINS = { top: 72, right: 72, bottom: 72, left: 72 };

type ClusterCase = {
  /** Number of refs introduced on the anchor body line. */
  anchorCount: number;
  /**
   * Per-footnote line count. Index i → footnote i+1's body height in lines.
   * The last entry is typically larger so the rule is exercised.
   */
  fnLineCounts: number[];
  /**
   * Optional: per-footnote paragraph count (default 1 each). If > 1, the
   * footnote body is split across multiple paragraphs to exercise the
   * multi-paragraph completion rule.
   */
  fnParagraphCounts?: number[];
};

/**
 * Builds a single body paragraph that anchors N footnotes near its end.
 * Each footnote is a single paragraph whose measured height is
 * `lineCount * FN_LH`.
 */
async function runClusterCase(c: ClusterCase) {
  expect(c.fnLineCounts.length).toBe(c.anchorCount);
  const text = 'cluster body with anchors here.';
  const block: FlowBlock = {
    kind: 'paragraph',
    id: 'body-0',
    runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: text.length }],
  };
  const refs = Array.from({ length: c.anchorCount }, (_, i) => ({
    id: String(i + 1),
    pos: text.length - c.anchorCount + i, // last few positions
  }));
  const fnBlocks = new Map<string, FlowBlock[]>();
  refs.forEach((r, refIdx) => {
    const paraCount = c.fnParagraphCounts?.[refIdx] ?? 1;
    const blocks: FlowBlock[] = [];
    for (let p = 0; p < paraCount; p += 1) {
      blocks.push({
        kind: 'paragraph',
        id: `footnote-${r.id}-${p}-paragraph`,
        runs: [{ text: `fn ${r.id} para ${p}`, fontFamily: 'Arial', fontSize: 10, pmStart: 0, pmEnd: 16 }],
      });
    }
    fnBlocks.set(r.id, blocks);
  });

  const measureBlock = vi.fn(async (b: FlowBlock) => {
    if (b.id.startsWith('footnote-')) {
      const m = b.id.match(/^footnote-(\d+)-(\d+)/);
      const idx = m ? Number(m[1]) - 1 : 0;
      // Total lines for the footnote split across its paragraphs.
      const totalLines = c.fnLineCounts[idx] ?? 1;
      const paraCount = c.fnParagraphCounts?.[idx] ?? 1;
      // Distribute lines roughly evenly across paragraphs.
      const linesPerPara = Math.max(1, Math.ceil(totalLines / paraCount));
      const lines = Array.from({ length: linesPerPara }, () => ({
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 1,
        width: 200,
        ascent: FN_LH * 0.8,
        descent: FN_LH * 0.2,
        lineHeight: FN_LH,
      }));
      return { kind: 'paragraph', lines, totalHeight: linesPerPara * FN_LH } as Measure;
    }
    // body block: 6 lines, all anchors fit on the first line
    const lines = Array.from({ length: 6 }, () => ({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 200,
      ascent: BODY_LH * 0.8,
      descent: BODY_LH * 0.2,
      lineHeight: BODY_LH,
    }));
    return { kind: 'paragraph', lines, totalHeight: 6 * BODY_LH } as Measure;
  });

  const result = await incrementalLayout(
    [],
    null,
    [block],
    {
      pageSize: { w: PAGE_W, h: PAGE_H },
      margins: MARGINS,
      footnotes: { refs, blocksById: fnBlocks, topPadding: 4, dividerHeight: 2 },
    },
    measureBlock,
  );

  // Collect footnote slices per page in document order.
  // blockId convention from FootnotesBuilder: "footnote-<id>-..."
  type SliceInfo = { id: string; pageIndex: number; continuesOnNext: boolean; fromLine: number; toLine: number };
  const slices: SliceInfo[] = [];
  result.layout.pages.forEach((page, pageIndex) => {
    for (const frag of page.fragments) {
      if (typeof frag.blockId !== 'string') continue;
      const m = frag.blockId.match(/^footnote-(\d+)-/);
      if (!m || frag.kind !== 'para') continue;
      slices.push({
        id: m[1],
        pageIndex,
        continuesOnNext: !!(frag as { continuesOnNext?: boolean }).continuesOnNext,
        fromLine: (frag as { fromLine?: number }).fromLine ?? 0,
        toLine: (frag as { toLine?: number }).toLine ?? 0,
      });
    }
  });
  return { slices, refs };
}

describe('SD-2656: ordered-cluster rule', () => {
  it('1-anchor cluster: the single anchor starts on its anchor page', async () => {
    const { slices } = await runClusterCase({
      anchorCount: 1,
      fnLineCounts: [3],
    });
    // Anchor is on page 0 → fn 1 must have at least one slice on page 0.
    const fn1OnPage0 = slices.filter((s) => s.id === '1' && s.pageIndex === 0);
    expect(fn1OnPage0.length).toBeGreaterThan(0);
    expect(fn1OnPage0[0].fromLine).toBe(0);
  });

  it('2-anchor cluster: A completes on anchor page, only B may split', async () => {
    // fn 1: 3 lines (must fully complete on page 0).
    // fn 2: 8 lines (large; may split — only fn 2 is allowed to continue).
    const { slices } = await runClusterCase({
      anchorCount: 2,
      fnLineCounts: [3, 8],
    });
    const fn1Page0 = slices.filter((s) => s.id === '1' && s.pageIndex === 0);
    const fn2Page0 = slices.filter((s) => s.id === '2' && s.pageIndex === 0);

    // fn 1 (non-last) must render fully on page 0 — its last slice on page 0
    // must NOT have continuesOnNext.
    expect(fn1Page0.length).toBeGreaterThan(0);
    expect(fn1Page0[fn1Page0.length - 1].continuesOnNext).toBe(false);

    // fn 2 (last) must have at least one rendered line on page 0.
    expect(fn2Page0.length).toBeGreaterThan(0);
    expect(fn2Page0[0].fromLine).toBe(0);

    // Only fn 2 may produce a slice on a later page. fn 1 must not.
    const fn1Later = slices.filter((s) => s.id === '1' && s.pageIndex > 0);
    expect(fn1Later.length).toBe(0);
  });

  it('multi-paragraph non-last footnote: ALL paragraphs render on anchor page (no orphan tail)', async () => {
    // fn 1: 3 paragraphs (6 lines total). MUST fully render on anchor page.
    // fn 2: 2 paragraphs (3 lines total). Last anchor, may split if needed.
    const { slices } = await runClusterCase({
      anchorCount: 2,
      fnLineCounts: [6, 3],
      fnParagraphCounts: [3, 2],
    });

    // fn 1 (non-last) must have NO slices on any page after the anchor page.
    const fn1Pages = new Set(slices.filter((s) => s.id === '1').map((s) => s.pageIndex));
    const fn1AnchorPage = Math.min(...fn1Pages);
    const fn1Trailing = [...fn1Pages].filter((p) => p > fn1AnchorPage);
    expect(fn1Trailing).toEqual([]);

    // Last slice on the anchor page must not be a mid-paragraph continuation.
    const fn1OnAnchor = slices.filter((s) => s.id === '1' && s.pageIndex === fn1AnchorPage);
    expect(fn1OnAnchor.length).toBeGreaterThan(0);
    expect(fn1OnAnchor[fn1OnAnchor.length - 1].continuesOnNext).toBe(false);
  });

  it('3-anchor cluster: A and B complete on anchor page, only C may split', async () => {
    // fn 1, fn 2: short (must fully complete).
    // fn 3: large (the only one allowed to split).
    const { slices } = await runClusterCase({
      anchorCount: 3,
      fnLineCounts: [2, 2, 10],
    });
    const fn1Page0 = slices.filter((s) => s.id === '1' && s.pageIndex === 0);
    const fn2Page0 = slices.filter((s) => s.id === '2' && s.pageIndex === 0);
    const fn3Page0 = slices.filter((s) => s.id === '3' && s.pageIndex === 0);

    expect(fn1Page0.length).toBeGreaterThan(0);
    expect(fn1Page0[fn1Page0.length - 1].continuesOnNext).toBe(false);

    expect(fn2Page0.length).toBeGreaterThan(0);
    expect(fn2Page0[fn2Page0.length - 1].continuesOnNext).toBe(false);

    expect(fn3Page0.length).toBeGreaterThan(0);
    expect(fn3Page0[0].fromLine).toBe(0);

    // fn 1 and fn 2 must not appear on later pages.
    expect(slices.filter((s) => s.id === '1' && s.pageIndex > 0).length).toBe(0);
    expect(slices.filter((s) => s.id === '2' && s.pageIndex > 0).length).toBe(0);
  });
});
