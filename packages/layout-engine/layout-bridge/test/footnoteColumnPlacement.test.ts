import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

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

describe('Footnotes in columns', () => {
  it('places footnotes in the column of their reference', async () => {
    const paragraphOne = makeParagraph('para-1', 'Column 1 text', 0);
    const columnBreak: FlowBlock = { kind: 'columnBreak', id: 'col-break-1' };
    const paragraphTwo = makeParagraph('para-2', 'Column 2 text', 40);

    const footnoteOne = makeParagraph('footnote-1-0-paragraph', 'Footnote one', 0);
    const footnoteTwo = makeParagraph('footnote-2-0-paragraph', 'Footnote two', 0);

    const measureBlock = vi.fn(async (block: FlowBlock) => {
      if (block.kind === 'columnBreak') {
        return { kind: 'columnBreak' } as Measure;
      }
      const textLength = block.kind === 'paragraph' ? (block.runs?.[0]?.text?.length ?? 1) : 1;
      const lineHeight = block.id.startsWith('footnote-') ? 10 : 18;
      return makeMeasure(lineHeight, textLength);
    });

    const columns = { count: 2, gap: 20 };
    const margins = { top: 60, right: 60, bottom: 60, left: 60 };
    const pageSize = { w: 600, h: 800 };

    const result = await incrementalLayout(
      [],
      null,
      [paragraphOne, columnBreak, paragraphTwo],
      {
        pageSize,
        margins,
        columns,
        footnotes: {
          refs: [
            { id: '1', pos: 2 },
            { id: '2', pos: 42 },
          ],
          blocksById: new Map([
            ['1', [footnoteOne]],
            ['2', [footnoteTwo]],
          ]),
        },
      },
      measureBlock,
    );

    const page = result.layout.pages[0];
    const columnWidth = (pageSize.w - margins.left - margins.right - columns.gap) / columns.count;
    const columnOneX = margins.left;
    const columnTwoX = margins.left + columnWidth + columns.gap;

    const footnoteOneFragment = page.fragments.find((fragment) => fragment.blockId === footnoteOne.id);
    const footnoteTwoFragment = page.fragments.find((fragment) => fragment.blockId === footnoteTwo.id);

    expect(footnoteOneFragment?.x).toBeCloseTo(columnOneX, 2);
    expect(footnoteTwoFragment?.x).toBeCloseTo(columnTwoX, 2);
  });
});
