import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';

const layoutEngineMocks = vi.hoisted(() => ({
  layoutDocument: vi.fn(),
  resolvePageNumberTokens: vi.fn(),
}));

vi.mock('@superdoc/layout-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superdoc/layout-engine')>();
  return {
    ...actual,
    layoutDocument: layoutEngineMocks.layoutDocument,
    resolvePageNumberTokens: layoutEngineMocks.resolvePageNumberTokens,
  };
});

const { incrementalLayout, measureCache } = await import('../src/incrementalLayout');

const makeLayout = (): Layout => ({
  pages: [{ number: 1, sectionIndex: 0, fragments: [{ kind: 'para', blockId: 'body-1' }] }],
});

const makeParagraph = (text: string): FlowBlock => ({
  kind: 'paragraph',
  id: 'body-1',
  runs: [{ kind: 'text', text, token: 'pageNumber' }],
});

const makeHeading = (id: string, markerText: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text: markerText }],
  attrs: { styleId: 'Heading1', wordLayout: { marker: { markerText } } },
});

const makeMeasure = (): Measure => ({
  kind: 'paragraph',
  hasPageTokens: true,
  lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 10, ascent: 8, descent: 2, lineHeight: 10 }],
  totalHeight: 10,
});

describe('page token convergence', () => {
  beforeEach(() => {
    measureCache.clear();
    layoutEngineMocks.layoutDocument.mockReset();
    layoutEngineMocks.resolvePageNumberTokens.mockReset();
  });

  it('continues until page token output is stable when page count stays unchanged', async () => {
    layoutEngineMocks.layoutDocument.mockReturnValue(makeLayout());

    let resolveCount = 0;
    layoutEngineMocks.resolvePageNumberTokens.mockImplementation((_layout, blocks: FlowBlock[]) => {
      resolveCount += 1;
      if (resolveCount <= 2) {
        const text = resolveCount === 1 ? '1' : '2';
        return {
          affectedBlockIds: new Set(['body-1']),
          updatedBlocks: new Map([['body-1', makeParagraph(text)]]),
        };
      }

      return { affectedBlockIds: new Set(), updatedBlocks: new Map() };
    });

    const measureBlock = vi.fn(async () => makeMeasure());

    await incrementalLayout(
      [],
      null,
      [makeParagraph('0')],
      { pageSize: { w: 300, h: 300 }, margins: { top: 20, right: 20, bottom: 20, left: 20 } },
      measureBlock,
    );

    expect(layoutEngineMocks.resolvePageNumberTokens).toHaveBeenCalledTimes(3);
  });

  it('recomputes chapter context when middle page fragments change', async () => {
    const firstLayout: Layout = {
      pages: [
        {
          number: 1,
          sectionIndex: 0,
          fragments: [
            { kind: 'para', blockId: 'body-start' },
            { kind: 'para', blockId: 'heading-1' },
            { kind: 'para', blockId: 'body-end' },
          ],
        },
      ],
    };
    const secondLayout: Layout = {
      pages: [
        {
          number: 1,
          sectionIndex: 0,
          fragments: [
            { kind: 'para', blockId: 'body-start' },
            { kind: 'para', blockId: 'heading-2' },
            { kind: 'para', blockId: 'body-end' },
          ],
        },
      ],
    };
    layoutEngineMocks.layoutDocument.mockReturnValueOnce(firstLayout).mockReturnValue(secondLayout);

    const chapterTexts: Array<string | undefined> = [];
    layoutEngineMocks.resolvePageNumberTokens.mockImplementation((_layout, blocks: FlowBlock[], _measures, ctx) => {
      chapterTexts.push(ctx.displayPages[0]?.chapterNumberText);
      if (chapterTexts.length === 1) {
        return {
          affectedBlockIds: new Set(['body-start']),
          updatedBlocks: new Map([['body-start', blocks[0]]]),
        };
      }

      return { affectedBlockIds: new Set(), updatedBlocks: new Map() };
    });

    const measureBlock = vi.fn(async () => makeMeasure());

    await incrementalLayout(
      [],
      null,
      [makeParagraph('0'), makeHeading('heading-1', '1.'), makeHeading('heading-2', '2.'), makeParagraph('tail')],
      {
        pageSize: { w: 300, h: 300 },
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        sectionMetadata: [{ sectionIndex: 0, numbering: { chapterStyle: 1 } }],
      },
      measureBlock,
    );

    expect(chapterTexts).toEqual(['1', '2']);
  });
});
