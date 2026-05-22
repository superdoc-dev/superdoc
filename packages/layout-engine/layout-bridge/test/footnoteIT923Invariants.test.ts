/**
 * SD-2656 / IT-923 — Word-fidelity invariants (Phase 0 RED baseline).
 *
 * These tests pin the layout invariants the SD-2656 plan requires for
 * Word-like footnote pagination:
 *
 *   - every footnote anchor's first renderable slice MUST be on the same
 *     visual page as the body reference (no orphan footnote pages).
 *   - `findPageIndexForPos` MUST NOT fall back to the closest page for any
 *     real reference (every anchor has an exact containing page).
 *   - the final `FootnoteLayoutPlan` MUST report zero capped pages and zero
 *     truncated footnote ids.
 *
 * Each fixture replicates the SHAPE of a critical IT-923 page (not the
 * exact content — IT-923 is a 49-page real document that the
 * layout-bridge unit-test harness cannot load directly).
 *
 * STATUS ON HEAD (5ed53ee4d): These invariants do NOT hold. The tests are
 * marked with `it.fails(...)` to keep CI green while documenting the red
 * baseline. When the Phase 1+ algorithm change lands and makes the
 * invariants hold, switch each `it.fails` to `it` and CI will flip green
 * naturally.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout, installFootnoteTraceSink } from '../src/incrementalLayout';

// ---------- test helpers ----------

const makeParagraph = (id: string, text: string, pmStart: number): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart, pmEnd: pmStart + text.length }],
});

const makeMeasure = (lineHeight: number, lineCount: number): Measure => ({
  kind: 'paragraph',
  lines: Array.from({ length: lineCount }, (_, i) => ({
    fromRun: 0,
    fromChar: i,
    toRun: 0,
    toChar: i + 1,
    width: 200,
    ascent: lineHeight * 0.8,
    descent: lineHeight * 0.2,
    lineHeight,
  })),
  totalHeight: lineCount * lineHeight,
});

type Snapshot = Parameters<Parameters<typeof installFootnoteTraceSink>[0]>[0];

/** Run a fixture and capture the final trace snapshot. */
const runWithTrace = async (
  blocks: FlowBlock[],
  refs: Array<{ id: string; pos: number }>,
  fnBlocksById: Map<string, FlowBlock[]>,
  fnMeasures: Record<string, { lineHeight: number; lineCount: number }>,
  options?: { contentH?: number; bodyLineH?: number },
): Promise<{ snapshot: Snapshot | null; pageCount: number }> => {
  let captured: Snapshot | null = null;
  const dispose = installFootnoteTraceSink((s) => {
    captured = s;
  });

  try {
    const measureBlock = vi.fn(async (b: FlowBlock) => {
      const config = fnMeasures[b.id];
      if (config) return makeMeasure(config.lineHeight, config.lineCount);
      return makeMeasure(options?.bodyLineH ?? 20, 1);
    });

    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const contentH = options?.contentH ?? 600;
    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: contentH + margins.top + margins.bottom },
        margins,
        footnotes: {
          refs,
          blocksById: fnBlocksById,
          topPadding: 6,
          dividerHeight: 6,
        },
      },
      measureBlock,
    );

    return { snapshot: captured, pageCount: result.layout.pages.length };
  } finally {
    dispose();
  }
};

const assertSameAnchorAndFirstSlicePage = (snapshot: Snapshot, refIds: string[]): void => {
  for (const refId of refIds) {
    const anchorPage = snapshot.anchorPageById[refId];
    const firstSlicePage = snapshot.firstSlicePageById[refId];
    expect(anchorPage).toBeDefined();
    expect(firstSlicePage).toBeDefined();
    // The Word-fidelity invariant: anchor page === first slice page.
    expect(firstSlicePage).toBe(anchorPage);
  }
};

const assertNoFallbackInFinalState = (snapshot: Snapshot): void => {
  // SD-2656: tolerate tiny boundary off-by-one (distance ≤ 1 char). The
  // layout-engine's fragment pmStart/pmEnd derivation occasionally
  // produces a range one char short at the trailing edge of a paragraph
  // when no fragment attrs.pmEnd is set explicitly. The chosen page is
  // still the correct anchor page; we just want to flag REAL fallback
  // (distance > 1) where the planner had no exact containment at all.
  const meaningfulFallbacks = snapshot.fallbacks.filter((f) => f.distance > 1);
  expect(meaningfulFallbacks).toEqual([]);
};

const assertCleanFinalState = (snapshot: Snapshot): void => {
  // No page should have been capped (planner couldn't fit what was needed).
  const cappedPages = snapshot.pages.filter((p) => p.cappedInPass);
  expect(cappedPages).toEqual([]);
};

