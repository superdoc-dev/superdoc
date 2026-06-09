import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlock, Layout, Measure, SectionMetadata } from '@superdoc/contracts';
import { layoutPerRIdHeaderFooters } from './HeaderFooterPerRidLayout';

const { mockLayoutHeaderFooterWithCache, mockComputeDisplayPageNumber, mockMeasureBlock } = vi.hoisted(() => ({
  mockLayoutHeaderFooterWithCache: vi.fn(),
  mockComputeDisplayPageNumber: vi.fn(),
  mockMeasureBlock: vi.fn(),
}));

vi.mock('@superdoc/layout-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@superdoc/layout-bridge')>();
  return {
    ...actual,
    computeDisplayPageNumber: mockComputeDisplayPageNumber,
    layoutHeaderFooterWithCache: mockLayoutHeaderFooterWithCache,
  };
});

vi.mock('@superdoc/measuring-dom', () => ({
  measureBlock: mockMeasureBlock,
}));

const makeBlock = (id: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text: id, fontFamily: 'Arial', fontSize: 12 }],
});

const makeParagraph = (id: string, text: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
});

const makeMeasure = (): Measure => ({
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 100,
      ascent: 8,
      descent: 2,
      lineHeight: 10,
    },
  ],
  totalHeight: 10,
});

