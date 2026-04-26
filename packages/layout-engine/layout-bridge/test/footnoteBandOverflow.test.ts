/**
 * SD-1680: Footnotes render past the bottom page margin when multiple footnotes
 * need more total height than the reserved band allows. Verifies that the plan
 * output is internally consistent with the body layout's bottom margin — i.e.,
 * no footnote fragment's bottom-Y exceeds the top of the physical bottom margin.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure, Fragment } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

const makeParagraph = (id: string, text: string, pmStart: number): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart, pmEnd: pmStart + text.length }],
});

const makeSingleLineMeasure = (lineHeight: number, textLength: number): Measure => ({
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: textLength,
      width: 200,
      ascent: lineHeight * 0.8,
      descent: lineHeight * 0.2,
      lineHeight,
    },
  ],
  totalHeight: lineHeight,
});

const makeMultiLineMeasure = (lineHeight: number, lineCount: number): Measure => {
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    fromRun: 0,
    fromChar: i,
    toRun: 0,
    toChar: i + 1,
    width: 200,
    ascent: lineHeight * 0.8,
    descent: lineHeight * 0.2,
    lineHeight,
  }));
  return { kind: 'paragraph', lines, totalHeight: lineCount * lineHeight };
};

const PAGE_PHYSICAL_BOTTOM_MARGIN = 72;
const BODY_LINE_HEIGHT = 20;
const FOOTNOTE_LINE_HEIGHT = 12;

describe('SD-1680: Footnote band must not overflow the reserved area', () => {
  /**
   * Scenario: multiple medium-size footnotes compete for a single page's band.
   * Page body fills to have all 4 refs on page 1. Each footnote is long enough that
   * the total needed reserve exceeds what a single pass' body layout anticipated.
   * Before the fix, footnotes stacked past the reserved band and rendered past the
   * page's physical bottom margin. After the fix, excess footnotes must be
   * pushed to a later page (or split) and the band must stay within its reserve.
   */
  it('keeps every footnote fragment within the band on multi-footnote pages', async () => {
    // Realistic-ish scenario: ~20 body paragraphs across 2-3 pages, with 2 footnote
    // refs per page. Each footnote is medium-sized (4 lines). Ample body slack so
    // the layout converges within MAX_FOOTNOTE_LAYOUT_PASSES.
    const BODY_PARAS = 20;
    const FOOTNOTE_LINES = 4;
    const FOOTNOTE_COUNT = 4;

    let pos = 0;
    const bodyBlocks: FlowBlock[] = [];
    const refs: Array<{ id: string; pos: number }> = [];
    const blocksById = new Map<string, FlowBlock[]>();

    for (let i = 0; i < BODY_PARAS; i += 1) {
      const text = `Body paragraph ${i + 1}.`;
      const para = makeParagraph(`body-${i}`, text, pos);
      bodyBlocks.push(para);

      // Spread refs so 2 land on each page
      if (refs.length < FOOTNOTE_COUNT && i % 3 === 1) {
        const refId = String(refs.length + 1);
        refs.push({ id: refId, pos: pos + 2 });
        const fnBlock = makeParagraph(
          `footnote-${refId}-0-paragraph`,
          `Footnote ${refId} content spanning multiple lines.`,
          0,
        );
        blocksById.set(refId, [fnBlock]);
      }

      pos += text.length + 1;
    }

    const measureBlock = vi.fn(async (block: FlowBlock) => {
      if (block.id.startsWith('footnote-')) {
        return makeMultiLineMeasure(FOOTNOTE_LINE_HEIGHT, FOOTNOTE_LINES);
      }
      return makeSingleLineMeasure(BODY_LINE_HEIGHT, 20);
    });

    // Page holds ~10 body paragraphs (200px). With footnote reserve, body shrinks
    // enough that refs can move between pages, but everything must stay bounded.
    const contentHeight = 10 * BODY_LINE_HEIGHT; // 200px
    const pageHeight = contentHeight + 72 + PAGE_PHYSICAL_BOTTOM_MARGIN;

    const result = await incrementalLayout(
      [],
      null,
      bodyBlocks,
      {
        pageSize: { w: 612, h: pageHeight },
        margins: { top: 72, right: 72, bottom: PAGE_PHYSICAL_BOTTOM_MARGIN, left: 72 },
        footnotes: {
          refs,
          blocksById,
          topPadding: 4,
          dividerHeight: 2,
        },
      },
      measureBlock,
    );

    const { layout } = result;
    const pageH = pageHeight;

    // INVARIANT: on every page, every footnote fragment's bottom edge must be ≤ the
    // top of the physical bottom margin (pageH - PAGE_PHYSICAL_BOTTOM_MARGIN).
    // Anything below that point has rendered past the reserved band into the
    // footer area — the core SD-1680 bug.
    const overflows: string[] = [];
    for (const page of layout.pages) {
      const pageBottomLimit = (page.size?.h ?? pageH) - PAGE_PHYSICAL_BOTTOM_MARGIN;
      const footnoteFragments = page.fragments.filter(
        (f: Fragment) =>
          typeof f.blockId === 'string' && f.blockId.startsWith('footnote-') && !f.blockId.includes('separator'),
      );
      for (const f of footnoteFragments) {
        // For paragraph fragments, height is computed from fromLine/toLine * lineHeight.
        // The footnote measure's totalHeight is FOOTNOTE_LINES * FOOTNOTE_LINE_HEIGHT.
        let fragHeight = 0;
        if (f.kind === 'para' && typeof f.toLine === 'number' && typeof f.fromLine === 'number') {
          fragHeight = (f.toLine - f.fromLine) * FOOTNOTE_LINE_HEIGHT;
        } else if (typeof (f as { height?: number }).height === 'number') {
          fragHeight = (f as { height: number }).height;
        }
        const fragBottom = (f.y ?? 0) + fragHeight;
        if (fragBottom > pageBottomLimit + 1) {
          overflows.push(
            `page ${page.number}: fragment ${f.blockId} bottom=${fragBottom.toFixed(1)} exceeds limit ${pageBottomLimit.toFixed(1)} by ${(fragBottom - pageBottomLimit).toFixed(1)}px`,
          );
        }
      }
    }

    expect(overflows).toEqual([]);
  });

  /**
   * A single huge footnote (taller than the page's max reserve) must be split
   * across pages with a continuation on the next page — never rendered as one
   * monolithic block that extends off the page.
   */
  it('splits an oversized footnote across pages rather than overflowing', async () => {
    const BIG_FOOTNOTE_LINES = 30; // way bigger than a single page's band
    const refPos = 5;

    const bodyBlocks: FlowBlock[] = [makeParagraph('body-0', 'Body before footnote ref.', 0)];
    const footnoteBlock = makeParagraph(
      'footnote-1-0-paragraph',
      'A very long footnote that should not fit on a single page band.',
      0,
    );

    const measureBlock = vi.fn(async (block: FlowBlock) => {
      if (block.id.startsWith('footnote-')) {
        return makeMultiLineMeasure(FOOTNOTE_LINE_HEIGHT, BIG_FOOTNOTE_LINES);
      }
      return makeSingleLineMeasure(BODY_LINE_HEIGHT, 26);
    });

    const contentHeight = 200;
    const pageHeight = contentHeight + 72 + PAGE_PHYSICAL_BOTTOM_MARGIN;

    const result = await incrementalLayout(
      [],
      null,
      bodyBlocks,
      {
        pageSize: { w: 612, h: pageHeight },
        margins: { top: 72, right: 72, bottom: PAGE_PHYSICAL_BOTTOM_MARGIN, left: 72 },
        footnotes: {
          refs: [{ id: '1', pos: refPos }],
          blocksById: new Map([['1', [footnoteBlock]]]),
          topPadding: 4,
          dividerHeight: 2,
        },
      },
      measureBlock,
    );

    const { layout } = result;
    const pageBottomLimit = pageHeight - PAGE_PHYSICAL_BOTTOM_MARGIN;

    // No single fragment may extend past the page's bottom limit.
    for (const page of layout.pages) {
      const pageBottomThisPage = (page.size?.h ?? pageHeight) - PAGE_PHYSICAL_BOTTOM_MARGIN;
      const footnoteFragments = page.fragments.filter(
        (f: Fragment) =>
          typeof f.blockId === 'string' && f.blockId.startsWith('footnote-') && !f.blockId.includes('separator'),
      );
      for (const f of footnoteFragments) {
        let fragHeight = 0;
        if (f.kind === 'para' && typeof f.toLine === 'number' && typeof f.fromLine === 'number') {
          fragHeight = (f.toLine - f.fromLine) * FOOTNOTE_LINE_HEIGHT;
        } else if (typeof (f as { height?: number }).height === 'number') {
          fragHeight = (f as { height: number }).height;
        }
        const fragBottom = (f.y ?? 0) + fragHeight;
        expect(fragBottom).toBeLessThanOrEqual(pageBottomThisPage + 1);
      }
    }
  });
});
