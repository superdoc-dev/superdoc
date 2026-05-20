/**
 * SD-2656: Hard invariants that no body or footnote fragment may extend past
 * the page's physical bottom margin.
 *
 * The existing footnoteBandOverflow tests cover oversized-footnote splits.
 * These tests are wider: they apply to every fixture and every page, and
 * they fail loud when the layout engine produces a Page whose painted
 * content cannot all fit between the top and bottom margins.
 *
 * Why this matters (SD-2656 case study):
 *   The range-aware footnote demand fix moved the band to bodyMaxY. On
 *   dense pages this could leave the band with less space than the planner
 *   thought it had, painting fn body content past `pageH - bottomMargin`.
 *   In the browser, that content was clipped (invisible) — which a screenshot
 *   diff against Word made obvious, but no unit test caught.
 *
 *   These tests would have caught it.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure, Fragment } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

const PAGE_BOTTOM_TOLERANCE_PX = 1;

const makeParagraph = (id: string, text: string, pmStart: number): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart, pmEnd: pmStart + text.length }],
});

const makeMeasure = (lineHeight: number, lineCount: number, textLen = 30): Measure => ({
  kind: 'paragraph',
  lines: Array.from({ length: lineCount }, (_, i) => ({
    fromRun: 0,
    fromChar: i * textLen,
    toRun: 0,
    toChar: (i + 1) * textLen,
    width: 200,
    ascent: lineHeight * 0.8,
    descent: lineHeight * 0.2,
    lineHeight,
  })),
  totalHeight: lineCount * lineHeight,
});

/**
 * Compute every fragment's bottom-Y on a given page. Para fragments report
 * `toLine - fromLine` × line-height (the renderer's effective height); drawing
 * fragments report `height` directly.
 */
const fragmentBottom = (f: Fragment, lineHeight: number): number => {
  const y = (f as { y?: number }).y ?? 0;
  if (f.kind === 'para') {
    const fromLine = (f as { fromLine?: number }).fromLine ?? 0;
    const toLine = (f as { toLine?: number }).toLine ?? fromLine + 1;
    return y + (toLine - fromLine) * lineHeight;
  }
  if (typeof (f as { height?: number }).height === 'number') {
    return y + (f as { height: number }).height;
  }
  return y;
};

const assertNoOverflow = (
  layout: {
    pages: { size?: { h: number }; fragments: Fragment[]; margins?: { bottom?: number } }[];
    pageSize?: { h: number };
  },
  bottomMargin: number,
  bodyLineHeight: number,
  footnoteLineHeight: number,
) => {
  for (let pageIdx = 0; pageIdx < layout.pages.length; pageIdx++) {
    const page = layout.pages[pageIdx];
    const pageH = page.size?.h ?? layout.pageSize?.h ?? 0;
    // We deliberately use the *physical* bottom margin (the one the layout
    // engine was given), not page.margins.bottom — the convergence loop
    // inflates page.margins.bottom by the per-page reserve, which would make
    // the test trivially pass.
    const pageBottomLimit = pageH - bottomMargin;
    for (const f of page.fragments) {
      const isFootnote = typeof f.blockId === 'string' && f.blockId.startsWith('footnote-');
      const lh = isFootnote ? footnoteLineHeight : bodyLineHeight;
      const bottom = fragmentBottom(f, lh);
      if (bottom > pageBottomLimit + PAGE_BOTTOM_TOLERANCE_PX) {
        throw new Error(
          `Fragment ${f.blockId ?? '?'} on page ${pageIdx + 1} extends to y=${bottom.toFixed(1)}, ` +
            `past pageBottomLimit=${pageBottomLimit} (pageH=${pageH}, bottomMargin=${bottomMargin}).`,
        );
      }
    }
  }
};