describe('layoutPerRIdHeaderFooters', () => {
  beforeEach(() => {
    mockComputeDisplayPageNumber.mockReset();
    mockLayoutHeaderFooterWithCache.mockReset();
    mockMeasureBlock.mockReset();

    mockComputeDisplayPageNumber.mockImplementation((pages: Array<{ number: number; sectionIndex?: number }>) =>
      pages.map((page, index) => ({
        physicalPage: page.number,
        displayNumber: index + 1,
        displayText: String(index + 1),
        sectionIndex: page.sectionIndex ?? 0,
      })),
    );

    mockLayoutHeaderFooterWithCache.mockImplementation(async (sections: { default?: FlowBlock[] }) => ({
      default: sections.default
        ? {
            layout: {
              height: 10,
              pages: [{ number: 1, fragments: [] }],
            },
            blocks: sections.default,
            measures: [makeMeasure()],
          }
        : undefined,
    }));
  });

  it('lays out only section-referenced rIds for single-section documents', async () => {
    const headerBlocksByRId = new Map<string, FlowBlock[]>([
      ['rId-header-default', [makeBlock('block-default')]],
      ['rId-header-first', [makeBlock('block-first')]],
      ['rId-header-orphan', [makeBlock('block-orphan')]],
    ]);

    const headerFooterInput = {
      headerBlocksByRId,
      footerBlocksByRId: undefined,
      headerBlocks: undefined,
      footerBlocks: undefined,
      constraints: {
        width: 400,
        height: 80,
        pageWidth: 600,
        pageHeight: 800,
        margins: {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50,
          header: 20,
        },
      },
    };

    const layout = {
      pages: [{ number: 1, fragments: [], sectionIndex: 0 }],
    } as unknown as Layout;

    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        headerRefs: {
          default: 'rId-header-default',
          first: 'rId-header-first',
        },
      },
    ];

    const deps = {
      headerLayoutsByRId: new Map(),
      footerLayoutsByRId: new Map(),
    };

    await layoutPerRIdHeaderFooters(headerFooterInput, layout, sectionMetadata, deps);

    expect(mockLayoutHeaderFooterWithCache).toHaveBeenCalledTimes(2);

    const laidOutBlockIds = new Set(
      mockLayoutHeaderFooterWithCache.mock.calls.map((call) => call[0].default?.[0]?.id).filter(Boolean),
    );

    expect(laidOutBlockIds).toEqual(new Set(['block-default', 'block-first']));
    expect(deps.headerLayoutsByRId.has('rId-header-default')).toBe(true);
    expect(deps.headerLayoutsByRId.has('rId-header-first')).toBe(true);
    expect(deps.headerLayoutsByRId.has('rId-header-orphan')).toBe(false);
  });

  it('passes section-aware display numbers into rId header/footer page resolution', async () => {
    mockComputeDisplayPageNumber.mockReturnValue(
      Array.from({ length: 10 }, (_, index) => ({
        physicalPage: index + 1,
        displayNumber: index === 9 ? 1 : index + 1,
        displayText: index === 9 ? 'i' : String(index + 1),
        sectionIndex: index === 9 ? 1 : 0,
      })),
    );

    const headerFooterInput = {
      headerBlocksByRId: new Map<string, FlowBlock[]>([['rId-header-default', [makeBlock('block-default')]]]),
      footerBlocksByRId: undefined,
      headerBlocks: undefined,
      footerBlocks: undefined,
      constraints: {
        width: 400,
        height: 80,
      },
    };

    const layout = {
      pages: Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        fragments: [],
        sectionIndex: index === 9 ? 1 : 0,
      })),
    } as unknown as Layout;

    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        headerRefs: { default: 'rId-header-default' },
      },
    ];

    const deps = {
      headerLayoutsByRId: new Map(),
      footerLayoutsByRId: new Map(),
    };

    await layoutPerRIdHeaderFooters(headerFooterInput, layout, sectionMetadata, deps);

    const pageResolver = mockLayoutHeaderFooterWithCache.mock.calls[0][5];
    expect(pageResolver(10)).toEqual({
      displayText: 'i',
      displayNumber: 1,
      totalPages: 10,
      sectionPageCount: 10,
    });
  });

  it('passes chapter-aware page context to per-rId header/footer layout', async () => {
    const headerBlocksByRId = new Map<string, FlowBlock[]>([['rId-header-default', [makeBlock('block-default')]]]);
    const headerFooterInput = {
      headerBlocksByRId,
      footerBlocksByRId: undefined,
      headerBlocks: undefined,
      footerBlocks: undefined,
      constraints: {
        width: 400,
        height: 80,
        pageWidth: 600,
        pageHeight: 800,
        margins: { top: 50, right: 50, bottom: 50, left: 50, header: 20 },
      },
    };
    const layout = {
      pages: [
        {
          number: 1,
          fragments: [],
          sectionIndex: 0,
          numberText: '3\u20111',
          displayNumber: 1,
          pageNumberFormat: 'decimal',
          pageNumberChapterText: '3',
          pageNumberChapterSeparator: 'hyphen',
        },
      ],
    } as unknown as Layout;
    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        numbering: { chapterStyle: 1, chapterSeparator: 'hyphen' },
        headerRefs: { default: 'rId-header-default' },
      },
    ];
    const deps = {
      headerLayoutsByRId: new Map(),
      footerLayoutsByRId: new Map(),
    };

    await layoutPerRIdHeaderFooters(headerFooterInput, layout, sectionMetadata, deps);

    const pageResolver = mockLayoutHeaderFooterWithCache.mock.calls[0][5] as (pageNumber: number) => unknown;
    expect(pageResolver(1)).toEqual({
      displayText: '3\u20111',
      displayNumber: 1,
      totalPages: 1,
      sectionPageCount: 1,
      pageFormat: 'decimal',
      chapterNumberText: '3',
      chapterSeparator: 'hyphen',
    });
  });

  it('lays out first-page header refs in multi-section documents with per-section constraints', async () => {
    const headerBlocksByRId = new Map<string, FlowBlock[]>([
      ['rId-header-default', [makeBlock('block-default')]],
      ['rId-header-first', [makeBlock('block-first')]],
      ['rId-header-section-1', [makeBlock('block-section-1')]],
    ]);

    const headerFooterInput = {
      headerBlocksByRId,
      footerBlocksByRId: undefined,
      headerBlocks: undefined,
      footerBlocks: undefined,
      constraints: {
        width: 400,
        height: 80,
        pageWidth: 600,
        pageHeight: 800,
        margins: {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50,
          header: 20,
        },
      },
    };

    const layout = {
      pages: [
        { number: 1, fragments: [], sectionIndex: 0 },
        { number: 2, fragments: [], sectionIndex: 1 },
      ],
    } as unknown as Layout;

    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        margins: { top: 50, right: 50, bottom: 50, left: 50, header: 20 },
        headerRefs: {
          default: 'rId-header-default',
          first: 'rId-header-first',
        },
      },
      {
        sectionIndex: 1,
        margins: { top: 55, right: 55, bottom: 55, left: 55, header: 20 },
        headerRefs: {
          default: 'rId-header-section-1',
        },
      },
    ];

    const deps = {
      headerLayoutsByRId: new Map(),
      footerLayoutsByRId: new Map(),
    };

    await layoutPerRIdHeaderFooters(headerFooterInput, layout, sectionMetadata, deps);

    const laidOutBlockIds = new Set(
      mockLayoutHeaderFooterWithCache.mock.calls.map((call) => call[0].default?.[0]?.id).filter(Boolean),
    );

    expect(laidOutBlockIds).toEqual(new Set(['block-default', 'block-first', 'block-section-1']));
    expect(deps.headerLayoutsByRId.has('rId-header-default::s0')).toBe(true);
    expect(deps.headerLayoutsByRId.has('rId-header-first::s0')).toBe(true);
    expect(deps.headerLayoutsByRId.has('rId-header-section-1::s1')).toBe(true);
  });

  it('lays out referenced default/odd/even variants in per-section mode', async () => {
    const headerBlocksByRId = new Map<string, FlowBlock[]>([
      ['rId-header-default', [makeBlock('block-default')]],
      ['rId-header-odd', [makeBlock('block-odd')]],
      ['rId-header-even', [makeBlock('block-even')]],
      ['rId-header-orphan', [makeBlock('block-orphan')]],
    ]);

    const headerFooterInput = {
      headerBlocksByRId,
      footerBlocksByRId: undefined,
      headerBlocks: undefined,
      footerBlocks: undefined,
      constraints: {
        width: 400,
        height: 80,
        pageWidth: 600,
        pageHeight: 800,
        margins: {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50,
          header: 20,
        },
      },
    };

    const layout = {
      pages: [{ number: 1, fragments: [], sectionIndex: 0 }],
    } as unknown as Layout;

    const sectionMetadata: SectionMetadata[] = [
      {
        sectionIndex: 0,
        margins: { left: 50, right: 50, top: 50, bottom: 50, header: 20 },
        headerRefs: {
          default: 'rId-header-default',
          odd: 'rId-header-odd',
        },
      },
      {
        sectionIndex: 1,
        margins: { left: 60, right: 60, top: 50, bottom: 50, header: 20 },
        headerRefs: {
          even: 'rId-header-even',
        },
      },
    ];

    const deps = {
      headerLayoutsByRId: new Map(),
      footerLayoutsByRId: new Map(),
    };

    await layoutPerRIdHeaderFooters(headerFooterInput, layout, sectionMetadata, deps);

    const laidOutBlockIds = new Set(
      mockLayoutHeaderFooterWithCache.mock.calls.map((call) => call[0].default?.[0]?.id).filter(Boolean),
    );

    expect(laidOutBlockIds).toEqual(new Set(['block-default', 'block-odd', 'block-even']));
    expect(deps.headerLayoutsByRId.has('rId-header-default::s0')).toBe(true);
    expect(deps.headerLayoutsByRId.has('rId-header-odd::s0')).toBe(true);
    expect(deps.headerLayoutsByRId.has('rId-header-even::s1')).toBe(true);
    expect(deps.headerLayoutsByRId.has('rId-header-orphan::s0')).toBe(false);
  });
});
