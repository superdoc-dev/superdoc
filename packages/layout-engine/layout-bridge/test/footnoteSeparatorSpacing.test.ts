import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

const makeParagraph = (id: string, text: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
});

const makeMeasure = (lineHeight: number): Measure => ({
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 200,
      ascent: lineHeight * 0.8,
      descent: lineHeight * 0.2,
      lineHeight,
    },
  ],
  totalHeight: lineHeight,
});

const buildLayout = async ({
  separatorSpacingBefore,
}: {
  separatorSpacingBefore?: number;
}): Promise<{
  page: { footnoteReserved?: number; margins?: { bottom?: number }; size?: { w: number; h: number }; fragments: any[] };
  pageSize: { w: number; h: number };
  dividerHeight: number;
  topPadding: number;
  footnoteLineHeight: number;
}> => {
  const bodyBlock = makeParagraph('body-1', 'Body text');
  const footnoteBlock = makeParagraph('footnote-1-0-paragraph', 'Footnote text');
  const footnoteLineHeight = 12;
  const bodyLineHeight = 20;
  const dividerHeight = 1;
  const topPadding = 4;

  const measureBlock = vi.fn(async (block: FlowBlock) => {
    if (block.id.startsWith('footnote-')) {
      return makeMeasure(footnoteLineHeight);
    }
    return makeMeasure(bodyLineHeight);
  });

  const footnotesInput = {
    refs: [{ id: '1', pos: 1 }],
    blocksById: new Map([['1', [footnoteBlock]]]),
    topPadding,
    dividerHeight,
    ...(separatorSpacingBefore != null ? { separatorSpacingBefore } : {}),
  };

  const pageSize = { w: 612, h: 792 };
  const result = await incrementalLayout(
    [],
    null,
    [bodyBlock],
    {
      pageSize,
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      footnotes: footnotesInput,
    },
    measureBlock,
  );

  const page = result.layout.pages[0];
  return { page, pageSize, dividerHeight, topPadding, footnoteLineHeight };
};

describe('Footnote separator spacing', () => {
  it('defaults separator spacing before to the first footnote line height', async () => {
    const { page, pageSize, dividerHeight, topPadding, footnoteLineHeight } = await buildLayout({});

    const separator = page.fragments.find(
      (fragment) => fragment.kind === 'drawing' && fragment.blockId === 'footnote-separator-page-1-col-0',
    );
    expect(separator).toBeTruthy();

    const pageHeight = page.size?.h ?? pageSize.h;
    const bandTopY = pageHeight - (page.margins?.bottom ?? 0);
    const offset = separator.y - bandTopY;
    expect(offset).toBeCloseTo(footnoteLineHeight, 4);

    const expectedReserve = Math.ceil(footnoteLineHeight + dividerHeight + topPadding + footnoteLineHeight);
    expect(page.footnoteReserved).toBe(expectedReserve);
  });

  it('uses explicit separator spacing before when provided', async () => {
    const explicitSpacing = 8;
    const { page, pageSize, dividerHeight, topPadding, footnoteLineHeight } = await buildLayout({
      separatorSpacingBefore: explicitSpacing,
    });

    const separator = page.fragments.find(
      (fragment) => fragment.kind === 'drawing' && fragment.blockId === 'footnote-separator-page-1-col-0',
    );
    expect(separator).toBeTruthy();

    const pageHeight = page.size?.h ?? pageSize.h;
    const bandTopY = pageHeight - (page.margins?.bottom ?? 0);
    const offset = separator.y - bandTopY;
    expect(offset).toBeCloseTo(explicitSpacing, 4);

    const expectedReserve = Math.ceil(explicitSpacing + dividerHeight + topPadding + footnoteLineHeight);
    expect(page.footnoteReserved).toBe(expectedReserve);
  });
});
