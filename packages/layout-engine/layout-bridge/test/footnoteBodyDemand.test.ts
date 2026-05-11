/**
 * SD-3049: Body break decisions consult footnote demand for refs anchored on this page.
 *
 * Today the body paginator's only footnote signal is `footnoteReservedByPageIndex`,
 * a uniform per-page bottom-margin add-on derived from the previous pass's plan.
 * On pass 1 this is empty, so the body fills the whole page; a ref + footnote body
 * land near the page bottom; the reserve loop then claws back space, leaving a
 * visible blank gap between the body's last fragment and the footnote separator.
 *
 * After SD-3049, when a fragment carrying a footnote ref is committed the paginator
 * accumulates that footnote's measured body height into a per-page demand counter
 * and uses it in the break decision. Body packs tight to "next-line + cumulative
 * footnote demand exceeds page bottom".
 *
 * Verified target: body→separator gap stays within the legitimate separator overhead
 * (≤ 28px = separatorSpacingBefore 12 + dividerHeight 6 + topPadding 6 + 4px slack).
 */

import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

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

describe('SD-3049: body break consults anchored footnote demand', () => {
  it('packs body tight to the separator when footnote demand is known up-front', async () => {
    // Page geometry:
    //   pageHeight = 600 + 144 = 744; margins top=72 bottom=72 → body region = 600px
    //   line height = 20 → 30 body lines fill the page exactly
    // Document:
    //   30 single-line body paragraphs, with a footnote ref in body line 25
    //   footnote = 5 lines × 12 = 60px, plus ~24px separator overhead
    // Today (post-hoc reserve, pass 1 with no signal):
    //   pass 1: body fills 30 lines, ref ends up on page 1
    //   plan computes ~84px reserve for page 1
    //   pass 2: body capped at 600 - 84 = 516px → 25 lines (25*20=500, 26 doesn't fit)
    //   ref still on page 1 (it's at line 25), body bottom ≈ 500 + topMargin
    //   separator at body-bottom + 12 (separatorSpacingBefore) = ~512 + topMargin
    //   reserve area ends near page bottom
    //   GAP between body line 25 bottom and separator: ~12px legit + however much was clawed back
    //   Actually with all 25 lines fitting, the gap is the legit overhead. So this test may need
    //   a different shape to expose the bug.
    //
    // Better shape: ref in middle of doc with a LONG footnote so capping is sharp.

    const BODY_LINES = 25;
    const FOOTNOTE_LINES = 8; // 96px content + ~24px overhead = ~120px reserve
    const LINE_H = 20;

    let pos = 0;
    const blocks: FlowBlock[] = [];
    for (let i = 0; i < BODY_LINES; i += 1) {
      const text = `Body line ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    // Ref inside body line 5 (early, so its demand is known well before page fills)
    const refBlockIdx = 4;
    const refBlock = blocks[refBlockIdx];
    const refPos = (refBlock.kind === 'paragraph' ? (refBlock.runs?.[0]?.pmStart ?? 0) : 0) + 2;
    const ftBlock = makeParagraph('footnote-1-0-paragraph', 'Footnote body content.', 0);

    const measureBlock = vi.fn(async (b: FlowBlock) => {
      if (b.id.startsWith('footnote-')) return makeMeasure(12, FOOTNOTE_LINES);
      return makeMeasure(LINE_H, 1);
    });

    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 600 + margins.top + margins.bottom },
        margins,
        footnotes: {
          refs: [{ id: '1', pos: refPos }],
          blocksById: new Map([['1', [ftBlock]]]),
          topPadding: 6,
          dividerHeight: 6,
        },
      },
      measureBlock,
    );

    const page1 = result.layout.pages[0];
    expect(page1).toBeTruthy();

    // Compute body bottom Y on page 1. ParaFragment doesn't carry an explicit
    // `height` field — derive from `y + (toLine - fromLine) * lineHeight`.
    const bodyMaxBottom = page1.fragments
      .filter((f) => !String(f.blockId).startsWith('footnote-'))
      .reduce((max, f) => {
        const y = (f as { y?: number }).y ?? 0;
        const fromLine = (f as { fromLine?: number }).fromLine ?? 0;
        const toLine = (f as { toLine?: number }).toLine ?? fromLine + 1;
        const lineCount = Math.max(1, toLine - fromLine);
        return Math.max(max, y + lineCount * LINE_H);
      }, 0);

    // Find the separator fragment's top Y on page 1.
    const sepFrag = page1.fragments.find((f) => String(f.blockId).startsWith('footnote-separator'));
    const sepTop = (sepFrag as { y?: number } | undefined)?.y ?? Infinity;

    // SD-3049 success criterion: body→separator gap ≤ 28px (24 legit + 4 slack).
    // Today this fails because the body left more space than necessary above the separator.
    const gap = sepTop - bodyMaxBottom;
    expect(gap).toBeLessThanOrEqual(28);
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  it('does not change layout when document has no footnotes (no-op invariant)', async () => {
    // Regression guard: the new code path must not affect layouts without footnotes.
    const BODY_LINES = 50;
    const LINE_H = 20;
    let pos = 0;
    const blocks: FlowBlock[] = [];
    for (let i = 0; i < BODY_LINES; i += 1) {
      const text = `Body line ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    const measureBlock = vi.fn(async () => makeMeasure(LINE_H, 1));

    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const result = await incrementalLayout(
      [],
      null,
      blocks,
      {
        pageSize: { w: 612, h: 600 + margins.top + margins.bottom },
        margins,
      },
      measureBlock,
    );

    // 50 body lines × 20px = 1000px. Body region per page = 600px → 30 lines per page.
    // Expect: 2 pages exactly, with no fragment kind starting "footnote-".
    expect(result.layout.pages.length).toBe(2);
    for (const page of result.layout.pages) {
      for (const f of page.fragments) {
        expect(String(f.blockId).startsWith('footnote-')).toBe(false);
      }
    }
  });
});