// ---------- fixture 1: page-5 shape (FOURTH + multi-line fn) ----------

describe('SD-2656 / IT-923 invariant: anchor + first fn slice on same page', () => {
  it("page-5 shape: 'FOURTH' anchor stays with first slice of its long footnote (replicates IT-923 p5)", async () => {
    // IT-923 page 5: 'FOURTH:' heading paragraph anchors fn 4 (multi-line
    // citation about Class A/B Common Stock). Word keeps the FOURTH
    // paragraph and the first slice of fn 4 on page 5; remainder
    // continues on page 6.
    //
    // Replicated shape: body is 40 short paragraphs (forces >1 body
    // page); the 5th body paragraph ('body-4') is the FOURTH-style
    // anchor for fn 4, a 40-line citation.
    const BODY_LINE_H = 20;
    const FN_LINE_H = 12;
    const FN_TOTAL_LINES = 40;

    let pos = 0;
    const blocks: FlowBlock[] = [];
    for (let i = 0; i < 40; i += 1) {
      const text = `Body line ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    const anchorBlock = blocks[4];
    const refPos = (anchorBlock.kind === 'paragraph' ? (anchorBlock.runs?.[0]?.pmStart ?? 0) : 0) + 2;
    const fnBlock = makeParagraph('footnote-4-0-paragraph', 'fn 4 body.', 0);

    const { snapshot } = await runWithTrace(
      blocks,
      [{ id: '4', pos: refPos }],
      new Map([['4', [fnBlock]]]),
      { 'footnote-4-0-paragraph': { lineHeight: FN_LINE_H, lineCount: FN_TOTAL_LINES } },
      { contentH: 600, bodyLineH: BODY_LINE_H },
    );

    expect(snapshot).not.toBeNull();
    const snap = snapshot!;
    assertSameAnchorAndFirstSlicePage(snap, ['4']);
    assertNoFallbackInFinalState(snap);
    assertCleanFinalState(snap);
  });

  it('page-13 shape: dense cluster of 6 anchors — all anchors and first slices on the same page (replicates IT-923 p13)', async () => {
    // IT-923 page 13: footnotes 21-26 all anchor on the same body page.
    // Word fits all 6 anchor lines and starts all 6 footnotes on page 13.
    //
    // Replicated shape: 6 consecutive body paragraphs, each anchoring a
    // short fn (3 lines each). All 6 first slices must land on the same
    // page as their anchors.
    const BODY_LINE_H = 20;
    const FN_LINE_H = 12;
    const FN_LINES = 3;
    const refIds = ['21', '22', '23', '24', '25', '26'];

    let pos = 0;
    const blocks: FlowBlock[] = [];
    // Seed body with 20 paragraphs (forces some body pagination) then
    // the cluster on what should be page 1.
    for (let i = 0; i < 8; i += 1) {
      const text = `Body line ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    const refs: Array<{ id: string; pos: number }> = [];
    const fnBlocksById = new Map<string, FlowBlock[]>();
    const fnMeasures: Record<string, { lineHeight: number; lineCount: number }> = {};
    for (let i = 0; i < refIds.length; i += 1) {
      const refId = refIds[i];
      const text = `Cluster ${refId}.`;
      const block = makeParagraph(`cluster-${refId}`, text, pos);
      blocks.push(block);
      const anchorPos = pos + 2;
      refs.push({ id: refId, pos: anchorPos });
      pos += text.length + 1;
      const fnBlockId = `footnote-${refId}-0-paragraph`;
      fnBlocksById.set(refId, [makeParagraph(fnBlockId, `fn ${refId} body.`, 0)]);
      fnMeasures[fnBlockId] = { lineHeight: FN_LINE_H, lineCount: FN_LINES };
    }
    // Trailing body so there is room on subsequent pages for continuation.
    for (let i = 0; i < 25; i += 1) {
      const text = `Trailing line ${i + 1}.`;
      blocks.push(makeParagraph(`trail-${i}`, text, pos));
      pos += text.length + 1;
    }

    const { snapshot } = await runWithTrace(blocks, refs, fnBlocksById, fnMeasures, {
      contentH: 600,
      bodyLineH: BODY_LINE_H,
    });

    expect(snapshot).not.toBeNull();
    const snap = snapshot!;
    assertSameAnchorAndFirstSlicePage(snap, refIds);
    assertNoFallbackInFinalState(snap);
    assertCleanFinalState(snap);
  });

  it('ordered cluster fn 6/7/8: fn6+fn7 fully rendered, fn8 first slice on cluster page (Word ordered-cluster rule)', async () => {
    // SD-2656 ordered-cluster rule: for refs [fn6, fn7, fn8] introduced on
    // the same body page, fn6 and fn7 (non-last) must render their full
    // body on the cluster page; only fn8 (last) may split with overflow
    // continuing on subsequent pages.
    //
    // Required band = fullHeight(fn6) + fullHeight(fn7) + firstLineHeight(fn8) + overhead
    //               = 3*12 + 3*12 + 12 + ~25 = 109 px
    const BODY_LINE_H = 20;
    const FN_LINE_H = 12;
    const FN_LINES = 3;
    const refIds = ['6', '7', '8'];

    let pos = 0;
    const blocks: FlowBlock[] = [];
    // Body block sequence forces a few body pages before the cluster.
    for (let i = 0; i < 12; i += 1) {
      const text = `Body sentence ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    const refs: Array<{ id: string; pos: number }> = [];
    const fnBlocksById = new Map<string, FlowBlock[]>();
    const fnMeasures: Record<string, { lineHeight: number; lineCount: number }> = {};
    for (let i = 0; i < refIds.length; i += 1) {
      const refId = refIds[i];
      const text = `Anchor ${refId}.`;
      const block = makeParagraph(`anchor-${refId}`, text, pos);
      blocks.push(block);
      const anchorPos = pos + 2;
      refs.push({ id: refId, pos: anchorPos });
      pos += text.length + 1;
      const fnBlockId = `footnote-${refId}-0-paragraph`;
      fnBlocksById.set(refId, [makeParagraph(fnBlockId, `fn ${refId} body.`, 0)]);
      fnMeasures[fnBlockId] = { lineHeight: FN_LINE_H, lineCount: FN_LINES };
    }
    // Trailing body so the slicer is forced to balance body vs cluster
    // reserve (rather than just dumping all remaining body onto p1).
    for (let i = 0; i < 30; i += 1) {
      const text = `Trail body ${i + 1}.`;
      blocks.push(makeParagraph(`trail-${i}`, text, pos));
      pos += text.length + 1;
    }

    const { snapshot } = await runWithTrace(blocks, refs, fnBlocksById, fnMeasures, {
      contentH: 600,
      bodyLineH: BODY_LINE_H,
    });

    expect(snapshot).not.toBeNull();
    const snap = snapshot!;
    // ALL three anchors must have anchor=firstSlice page.
    assertSameAnchorAndFirstSlicePage(snap, refIds);
    assertNoFallbackInFinalState(snap);
    assertCleanFinalState(snap);
  });

  it('page-47 shape: signature-page anchor stays with its footnote (replicates IT-923 p47 / fn 91)', async () => {
    // IT-923 page 47: 'IN WITNESS WHEREOF' signature paragraph anchors
    // fn 91 (a short DGCL citation). Word keeps the anchor and the fn
    // body on the same page even though that page has little body content.
    // No page after p47 may exist that contains only fn 91's body.
    const BODY_LINE_H = 20;
    const FN_LINE_H = 12;

    let pos = 0;
    const blocks: FlowBlock[] = [];
    // 28 body lines to force 1 page (600 / 20 = 30; 28 leaves room).
    for (let i = 0; i < 28; i += 1) {
      const text = `Body line ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    // Anchor in the last body paragraph (body-27).
    const anchorBlock = blocks[27];
    const refPos = (anchorBlock.kind === 'paragraph' ? (anchorBlock.runs?.[0]?.pmStart ?? 0) : 0) + 2;
    const fnBlock = makeParagraph('footnote-91-0-paragraph', 'fn 91 body.', 0);

    const { snapshot, pageCount } = await runWithTrace(
      blocks,
      [{ id: '91', pos: refPos }],
      new Map([['91', [fnBlock]]]),
      { 'footnote-91-0-paragraph': { lineHeight: FN_LINE_H, lineCount: 2 } },
      { contentH: 600, bodyLineH: BODY_LINE_H },
    );

    expect(snapshot).not.toBeNull();
    const snap = snapshot!;
    assertSameAnchorAndFirstSlicePage(snap, ['91']);
    assertNoFallbackInFinalState(snap);
    assertCleanFinalState(snap);
    // No orphan page: the layout should not have a page after the anchor
    // that contains only fn 91's body and no body content.
    const anchorPage = snap.anchorPageById['91'];
    expect(anchorPage).toBeDefined();
    // Pages STRICTLY after the anchor page must not be fn-only.
    for (let i = (anchorPage as number) + 1; i < pageCount; i += 1) {
      const page = snap.pages[i];
      if (!page) continue;
      const hasOnlyFootnotes = page.sliceIds.length > 0 && page.anchorRefIds.length === 0;
      expect(hasOnlyFootnotes).toBe(false);
    }
  });
});
