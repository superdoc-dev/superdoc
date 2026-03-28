import { describe, it, expect } from 'vitest';
import { resolveLayout } from './resolveLayout.js';
import type {
  Layout,
  FlowBlock,
  Measure,
  ParaFragment,
  ImageFragment,
  TableFragment,
  ListItemFragment,
  DrawingFragment,
} from '@superdoc/contracts';

describe('resolveLayout', () => {
  const baseLayout: Layout = {
    pageSize: { w: 800, h: 1000 },
    pages: [],
  };

  it('returns valid ResolvedLayout for empty pages', () => {
    const result = resolveLayout({ layout: baseLayout, flowMode: 'paginated', blocks: [], measures: [] });
    expect(result).toEqual({
      version: 1,
      flowMode: 'paginated',
      pageGap: 0,
      pages: [],
    });
  });

  it('copies metadata for a single page', () => {
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [{ number: 1, fragments: [] }],
      pageGap: 24,
    };
    const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toEqual({
      id: 'page-0',
      index: 0,
      number: 1,
      width: 800,
      height: 1000,
      items: [],
    });
    expect(result.pageGap).toBe(24);
  });

  it('uses per-page dimensions when page.size is defined', () => {
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        { number: 1, fragments: [], size: { w: 600, h: 900 } },
        { number: 2, fragments: [] },
        { number: 3, fragments: [], size: { w: 1200, h: 1600 } },
      ],
    };
    const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].width).toBe(600);
    expect(result.pages[0].height).toBe(900);
    expect(result.pages[1].width).toBe(800);
    expect(result.pages[1].height).toBe(1000);
    expect(result.pages[2].width).toBe(1200);
    expect(result.pages[2].height).toBe(1600);
  });

  it('falls back to layout.pageSize when page.size is undefined', () => {
    const layout: Layout = {
      pageSize: { w: 612, h: 792 },
      pages: [{ number: 1, fragments: [] }],
    };
    const result = resolveLayout({ layout, flowMode: 'semantic', blocks: [], measures: [] });
    expect(result.pages[0].width).toBe(612);
    expect(result.pages[0].height).toBe(792);
    expect(result.flowMode).toBe('semantic');
  });

  it('produces deterministic output for the same input', () => {
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ],
      pageGap: 10,
    };
    const a = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
    const b = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
    expect(a).toEqual(b);
  });

  it('defaults pageGap to 0 when layout.pageGap is undefined', () => {
    const result = resolveLayout({ layout: baseLayout, flowMode: 'paginated', blocks: [], measures: [] });
    expect(result.pageGap).toBe(0);
  });

  describe('fragment item resolution', () => {
    it('resolves a paragraph fragment with computed height', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 2,
        x: 72,
        y: 100,
        width: 468,
        pmStart: 1,
        pmEnd: 50,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [
            { fromRun: 0, fromChar: 0, toRun: 0, toChar: 10, width: 400, ascent: 12, descent: 4, lineHeight: 20 },
            { fromRun: 0, fromChar: 10, toRun: 0, toChar: 20, width: 350, ascent: 12, descent: 4, lineHeight: 22 },
          ],
          totalHeight: 42,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0];
      expect(item).toMatchObject({
        kind: 'fragment',
        id: 'para:p1:0:2',
        pageIndex: 0,
        x: 72,
        y: 100,
        width: 468,
        height: 42,
        zIndex: undefined,
        fragmentKind: 'para',
        blockId: 'p1',
        fragmentIndex: 0,
      });
      // Verify resolved paragraph content is populated
      expect((item as any).content).toBeDefined();
      expect((item as any).content.lines).toHaveLength(2);
    });

    it('resolves a paragraph fragment with remeasured lines', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 3,
        x: 72,
        y: 50,
        width: 300,
        lines: [
          { fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 280, ascent: 10, descent: 3, lineHeight: 18 },
          { fromRun: 0, fromChar: 5, toRun: 0, toChar: 10, width: 260, ascent: 10, descent: 3, lineHeight: 18 },
          { fromRun: 0, fromChar: 10, toRun: 0, toChar: 15, width: 200, ascent: 10, descent: 3, lineHeight: 18 },
        ],
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [
            { fromRun: 0, fromChar: 0, toRun: 0, toChar: 15, width: 500, ascent: 10, descent: 3, lineHeight: 40 },
          ],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      // Should use fragment.lines (54) not measure.lines (40)
      expect(result.pages[0].items[0].height).toBe(54);
    });

    it('resolves an image fragment with height, zIndex, and pre-extracted block', () => {
      const imageFragment: ImageFragment = {
        kind: 'image',
        blockId: 'img1',
        x: 100,
        y: 200,
        width: 300,
        height: 250,
        isAnchored: true,
        zIndex: 5,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [imageFragment] }],
      };
      const imageBlock = { kind: 'image' as const, id: 'img1', src: 'test.png', width: 300, height: 250 };
      const blocks: FlowBlock[] = [imageBlock];
      const measures: Measure[] = [{ kind: 'image', width: 300, height: 250 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedImageItem;
      expect(item).toMatchObject({
        kind: 'fragment',
        id: 'image:img1:100:200',
        fragmentKind: 'image',
        height: 250,
        zIndex: 5,
      });
      // PR7: verify pre-extracted block
      expect(item.block).toBe(imageBlock);
    });

    it('resolves a drawing fragment with zIndex and pre-extracted block', () => {
      const drawingFragment: DrawingFragment = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        blockId: 'dr1',
        x: 50,
        y: 60,
        width: 200,
        height: 150,
        isAnchored: true,
        zIndex: 3,
        geometry: { width: 200, height: 150 },
        scale: 1,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [drawingFragment] }],
      };
      const drawingBlock = {
        kind: 'drawing' as const,
        id: 'dr1',
        drawingKind: 'vectorShape' as const,
        geometry: { width: 200, height: 150 },
      };
      const blocks: FlowBlock[] = [drawingBlock as any];
      const measures: Measure[] = [{ kind: 'drawing', width: 200, height: 150 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedDrawingItem;
      expect(item).toMatchObject({
        id: 'drawing:dr1:50:60',
        fragmentKind: 'drawing',
        height: 150,
        zIndex: 3,
      });
      // PR7: verify pre-extracted block
      expect(item.block).toBe(drawingBlock);
    });

    it('omits zIndex for non-anchored drawing fragments even when the fragment carries one', () => {
      const drawingFragment: DrawingFragment = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        blockId: 'dr-inline',
        x: 50,
        y: 60,
        width: 200,
        height: 150,
        zIndex: 1,
        geometry: { width: 200, height: 150 },
        scale: 1,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [drawingFragment] }],
      };
      const drawingBlock = {
        kind: 'drawing' as const,
        id: 'dr-inline',
        drawingKind: 'vectorShape' as const,
        geometry: { width: 200, height: 150 },
      };
      const drawingMeasure = { kind: 'drawing' as const, width: 200, height: 150 };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [drawingBlock as any],
        measures: [drawingMeasure as any],
      });
      expect(result.pages[0].items[0].zIndex).toBeUndefined();
    });

    it('resolves a table fragment with partialRow in id', () => {
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'tbl1',
        fromRow: 0,
        toRow: 3,
        x: 72,
        y: 100,
        width: 468,
        height: 300,
        partialRow: {
          rowIndex: 2,
          fromLineByCell: [0, 0, 1],
          toLineByCell: [2, 3, -1],
          isFirstPart: true,
          isLastPart: false,
          partialHeight: 50,
        },
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [tableFragment] }],
      };
      const tableBlock = { kind: 'table' as const, id: 'tbl1', rows: [] };
      const tableMeasure = { kind: 'table' as const, rows: [], columnWidths: [], totalWidth: 0, totalHeight: 0 };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [tableBlock as any],
        measures: [tableMeasure as any],
      });
      const item = result.pages[0].items[0];
      expect(item.id).toBe('table:tbl1:0:3:0,0,1-2,3,-1');
      expect(item.height).toBe(300);
      expect(item.fragmentKind).toBe('table');
    });

    it('resolves a table fragment with pre-extracted block, measure, and computed fields', () => {
      const tableBlock = {
        kind: 'table' as const,
        id: 'tbl1',
        rows: [{ cells: [{ content: [] }] }],
        attrs: { cellSpacing: { type: 'px' as const, value: 4 } },
      };
      const tableMeasure = {
        kind: 'table' as const,
        rows: [{ height: 30, cells: [{ width: 200 }] }],
        columnWidths: [200, 268],
        totalWidth: 468,
        totalHeight: 30,
      };
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'tbl1',
        fromRow: 0,
        toRow: 1,
        x: 72,
        y: 100,
        width: 468,
        height: 30,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [tableFragment] }],
      };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [tableBlock as any],
        measures: [tableMeasure as any],
      });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedTableItem;
      expect(item.fragmentKind).toBe('table');
      expect(item.block).toBe(tableBlock);
      expect(item.measure).toBe(tableMeasure);
      // cellSpacingPx: measure has no cellSpacingPx, falls back to getCellSpacingPx(block.attrs.cellSpacing)
      expect(item.cellSpacingPx).toBe(4);
      // effectiveColumnWidths: no fragment.columnWidths, so uses measure.columnWidths
      expect(item.effectiveColumnWidths).toEqual([200, 268]);
    });

    it('uses measure.cellSpacingPx when present on the table measure', () => {
      const tableBlock = {
        kind: 'table' as const,
        id: 'tbl2',
        rows: [],
        attrs: { cellSpacing: { type: 'px' as const, value: 10 } },
      };
      const tableMeasure = {
        kind: 'table' as const,
        rows: [],
        columnWidths: [100],
        totalWidth: 100,
        totalHeight: 0,
        cellSpacingPx: 7,
      };
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'tbl2',
        fromRow: 0,
        toRow: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 0,
      };
      const layout: Layout = { pageSize: { w: 612, h: 792 }, pages: [{ number: 1, fragments: [tableFragment] }] };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [tableBlock as any],
        measures: [tableMeasure as any],
      });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedTableItem;
      // measure.cellSpacingPx (7) takes precedence over block.attrs.cellSpacing (10)
      expect(item.cellSpacingPx).toBe(7);
    });

    it('uses fragment.columnWidths over measure.columnWidths when present', () => {
      const tableBlock = { kind: 'table' as const, id: 'tbl3', rows: [] };
      const tableMeasure = {
        kind: 'table' as const,
        rows: [],
        columnWidths: [200, 300],
        totalWidth: 500,
        totalHeight: 0,
      };
      const rescaledWidths = [160, 240];
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'tbl3',
        fromRow: 0,
        toRow: 0,
        x: 0,
        y: 0,
        width: 400,
        height: 0,
        columnWidths: rescaledWidths,
      };
      const layout: Layout = { pageSize: { w: 612, h: 792 }, pages: [{ number: 1, fragments: [tableFragment] }] };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [tableBlock as any],
        measures: [tableMeasure as any],
      });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedTableItem;
      expect(item.effectiveColumnWidths).toEqual(rescaledWidths);
    });

    it('throws when a resolved table fragment is missing its block-map entry', () => {
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'missing-table',
        fromRow: 0,
        toRow: 1,
        x: 0,
        y: 0,
        width: 100,
        height: 40,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [tableFragment] }],
      };

      expect(() => resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] })).toThrow(
        '[layout-resolved] Missing block/measure entry for table fragment "missing-table".',
      );
    });

    it('throws when a resolved image fragment points at the wrong block kinds', () => {
      const imageFragment: ImageFragment = {
        kind: 'image',
        blockId: 'img-wrong',
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [imageFragment] }],
      };
      const wrongBlock = { kind: 'paragraph' as const, id: 'img-wrong', runs: [] };
      const wrongMeasure = { kind: 'paragraph' as const, lines: [], totalHeight: 0 };

      expect(() =>
        resolveLayout({
          layout,
          flowMode: 'paginated',
          blocks: [wrongBlock as any],
          measures: [wrongMeasure as any],
        }),
      ).toThrow(
        '[layout-resolved] Expected image fragment "img-wrong" to resolve to image/image, got paragraph/paragraph.',
      );
    });

    it('resolves a list-item fragment with computed height', () => {
      const listItemFragment: ListItemFragment = {
        kind: 'list-item',
        blockId: 'list1',
        itemId: 'item-a',
        fromLine: 0,
        toLine: 1,
        x: 108,
        y: 200,
        width: 432,
        markerWidth: 36,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [listItemFragment] }],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'list',
          id: 'list1',
          listType: 'bullet',
          items: [
            {
              id: 'item-a',
              marker: { text: '•', style: {} },
              paragraph: { kind: 'paragraph', id: 'item-a-p', runs: [] },
            },
          ],
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'list',
          items: [
            {
              itemId: 'item-a',
              markerWidth: 36,
              markerTextWidth: 10,
              indentLeft: 36,
              paragraph: {
                kind: 'paragraph',
                lines: [
                  { fromRun: 0, fromChar: 0, toRun: 0, toChar: 10, width: 400, ascent: 12, descent: 4, lineHeight: 24 },
                ],
                totalHeight: 24,
              },
            },
          ],
          totalHeight: 24,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0];
      expect(item).toMatchObject({
        kind: 'fragment',
        id: 'list-item:list1:item-a:0:1',
        fragmentKind: 'list-item',
        height: 24,
        blockId: 'list1',
      });
    });

    it('preserves fragment ordering across items', () => {
      const fragments = [
        { kind: 'para' as const, blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 },
        { kind: 'para' as const, blockId: 'p2', fromLine: 0, toLine: 1, x: 72, y: 130, width: 468 },
        { kind: 'image' as const, blockId: 'img1', x: 200, y: 0, width: 100, height: 80 },
      ];
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments }],
      };
      const imageBlock = { kind: 'image' as const, id: 'img1', src: 'ordered.png', width: 100, height: 80 };
      const imageMeasure = { kind: 'image' as const, width: 100, height: 80 };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [imageBlock as any],
        measures: [imageMeasure as any],
      });
      expect(result.pages[0].items.map((i) => i.id)).toEqual(['para:p1:0:1', 'para:p2:0:1', 'image:img1:200:0']);
      expect(result.pages[0].items[0].fragmentIndex).toBe(0);
      expect(result.pages[0].items[1].fragmentIndex).toBe(1);
      expect(result.pages[0].items[2].fragmentIndex).toBe(2);
    });

    it('resolves items per-page in a multi-page layout', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
          {
            number: 2,
            fragments: [
              {
                kind: 'para',
                blockId: 'p1',
                fromLine: 1,
                toLine: 2,
                x: 72,
                y: 72,
                width: 468,
                continuesFromPrev: true,
              },
            ],
          },
        ],
      };

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].items).toHaveLength(1);
      expect(result.pages[0].items[0].pageIndex).toBe(0);
      expect(result.pages[1].items).toHaveLength(1);
      expect(result.pages[1].items[0].pageIndex).toBe(1);
      expect(result.pages[1].items[0].id).toBe('para:p1:1:2');
    });

    it('returns height 0 for paragraph with missing block', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'missing', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].items[0].height).toBe(0);
    });

    it('omits zIndex when fragment has no zIndex', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].items[0].zIndex).toBeUndefined();
    });
  });

  describe('paragraph content resolution', () => {
    const makeLine = (
      overrides: Partial<import('@superdoc/contracts').Line> = {},
    ): import('@superdoc/contracts').Line => ({
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 10,
      width: 400,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
      ...overrides,
    });

    it('resolves plain paragraph with correct line count and indent', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 2, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [{ kind: 'text', text: 'Hello world' }] }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine(), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.content).toBeDefined();
      expect(item.content.lines).toHaveLength(2);
      expect(item.content.lines[0].lineIndex).toBe(0);
      expect(item.content.lines[1].lineIndex).toBe(1);
      expect(item.content.marker).toBeUndefined();
      expect(item.content.dropCap).toBeUndefined();
    });

    it('resolves paragraph with left indent as paddingLeft', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello' }],
          attrs: { indent: { left: 36 } },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine()],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const line0 = (result.pages[0].items[0] as any).content.lines[0];
      expect(line0.paddingLeftPx).toBe(36);
      expect(line0.textIndentPx).toBe(0);
    });

    it('resolves paragraph with hanging indent', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 2, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello world test' }],
          attrs: { indent: { left: 0, hanging: 36 } },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine(), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      // First line: textIndent = -36 (firstLine(0) - hanging(36))
      expect(content.lines[0].textIndentPx).toBe(-36);
      // Body line: paddingLeft = hanging value
      expect(content.lines[1].paddingLeftPx).toBe(36);
    });

    it('resolves paragraph with firstLine indent', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 2, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello world test' }],
          attrs: { indent: { left: 36, firstLine: 72 } },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine(), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      // First line: paddingLeft = leftIndent, textIndent = firstLine
      expect(content.lines[0].paddingLeftPx).toBe(36);
      expect(content.lines[0].textIndentPx).toBe(72);
      // Body line: paddingLeft = leftIndent, no textIndent
      expect(content.lines[1].paddingLeftPx).toBe(36);
      expect(content.lines[1].textIndentPx).toBe(0);
    });

    it('resolves suppressFirstLineIndent with zero firstLineOffset', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello' }],
          attrs: { indent: { left: 36, firstLine: 72 }, suppressFirstLineIndent: true } as any,
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine()],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const line0 = (result.pages[0].items[0] as any).content.lines[0];
      // suppressFirstLineIndent means firstLineOffset = 0, so textIndent = 0
      expect(line0.textIndentPx).toBe(0);
    });

    it('resolves last-line skip justify correctly', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'p1',
                fromLine: 0,
                toLine: 2,
                x: 72,
                y: 100,
                width: 468,
              },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [{ kind: 'text', text: 'Hello world test' }] }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine(), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      expect(content.lines[0].skipJustify).toBe(false);
      expect(content.lines[1].skipJustify).toBe(true); // last line of last fragment
    });

    it('does not skip justify when continuesOnNext', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'p1',
                fromLine: 0,
                toLine: 1,
                x: 72,
                y: 100,
                width: 468,
                continuesOnNext: true,
              },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [{ kind: 'text', text: 'Hello' }] }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine()],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      expect(content.lines[0].skipJustify).toBe(false);
    });

    it('does not skip justify when paragraph ends with lineBreak', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello' }, { kind: 'lineBreak' }],
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine()],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      expect(content.lines[0].skipJustify).toBe(false);
      expect(content.paragraphEndsWithLineBreak).toBe(true);
    });

    it('resolves drop cap on first fragment', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello' }],
          attrs: {
            dropCapDescriptor: {
              mode: 'drop' as const,
              lines: 3,
              run: { text: 'H', fontFamily: 'Arial', fontSize: 72 },
            },
          },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine()],
          totalHeight: 20,
          dropCap: { width: 50, height: 60, lines: 3, mode: 'drop' as const },
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      expect(content.dropCap).toBeDefined();
      expect(content.dropCap.text).toBe('H');
      expect(content.dropCap.mode).toBe('drop');
      expect(content.dropCap.fontFamily).toBe('Arial');
      expect(content.dropCap.fontSize).toBe(72);
      expect(content.dropCap.width).toBe(50);
      expect(content.dropCap.height).toBe(60);
    });

    it('omits drop cap on continuation fragment', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'p1',
                fromLine: 1,
                toLine: 2,
                x: 72,
                y: 100,
                width: 468,
                continuesFromPrev: true,
              },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello world' }],
          attrs: {
            dropCapDescriptor: {
              mode: 'drop' as const,
              lines: 3,
              run: { text: 'H', fontFamily: 'Arial', fontSize: 72 },
            },
          },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine(), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
          dropCap: { width: 50, height: 60, lines: 3, mode: 'drop' as const },
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      expect(content.dropCap).toBeUndefined();
    });

    it('resolves list marker on first fragment', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'p1',
                fromLine: 0,
                toLine: 1,
                x: 72,
                y: 100,
                width: 468,
                markerWidth: 36,
                markerTextWidth: 10,
              },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'List item' }],
          attrs: {
            indent: { left: 36, hanging: 36 },
            wordLayout: {
              marker: {
                markerText: '1.',
                justification: 'left',
                suffix: 'tab',
                run: { fontFamily: 'Arial', fontSize: 12 },
              },
            },
          },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine()],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      expect(content.marker).toBeDefined();
      expect(content.marker.text).toBe('1.');
      expect(content.marker.justification).toBe('left');
      expect(content.marker.suffix).toBe('tab');
      expect(content.marker.run.fontFamily).toBe('Arial');
      expect(content.marker.run.fontSize).toBe(12);
      expect(content.lines[0].isListFirstLine).toBe(true);
    });

    it('omits marker on continuation fragment', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'p1',
                fromLine: 1,
                toLine: 2,
                x: 72,
                y: 100,
                width: 468,
                markerWidth: 36,
                markerTextWidth: 10,
                continuesFromPrev: true,
              },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'List item continued' }],
          attrs: {
            indent: { left: 36, hanging: 36 },
            wordLayout: {
              marker: {
                markerText: '1.',
                justification: 'left',
                suffix: 'tab',
                run: { fontFamily: 'Arial', fontSize: 12 },
              },
            },
          },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine(), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      expect(content.marker).toBeUndefined();
      expect(content.lines[0].isListFirstLine).toBe(false);
    });

    it('does not resolve content for table fragments', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'table',
                blockId: 't1',
                fromRow: 0,
                toRow: 1,
                x: 72,
                y: 100,
                width: 468,
                height: 200,
              },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'table',
          id: 't1',
          rows: [],
        } as any,
      ];
      const measures: Measure[] = [
        {
          kind: 'table',
          rows: [],
          totalHeight: 200,
        } as any,
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.content).toBeUndefined();
    });

    it('resolves available width from fragment width minus positive indents', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello' }],
          attrs: { indent: { left: 36, right: 36 } },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine()],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const line0 = (result.pages[0].items[0] as any).content.lines[0];
      // availableWidth = fragment.width - max(0, left) - max(0, right) = 468 - 36 - 36 = 396
      expect(line0.availableWidth).toBe(396);
    });
  });
});
