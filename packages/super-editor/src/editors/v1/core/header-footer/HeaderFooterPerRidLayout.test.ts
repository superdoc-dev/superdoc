import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlock, Layout, Measure, SectionMetadata } from '@superdoc/contracts';
import { layoutPerRIdHeaderFooters } from './HeaderFooterPerRidLayout';

const { mockLayoutHeaderFooterWithCache, mockComputeDisplayPageNumber, mockMeasureBlock } = vi.hoisted(() => ({
  mockLayoutHeaderFooterWithCache: vi.fn(),
  mockComputeDisplayPageNumber: vi.fn(),
  mockMeasureBlock: vi.fn(),
}));

vi.mock('@superdoc/layout-bridge', () => ({
  OOXML_PCT_DIVISOR: 5000,
  computeDisplayPageNumber: mockComputeDisplayPageNumber,
  layoutHeaderFooterWithCache: mockLayoutHeaderFooterWithCache,
}));

vi.mock('@superdoc/measuring-dom', () => ({
  measureBlock: mockMeasureBlock,
}));

const makeBlock = (id: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text: id, fontFamily: 'Arial', fontSize: 12 }],
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
});
