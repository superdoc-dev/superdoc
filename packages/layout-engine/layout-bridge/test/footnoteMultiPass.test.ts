import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import * as layoutEngine from '@superdoc/layout-engine';
import { incrementalLayout } from '../src/incrementalLayout';

/**
 * Builds a paragraph with pmStart/pmEnd so footnote ref position can be resolved to a page.
 */
const makeParagraph = (id: string, text: string, pmStart: number): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart, pmEnd: pmStart + text.length }],
});

const makeMeasure = (lineHeight: number, textLength: number): Measure => ({
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

/** Multi-line paragraph measure so footnote reserve height is large enough to shift content. */
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
  return {
    kind: 'paragraph',
    lines,
    totalHeight: lineCount * lineHeight,
  };
};

/**
 * Scenario that forces the footnote reserve loop to run multiple passes:
 * - Content height is small (240px). Body has 12 one-line blocks (20px each) so they
 *   exactly fill page 1 with no reserve.
 * - Footnote ref is in the last body block (ref on page 1 in pass 1).
 * - Footnote is tall (5 lines) so its reserve is ~80px. When we relayout with that
 *   reserve on page 1, content height becomes 160px → only 8 lines fit → the ref
 *   moves to page 2. So pass 2 assigns the footnote to page 2 and reserves there.
 * This catches regressions where layout and reserves get out of sync (e.g. wrong
 * reserve vector used for layout when max passes hit).
 */
describe('Footnote multi-pass reserve loop', () => {
  it('runs multiple layout passes when footnotes shift pages and stabilizes correctly', async () => {
    const BODY_LINE_HEIGHT = 20;
    const FOOTNOTE_LINE_HEIGHT = 12;
    const LINES_ON_PAGE_1_WITHOUT_RESERVE = 12;
    const FOOTNOTE_LINES = 5;

    let pos = 0;
    const bodyBlocks: FlowBlock[] = [];
    for (let i = 0; i < LINES_ON_PAGE_1_WITHOUT_RESERVE; i += 1) {
      const text = `Line ${i + 1}.`;
      bodyBlocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1; // +1 for implied break
    }
    // Ref in last body block (so on page 1 when no reserve, then moves to page 2 when we reserve)
    const refPos = pos - 2; // inside last paragraph
    const footnoteBlock = makeParagraph(
      'footnote-1-0-paragraph',
      'Footnote content that spans multiple lines here.',
      0,
    );

    const measureBlock = vi.fn(async (block: FlowBlock) => {
      if (block.id.startsWith('footnote-')) {
        return makeMultiLineMeasure(FOOTNOTE_LINE_HEIGHT, FOOTNOTE_LINES);
      }
      const textLength = block.kind === 'paragraph' ? (block.runs?.[0]?.text?.length ?? 1) : 1;
      return makeMeasure(BODY_LINE_HEIGHT, textLength);
    });

    // Content height 240px: 12 * 20 = 240. With ~80px reserve → 160px → 8 lines on page 1.
    const contentHeight = 240;
    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const pageHeight = contentHeight + margins.top + margins.bottom;

    const layoutDocSpy = vi.spyOn(layoutEngine, 'layoutDocument');

    const result = await incrementalLayout(
      [],
      null,
      bodyBlocks,
      {
        pageSize: { w: 612, h: pageHeight },
        margins,
        footnotes: {
          refs: [{ id: '1', pos: refPos }],
          blocksById: new Map([['1', [footnoteBlock]]]),
          topPadding: 4,
          dividerHeight: 2,
        },
      },
      measureBlock,
    );

    const footnoteReserveCalls = layoutDocSpy.mock.calls.filter((call) =>
      (call[2] as { footnoteReservedByPageIndex?: number[] })?.footnoteReservedByPageIndex?.some((h) => h > 0),
    );
    layoutDocSpy.mockRestore();

    expect(footnoteReserveCalls.length).toBeGreaterThanOrEqual(2);

    const { layout } = result;
    expect(layout.pages.length).toBeGreaterThanOrEqual(2);

    const page2 = layout.pages[1];
    expect(page2.footnoteReserved).toBeGreaterThan(0);

    const footnoteFragment = layout.pages.flatMap((p) => p.fragments).find((f) => f.blockId === footnoteBlock.id);
    expect(footnoteFragment).toBeTruthy();
    const pageOfFootnote = layout.pages.find((p) => p.fragments.some((f) => f.blockId === footnoteBlock.id));
    expect(pageOfFootnote).toBe(page2);

    // Sanity: footnote band does not overlap body (reserve is at bottom; body content ends above it)
    const bodyFragmentsOnPage2 = page2.fragments.filter(
      (f) => f.blockId !== footnoteBlock.id && !String(f.blockId).startsWith('footnote-separator'),
    );
    const footnoteBandTop =
      (page2.size?.h ?? pageHeight) - (page2.margins?.bottom ?? margins.bottom) - (page2.footnoteReserved ?? 0);
    for (const f of bodyFragmentsOnPage2) {
      const fragBottom =
        'y' in f && typeof f.y === 'number' && 'height' in f
          ? f.y + (f.height as number)
          : ((f as { y?: number }).y ?? 0);
      expect(fragBottom).toBeLessThanOrEqual(footnoteBandTop + 1);
    }
  });

  it('does not exhaust max reserve passes when reserves oscillate between pages', async () => {
    const BODY_LINE_HEIGHT = 20;
    const FOOTNOTE_LINE_HEIGHT = 12;
    const LINES_ON_PAGE_1_WITHOUT_RESERVE = 12;
    const FOOTNOTE_LINES = 5;

    let pos = 0;
    const bodyBlocks: FlowBlock[] = [];
    for (let i = 0; i < LINES_ON_PAGE_1_WITHOUT_RESERVE; i += 1) {
      const text = `Line ${i + 1}.`;
      bodyBlocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }

    const refPos = pos - 2;
    const footnoteBlock = makeParagraph(
      'footnote-1-0-paragraph',
      'Footnote content that spans multiple lines here.',
      0,
    );

    const measureBlock = vi.fn(async (block: FlowBlock) => {
      if (block.id.startsWith('footnote-')) {
        return makeMultiLineMeasure(FOOTNOTE_LINE_HEIGHT, FOOTNOTE_LINES);
      }
      const textLength = block.kind === 'paragraph' ? (block.runs?.[0]?.text?.length ?? 1) : 1;
      return makeMeasure(BODY_LINE_HEIGHT, textLength);
    });

    const contentHeight = 240;
    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const pageHeight = contentHeight + margins.top + margins.bottom;

    const layoutDocSpy = vi.spyOn(layoutEngine, 'layoutDocument');

    await incrementalLayout(
      [],
      null,
      bodyBlocks,
      {
        pageSize: { w: 612, h: pageHeight },
        margins,
        footnotes: {
          refs: [{ id: '1', pos: refPos }],
          blocksById: new Map([['1', [footnoteBlock]]]),
          topPadding: 4,
          dividerHeight: 2,
        },
      },
      measureBlock,
    );

    const footnoteReserveCalls = layoutDocSpy.mock.calls.filter((call) =>
      (call[2] as { footnoteReservedByPageIndex?: number[] })?.footnoteReservedByPageIndex?.some((h) => h > 0),
    );
    layoutDocSpy.mockRestore();

    // Current regression: this scenario oscillates A -> B -> A and runs all passes (+ final relayout).
    // Desired behavior: detect oscillation and stop early.
    expect(footnoteReserveCalls.length).toBeLessThanOrEqual(3);
  });
});