describe('SD-2656: hard invariant — no fragment may extend past the page bottom margin', () => {
  it('holds when body has multiple fns clustered on a single anchor paragraph', async () => {
    // 12 body paragraphs, paragraph 8 anchors 3 fns; each fn body is 5 lines.
    // Page area is sized so all 3 fn bodies fit on page 1 if the band is sized
    // correctly, or fn 3 must split / spill to page 2 otherwise. Either is OK
    // — the invariant is that NO fragment overflows.
    let pos = 0;
    const blocks: FlowBlock[] = [];
    for (let i = 0; i < 12; i += 1) {
      const text = `Body paragraph ${i}`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    const anchorBlock = blocks[7];
    const anchorPos = anchorBlock.kind === 'paragraph' ? (anchorBlock.runs?.[0]?.pmStart ?? 0) + 1 : 0;
    const refs = [
      { id: 'a', pos: anchorPos },
      { id: 'b', pos: anchorPos + 2 },
      { id: 'c', pos: anchorPos + 4 },
    ];
    const fnBlocks = new Map<string, FlowBlock[]>();
    for (const r of refs) {
      fnBlocks.set(r.id, [makeParagraph(`footnote-${r.id}-0-paragraph`, `fn ${r.id} body`, 0)]);
    }
    const BODY_LH = 20;
    const FN_LH = 12;
    const measureBlock = vi.fn(async (b: FlowBlock) =>
      b.id.startsWith('footnote-') ? makeMeasure(FN_LH, 5) : makeMeasure(BODY_LH, 1),
    );

    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 12 * BODY_LH + margins.top + margins.bottom + 50 },
        margins,
        footnotes: { refs, blocksById: fnBlocks, topPadding: 4, dividerHeight: 2 },
      },
      measureBlock,
    );
    expect(() => assertNoOverflow(result.layout, margins.bottom, BODY_LH, FN_LH)).not.toThrow();
  });

  it('holds when a footnote body is taller than half the page', async () => {
    // Single fn whose body is 30 lines × 12 = 360 px. Page area is small
    // enough that the fn cannot fit on one page — planner must split.
    const block = makeParagraph('p0', 'Body with one anchor here.', 0);
    const anchorPos = block.kind === 'paragraph' ? (block.runs?.[0]?.pmStart ?? 0) + 1 : 0;
    const fnBlock = makeParagraph('footnote-1-0-paragraph', 'large fn body', 0);
    const BODY_LH = 20;
    const FN_LH = 12;
    const measureBlock = vi.fn(async (b: FlowBlock) =>
      b.id.startsWith('footnote-') ? makeMeasure(FN_LH, 30) : makeMeasure(BODY_LH, 1),
    );
    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const result = await incrementalLayout(
      [],
      null,
      [block],
      {
        pageSize: { w: 612, h: 350 + margins.top + margins.bottom }, // content area = 350 px
        margins,
        footnotes: {
          refs: [{ id: '1', pos: anchorPos }],
          blocksById: new Map([['1', [fnBlock]]]),
          topPadding: 4,
          dividerHeight: 2,
        },
      },
      measureBlock,
    );
    expect(() => assertNoOverflow(result.layout, margins.bottom, BODY_LH, FN_LH)).not.toThrow();
  });

  it('holds when many anchored fns cumulate to more than fits in a single band', async () => {
    // The dense-cluster scenario: one body paragraph with 6 short fn anchors,
    // each fn body taking 4 lines. Total band demand = 6 × 48 + overhead, which
    // may exceed any single page's available band space — planner must defer
    // some fns to the next page (matching Word's behavior on the reference fixture's p25).
    const block = makeParagraph('p0', 'Six anchors here', 0);
    const blockPmStart = block.kind === 'paragraph' ? (block.runs?.[0]?.pmStart ?? 0) : 0;
    const refs = Array.from({ length: 6 }, (_, i) => ({ id: `${i + 1}`, pos: blockPmStart + i + 1 }));
    const fnBlocks = new Map<string, FlowBlock[]>();
    for (const r of refs) {
      fnBlocks.set(r.id, [makeParagraph(`footnote-${r.id}-0-paragraph`, `fn ${r.id} body`, 0)]);
    }
    const BODY_LH = 20;
    const FN_LH = 12;
    const measureBlock = vi.fn(async (b: FlowBlock) =>
      b.id.startsWith('footnote-') ? makeMeasure(FN_LH, 4) : makeMeasure(BODY_LH, 1),
    );
    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const result = await incrementalLayout(
      [],
      null,
      [block],
      {
        pageSize: { w: 612, h: 300 + margins.top + margins.bottom },
        margins,
        footnotes: { refs, blocksById: fnBlocks, topPadding: 4, dividerHeight: 2 },
      },
      measureBlock,
    );
    expect(() => assertNoOverflow(result.layout, margins.bottom, BODY_LH, FN_LH)).not.toThrow();
  });

  it('every footnote ref renders its body somewhere in the layout', async () => {
    // Companion invariant: even when the planner splits or defers fns, every
    // ref id in the input must appear as at least one fragment in the output.
    const block = makeParagraph('p0', 'Three anchors', 0);
    const blockPmStart = block.kind === 'paragraph' ? (block.runs?.[0]?.pmStart ?? 0) : 0;
    const refs = [
      { id: 'A', pos: blockPmStart + 1 },
      { id: 'B', pos: blockPmStart + 3 },
      { id: 'C', pos: blockPmStart + 5 },
    ];
    const fnBlocks = new Map<string, FlowBlock[]>();
    for (const r of refs) {
      fnBlocks.set(r.id, [makeParagraph(`footnote-${r.id}-0-paragraph`, `fn ${r.id} body`, 0)]);
    }
    const measureBlock = vi.fn(async (b: FlowBlock) =>
      b.id.startsWith('footnote-') ? makeMeasure(12, 8) : makeMeasure(20, 1),
    );
    const result = await incrementalLayout(
      [],
      null,
      [block],
      {
        pageSize: { w: 612, h: 600 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        footnotes: { refs, blocksById: fnBlocks, topPadding: 4, dividerHeight: 2 },
      },
      measureBlock,
    );
    const rendered = new Set<string>();
    for (const page of result.layout.pages) {
      for (const f of page.fragments) {
        const m = typeof f.blockId === 'string' ? f.blockId.match(/^footnote-([^-]+)-/) : null;
        if (m && !m[1].startsWith('separator') && !m[1].startsWith('continuation')) rendered.add(m[1]);
      }
    }
    for (const r of refs) expect(rendered.has(r.id)).toBe(true);
  });
});
