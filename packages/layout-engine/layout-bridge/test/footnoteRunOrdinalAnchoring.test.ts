import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

const makeBodyParagraph = (): FlowBlock => ({
  kind: 'paragraph',
  id: 'body-para',
  runs: [
    { text: 'First page line', fontFamily: 'Arial', fontSize: 12 },
    { text: 'Second page line', fontFamily: 'Arial', fontSize: 12 },
  ],
});

const bodyMeasure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 'First page line'.length,
      width: 160,
      ascent: 56,
      descent: 14,
      lineHeight: 70,
    },
    {
      fromRun: 1,
      fromChar: 0,
      toRun: 1,
      toChar: 'Second page line'.length,
      width: 160,
      ascent: 56,
      descent: 14,
      lineHeight: 70,
    },
  ],
  totalHeight: 140,
};

const footnoteBlock: FlowBlock = {
  kind: 'paragraph',
  id: 'footnote-1-0-paragraph',
  runs: [{ text: 'Footnote.', fontFamily: 'Arial', fontSize: 10 }],
};

const footnoteMeasure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 'Footnote.'.length,
      width: 80,
      ascent: 9.6,
      descent: 2.4,
      lineHeight: 12,
    },
  ],
  totalHeight: 12,
};

const findFootnotePageIndex = (result: Awaited<ReturnType<typeof incrementalLayout>>): number | null => {
  for (let pageIndex = 0; pageIndex < result.layout.pages.length; pageIndex += 1) {
    const page = result.layout.pages[pageIndex];
    if (page.fragments.some((fragment) => fragment.blockId === footnoteBlock.id)) return pageIndex;
  }
  return null;
};

describe('footnote run-ordinal anchoring', () => {
  it('anchors the footnote to the fragment that contains the referenced run', async () => {
    const measureBlock = vi.fn(async (block: FlowBlock) => {
      if (block.id === footnoteBlock.id) return footnoteMeasure;
      return bodyMeasure;
    });

    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const pageHeight = 110 + margins.top + margins.bottom;
    const baseOptions = {
      pageSize: { w: 612, h: pageHeight },
      margins,
      footnotes: {
        blocksById: new Map([['1', [footnoteBlock]]]),
        topPadding: 4,
        dividerHeight: 2,
      },
    };

    const withoutRunOrdinal = await incrementalLayout(
      [],
      null,
      [makeBodyParagraph()],
      {
        ...baseOptions,
        footnotes: {
          ...baseOptions.footnotes,
          refs: [{ id: '1', pos: 1, blockId: 'body-para' }],
        },
      },
      measureBlock,
    );

    const withRunOrdinal = await incrementalLayout(
      [],
      null,
      [makeBodyParagraph()],
      {
        ...baseOptions,
        footnotes: {
          ...baseOptions.footnotes,
          refs: [{ id: '1', pos: 1, blockId: 'body-para', runOrdinal: 1 }],
        },
      },
      measureBlock,
    );

    expect(findFootnotePageIndex(withoutRunOrdinal)).toBe(0);
    expect(findFootnotePageIndex(withRunOrdinal)).toBe(1);
    expect(withRunOrdinal.layout.pages[1]?.footnoteReserved ?? 0).toBeGreaterThan(0);
  });
});
