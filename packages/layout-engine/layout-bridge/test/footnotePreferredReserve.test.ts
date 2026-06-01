import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure, FootnotePageLedger } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

/**
 * SD-2656 Phase 7: preferred-reserve / mandatory-or-preferred body acceptance.
 *
 * The ordered-cluster rule (Phase 1) defined the MANDATORY minimum:
 *   full(non-last anchors) + firstLine(last anchor)
 *
 * Word does NOT lay out at the mandatory minimum when there is room to spare —
 * it gives the footnote band more vertical space (the "preferred" reserve)
 * and pushes body text down. SuperDoc's body slicer must do the same:
 *
 *   1) accept body lines only while mandatory still fits (hard rule)
 *   2) when room exists, reserve the preferred amount (full of last too)
 *
 * These tests express the preferred behavior and currently FAIL — the body
 * slicer reserves only the mandatory minimum.
 */

const PAGE_H = 800;
const PAGE_W = 612;
const MARGINS = { top: 72, right: 72, bottom: 72, left: 72 };
const BODY_LH = 24;
const FN_LH = 14;

type FootnoteShape = {
  /** Total measured lines for the footnote body. */
  lines: number;
};

async function runScenario(opts: {
  /** Number of body paragraphs (small content; the footnote band is what we test). */
  bodyParagraphs: number;
  /** Footnote shapes in order — first is anchored first, last is the "last anchor". */
  footnotes: FootnoteShape[];
}) {
  const blocks: FlowBlock[] = [];
  let pos = 0;
  for (let i = 0; i < opts.bodyParagraphs; i += 1) {
    const text = `body line ${i + 1}.`;
    blocks.push({
      kind: 'paragraph',
      id: `body-${i}`,
      runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart: pos, pmEnd: pos + text.length }],
    });
    pos += text.length + 1;
  }
  // All refs on the very first body paragraph, positioned near pmStart so the
  // anchor positions resolve to a body-0 fragment (positions near pmEnd may
  // fall outside the line range under the layout engine's pm-position
  // semantics).
  const firstBlock = blocks[0];
  const firstRunStart = (firstBlock.kind === 'paragraph' ? firstBlock.runs?.[0]?.pmStart : undefined) ?? 0;
  const refs = opts.footnotes.map((_, i) => ({
    id: String(i + 1),
    pos: firstRunStart + 2 + i,
  }));

  const fnBlocks = new Map<string, FlowBlock[]>();
  refs.forEach((r) => {
    fnBlocks.set(r.id, [
      {
        kind: 'paragraph',
        id: `footnote-${r.id}-paragraph`,
        runs: [{ text: `fn ${r.id}`, fontFamily: 'Arial', fontSize: 10, pmStart: 0, pmEnd: 6 }],
      },
    ]);
  });

  const measureBlock = vi.fn(async (b: FlowBlock) => {
    if (b.id.startsWith('footnote-')) {
      const m = b.id.match(/^footnote-(\d+)-/);
      const fnIdx = m ? Number(m[1]) - 1 : 0;
      const totalLines = opts.footnotes[fnIdx]?.lines ?? 1;
      return {
        kind: 'paragraph',
        lines: Array.from({ length: totalLines }, () => ({
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 1,
          width: 200,
          ascent: FN_LH * 0.8,
          descent: FN_LH * 0.2,
          lineHeight: FN_LH,
        })),
        totalHeight: totalLines * FN_LH,
      } as Measure;
    }
    // Body block is a paragraph with a single run; the line spans its full
    // character range so anchor positions inside the paragraph resolve to it.
    const paragraphRun = b.kind === 'paragraph' ? b.runs?.[0] : undefined;
    const charCount = paragraphRun ? Math.max(1, (paragraphRun.pmEnd ?? 1) - (paragraphRun.pmStart ?? 0)) : 1;
    return {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: charCount,
          width: 200,
          ascent: BODY_LH * 0.8,
          descent: BODY_LH * 0.2,
          lineHeight: BODY_LH,
        },
      ],
      totalHeight: BODY_LH,
    } as Measure;
  });

  const result = await incrementalLayout(
    [],
    null,
    blocks,
    {
      pageSize: { w: PAGE_W, h: PAGE_H },
      margins: MARGINS,
      footnotes: { refs, blocksById: fnBlocks, topPadding: 4, dividerHeight: 2 },
    },
    measureBlock,
  );

  return { layout: result.layout, refs };
}

