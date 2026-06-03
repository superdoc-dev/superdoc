import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlock, HeaderFooterLayout, Measure } from '@superdoc/contracts';

const layoutEngineMocks = vi.hoisted(() => ({
  layoutDocument: vi.fn(),
  resolvePageNumberTokens: vi.fn(),
}));

const headerFooterMocks = vi.hoisted(() => ({
  layoutHeaderFooterWithCache: vi.fn(),
}));

vi.mock('@superdoc/layout-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superdoc/layout-engine')>();
  return {
    ...actual,
    layoutDocument: layoutEngineMocks.layoutDocument,
    resolvePageNumberTokens: layoutEngineMocks.resolvePageNumberTokens,
  };
});

vi.mock('../src/layoutHeaderFooter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/layoutHeaderFooter')>();
  return {
    ...actual,
    layoutHeaderFooterWithCache: headerFooterMocks.layoutHeaderFooterWithCache,
  };
});

const { incrementalLayout, measureCache } = await import('../src/incrementalLayout');

const makeMeasure = (): Measure => ({
  kind: 'paragraph',
  hasPageTokens: false,
  lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 1, width: 10, ascent: 8, descent: 2, lineHeight: 10 }],
  totalHeight: 10,
});

const makeHeaderFooterLayout = (): HeaderFooterLayout => ({
  height: 10,
  pages: [{ number: 1, fragments: [], blocks: [], measures: [] }],
});

const makeParagraph = (id: string, text: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text }],
});

const makeHeaderPageNumber = (): FlowBlock => ({
  kind: 'paragraph',
  id: 'header-page',
  runs: [{ kind: 'text', text: '1', token: 'pageNumber' }],
});

const makeHeading = (id: string, markerText: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text: markerText }],
  attrs: { styleId: 'Heading1', wordLayout: { marker: { markerText } } },
});

const makeResolvedHeading = (id: string, markerText: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text: markerText }],
  attrs: { styleId: 'Titre1', headingLevel: 1, wordLayout: { marker: { markerText } } },
});

const makeOrdinalHeading = (id: string, ordinal: number): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text: 'Chapter' }],
  attrs: { styleId: 'Titre1', headingLevel: 1, listLevelOrdinal: ordinal },
});

describe('header/footer pre-layout', () => {
  beforeEach(() => {
    measureCache.clear();
    layoutEngineMocks.layoutDocument.mockReset();
    layoutEngineMocks.resolvePageNumberTokens.mockReset();
    headerFooterMocks.layoutHeaderFooterWithCache.mockReset();

    layoutEngineMocks.layoutDocument.mockReturnValue({
      pages: [{ number: 1, sectionIndex: 0, fragments: [{ kind: 'para', blockId: 'body' }] }],
    });
    layoutEngineMocks.resolvePageNumberTokens.mockReturnValue({
      affectedBlockIds: new Set(),
      updatedBlocks: new Map(),
    });
    headerFooterMocks.layoutHeaderFooterWithCache.mockResolvedValue({
      default: { blocks: [makeHeaderPageNumber()], measures: [makeMeasure()], layout: makeHeaderFooterLayout() },
    });
  });

  it('uses a chapter-aware page resolver when measuring header/footer height before body layout', async () => {
    await incrementalLayout(
      [],
      null,
      [makeHeading('heading-1', '123456789.'), makeParagraph('body', 'Body')],
      {
        pageSize: { w: 300, h: 300 },
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        sectionMetadata: [{ sectionIndex: 0, numbering: { chapterStyle: 1, chapterSeparator: 'hyphen' } }],
      },
      vi.fn(async () => makeMeasure()),
      {
        headerBlocks: { default: [makeHeaderPageNumber()] },
        constraints: { width: 40, height: 40 },
      },
    );

    const prelayoutPageResolver = headerFooterMocks.layoutHeaderFooterWithCache.mock.calls[0]?.[5];

    expect(prelayoutPageResolver).toBeTypeOf('function');
    expect(prelayoutPageResolver(1)).toMatchObject({
      displayText: '123456789\u201110',
      displayNumber: 10,
      totalPages: 10,
      sectionPageCount: 10,
      pageFormat: 'decimal',
      chapterNumberText: '123456789',
      chapterSeparator: 'hyphen',
    });
  });

  it('uses adapter-resolved heading levels for conservative chapter pre-layout', async () => {
    await incrementalLayout(
      [],
      null,
      [makeResolvedHeading('heading-1', '123456789.'), makeParagraph('body', 'Body')],
      {
        pageSize: { w: 300, h: 300 },
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        sectionMetadata: [{ sectionIndex: 0, numbering: { chapterStyle: 1, chapterSeparator: 'hyphen' } }],
      },
      vi.fn(async () => makeMeasure()),
      {
        headerBlocks: { default: [makeHeaderPageNumber()] },
        constraints: { width: 40, height: 40 },
      },
    );

    const prelayoutPageResolver = headerFooterMocks.layoutHeaderFooterWithCache.mock.calls[0]?.[5];

    expect(prelayoutPageResolver).toBeTypeOf('function');
    expect(prelayoutPageResolver(1)).toMatchObject({
      displayText: '123456789\u201110',
      chapterNumberText: '123456789',
      chapterSeparator: 'hyphen',
    });
  });

  it('uses heading ordinal fallback for conservative chapter pre-layout', async () => {
    await incrementalLayout(
      [],
      null,
      [makeOrdinalHeading('heading-1', 3), makeParagraph('body', 'Body')],
      {
        pageSize: { w: 300, h: 300 },
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        sectionMetadata: [{ sectionIndex: 0, numbering: { chapterStyle: 1, chapterSeparator: 'hyphen' } }],
      },
      vi.fn(async () => makeMeasure()),
      {
        headerBlocks: { default: [makeHeaderPageNumber()] },
        constraints: { width: 40, height: 40 },
      },
    );

    const prelayoutPageResolver = headerFooterMocks.layoutHeaderFooterWithCache.mock.calls[0]?.[5];

    expect(prelayoutPageResolver).toBeTypeOf('function');
    expect(prelayoutPageResolver(1)).toMatchObject({
      displayText: '3\u201110',
      chapterNumberText: '3',
      chapterSeparator: 'hyphen',
    });
  });

  it('uses a two-digit page component for conservative chapter pre-layout', async () => {
    await incrementalLayout(
      [],
      null,
      [makeHeading('heading-1', '123456789.'), makeParagraph('body', 'Body')],
      {
        pageSize: { w: 300, h: 300 },
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        sectionMetadata: [{ sectionIndex: 0, numbering: { chapterStyle: 1, chapterSeparator: 'hyphen' } }],
      },
      vi.fn(async () => makeMeasure()),
      {
        headerBlocks: { default: [makeHeaderPageNumber()] },
        constraints: { width: 40, height: 40 },
      },
    );

    const prelayoutPageResolver = headerFooterMocks.layoutHeaderFooterWithCache.mock.calls[0]?.[5];

    expect(prelayoutPageResolver).toBeTypeOf('function');
    expect(prelayoutPageResolver(1)).toMatchObject({
      displayText: '123456789\u201110',
      displayNumber: 10,
      totalPages: 10,
      sectionPageCount: 10,
    });
  });
});