describe('SD-2656 Phase 7: preferred-reserve body acceptance', () => {
  // Skipped: documents the Word-like preferred-reserve behavior we want.
  // The planner currently leaves "first-line-only" pages where Word would
  // have rendered the whole footnote. A naive implementation (always reserve
  // preferred, break body when it doesn't fit) regressed total drift on
  // IT-923 because the inflated reserve cascades into more cluster spills
  // downstream. The right implementation must guard against propagation —
  // future work tracked in SD-2656 Phase 7.
  it.skip('single long last footnote: renders MORE than firstLine when capacity exists', async () => {
    // Page content area = 800-144 = 656px. BODY_LH=24 → ~27 body lines fit.
    // Body has 26 paragraphs — packs tight under mandatory reserve.
    // FN has 8 lines × 14 = 112px. Mandatory reserve = 14 + ~10 overhead = 24px.
    // Preferred reserve = 112 + 10 = 122px. Body packed to mandatory has
    // (656 - 24) = 632px = 26.3 lines; preferred has (656 - 122) = 534px = 22.2
    // lines. So preferred forces ~4 body paragraphs to page 2 but renders the
    // full 8-line footnote on the anchor page (Word-like).
    const { layout } = await runScenario({
      bodyParagraphs: 26,
      footnotes: [{ lines: 8 }],
    });
    const page0 = layout.pages[0];
    const ledger = page0.footnoteLedger as FootnotePageLedger;
    expect(ledger).toBeDefined();
    expect(ledger.anchorIds).toEqual(['1']);
    // The legacy "ordered-minimum" body slicer commits lastAnchorRenderedLines=1.
    // Preferred behavior: render the full 8 lines because there is room and
    // it's the only way to avoid "first-line-only" pages.
    expect(ledger.lastAnchorRenderedLines).toBeGreaterThanOrEqual(8);
    // FN fully placed on anchor page — no continuation.
    expect(ledger.continuationOut).toEqual([]);
  });

  it('mandatory minimum: huge footnote keeps body anchor on page', async () => {
    // 50 body paragraphs + 30-line footnote. Tests the Phase 1 ordered-minimum
    // invariant: regardless of how much of the footnote actually fits on page 0,
    // the body anchor must remain there (no migration to a later page).
    //
    // SD-2656 (post-Vivienne+Carlsbad p43): under the +1-page-if-eliminates-split
    // relaxation, the scorer may accept a one-page growth that fully fits the
    // 30-line footnote on the anchor page, eliminating the continuation. So
    // continuationOut may be empty under V1 (full fit) or non-empty under
    // tighter scenarios — both are valid. The invariant under test is that the
    // body anchor stays on page 0 either way.
    const { layout } = await runScenario({
      bodyParagraphs: 50,
      footnotes: [{ lines: 30 }],
    });
    const page0 = layout.pages[0];
    const ledger = page0.footnoteLedger as FootnotePageLedger;
    expect(ledger).toBeDefined();
    expect(ledger.anchorIds).toEqual(['1']);
    // Mandatory minimum still satisfied — at least firstLine on the anchor page.
    expect(ledger.lastAnchorRenderedLines).toBeGreaterThanOrEqual(1);
    // The body anchor must remain on page 0 (no migration to a later page).
    const bodyOnPage0 = layout.pages[0].fragments.some((f) => f.blockId === 'body-0');
    expect(bodyOnPage0).toBe(true);
  });
});
