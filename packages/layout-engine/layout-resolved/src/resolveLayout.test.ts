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
  SourceAnchor,
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

  it('includes precomputed block versions for every supplied block', () => {
    const layout: Layout = {
      pageSize: { w: 612, h: 792 },
      pages: [
        {
          number: 1,
          fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 0, width: 468 }],
        },
      ],
    };
    const blocks: FlowBlock[] = [
      { kind: 'paragraph', id: 'p1', runs: [{ text: 'visible', fontFamily: 'Arial', fontSize: 12 }] } as any,
      { kind: 'paragraph', id: 'p2', runs: [{ text: 'lookup-only', fontFamily: 'Arial', fontSize: 12 }] } as any,
    ];
    const measures: Measure[] = [
      { kind: 'paragraph', lines: [{ lineHeight: 20 }] } as any,
      { kind: 'paragraph', lines: [{ lineHeight: 20 }] } as any,
    ];

    const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });

    expect(result.blockVersions).toBeDefined();
    expect(result.blockVersions).toHaveProperty('p1');
    expect(result.blockVersions).toHaveProperty('p2');
    expect(result.blockVersions?.p1).not.toBe(result.blockVersions?.p2);
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

  describe('paragraph/list-item block and measure lifting', () => {
    it('lifts block and measure from a paragraph fragment', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 100,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const paragraphBlock: FlowBlock = { kind: 'paragraph', id: 'p1', runs: [] };
      const paragraphMeasure: Measure = {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 10, width: 400, ascent: 12, descent: 4, lineHeight: 20 }],
        totalHeight: 20,
      };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [paragraphBlock],
        measures: [paragraphMeasure],
      });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.block).toBe(paragraphBlock);
      expect(item.measure).toBe(paragraphMeasure);
    });

    it('lifts block and measure from a list-item fragment', () => {
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
      const listBlock: FlowBlock = {
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
      };
      const listMeasure: Measure = {
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
      };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [listBlock],
        measures: [listMeasure],
      });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.block).toBe(listBlock);
      expect(item.measure).toBe(listMeasure);
    });

    it('leaves block and measure undefined when the block entry is missing', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'missing',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 100,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.block).toBeUndefined();
      expect(item.measure).toBeUndefined();
    });

    it('does not set ResolvedFragmentItem.block on table fragments (they use ResolvedTableItem.block)', () => {
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 't1',
        fromRow: 0,
        toRow: 1,
        x: 10,
        y: 20,
        width: 400,
        height: 80,
        columnWidths: [200, 200],
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [tableFragment] }],
      };
      const tableBlock = {
        kind: 'table' as const,
        id: 't1',
        rows: [],
        columnWidths: [200, 200],
      };
      const tableMeasure = {
        kind: 'table' as const,
        columnWidths: [200, 200],
        rows: [],
        totalHeight: 80,
      };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [tableBlock as any],
        measures: [tableMeasure as any],
      });
      // Table items carry block/measure as ResolvedTableItem typed fields.
      // They should NOT use the optional ResolvedFragmentItem.block path (no fall-through to the default branch).
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedTableItem;
      expect(item.fragmentKind).toBe('table');
      expect(item.block).toBe(tableBlock);
      expect(item.measure).toBe(tableMeasure);
    });
  });
  describe('fragment metadata lifting', () => {
    it('lifts pmStart and pmEnd from a paragraph fragment', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 100,
        width: 468,
        pmStart: 5,
        pmEnd: 42,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.pmStart).toBe(5);
      expect(item.pmEnd).toBe(42);
    });

    it('omits pmStart and pmEnd when not present on paragraph fragment', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 100,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.pmStart).toBeUndefined();
      expect(item.pmEnd).toBeUndefined();
    });

    it('lifts continuesFromPrev and continuesOnNext from a paragraph fragment', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 1,
        toLine: 3,
        x: 72,
        y: 72,
        width: 468,
        continuesFromPrev: true,
        continuesOnNext: true,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.continuesFromPrev).toBe(true);
      expect(item.continuesOnNext).toBe(true);
    });

    it('omits continuesFromPrev and continuesOnNext when not set', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 100,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.continuesFromPrev).toBeUndefined();
      expect(item.continuesOnNext).toBeUndefined();
    });

    it('lifts markerWidth from a paragraph fragment', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 100,
        width: 468,
        markerWidth: 36,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.markerWidth).toBe(36);
    });

    it('lifts continuesFromPrev, continuesOnNext, and markerWidth from a list-item fragment', () => {
      const listItemFragment: ListItemFragment = {
        kind: 'list-item',
        blockId: 'list1',
        itemId: 'item-a',
        fromLine: 1,
        toLine: 2,
        x: 108,
        y: 200,
        width: 432,
        markerWidth: 36,
        continuesFromPrev: true,
        continuesOnNext: false,
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
                  { fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 200, ascent: 12, descent: 4, lineHeight: 20 },
                  { fromRun: 0, fromChar: 5, toRun: 0, toChar: 10, width: 180, ascent: 12, descent: 4, lineHeight: 20 },
                ],
                totalHeight: 40,
              },
            },
          ],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.continuesFromPrev).toBe(true);
      expect(item.continuesOnNext).toBe(false);
      expect(item.markerWidth).toBe(36);
    });

    it('lifts pmStart, pmEnd, continuesFromPrev, and continuesOnNext from a table fragment', () => {
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'tbl1',
        fromRow: 0,
        toRow: 3,
        x: 72,
        y: 100,
        width: 468,
        height: 300,
        pmStart: 10,
        pmEnd: 200,
        continuesFromPrev: true,
        continuesOnNext: false,
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
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedTableItem;
      expect(item.pmStart).toBe(10);
      expect(item.pmEnd).toBe(200);
      expect(item.continuesFromPrev).toBe(true);
      expect(item.continuesOnNext).toBe(false);
    });

    it('omits pmStart and pmEnd from table fragment when not set', () => {
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
      const tableBlock = { kind: 'table' as const, id: 'tbl1', rows: [] };
      const tableMeasure = { kind: 'table' as const, rows: [], columnWidths: [], totalWidth: 0, totalHeight: 0 };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [tableBlock as any],
        measures: [tableMeasure as any],
      });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedTableItem;
      expect(item.pmStart).toBeUndefined();
      expect(item.pmEnd).toBeUndefined();
    });

    it('lifts pmStart, pmEnd, and metadata from an image fragment', () => {
      const imageFragment: ImageFragment = {
        kind: 'image',
        blockId: 'img1',
        x: 100,
        y: 200,
        width: 300,
        height: 250,
        pmStart: 15,
        pmEnd: 16,
        metadata: {
          originalWidth: 600,
          originalHeight: 500,
          maxWidth: 468,
          maxHeight: 700,
          aspectRatio: 1.2,
          minWidth: 50,
          minHeight: 42,
        },
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
      expect(item.pmStart).toBe(15);
      expect(item.pmEnd).toBe(16);
      expect(item.metadata).toEqual({
        originalWidth: 600,
        originalHeight: 500,
        maxWidth: 468,
        maxHeight: 700,
        aspectRatio: 1.2,
        minWidth: 50,
        minHeight: 42,
      });
    });

    it('omits metadata from image fragment when not set', () => {
      const imageFragment: ImageFragment = {
        kind: 'image',
        blockId: 'img1',
        x: 100,
        y: 200,
        width: 300,
        height: 250,
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
      expect(item.metadata).toBeUndefined();
    });

    it('lifts pmStart and pmEnd from a drawing fragment', () => {
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
        pmStart: 30,
        pmEnd: 31,
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
      expect(item.pmStart).toBe(30);
      expect(item.pmEnd).toBe(31);
    });

    it('omits pmStart and pmEnd from drawing fragment when not set', () => {
      const drawingFragment: DrawingFragment = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        blockId: 'dr1',
        x: 50,
        y: 60,
        width: 200,
        height: 150,
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
      expect(item.pmStart).toBeUndefined();
      expect(item.pmEnd).toBeUndefined();
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

    it('increases availableWidth on first line when hanging indent produces negative textIndent', () => {
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
          runs: [{ kind: 'text', text: 'Hello world test line' }],
          attrs: { indent: { left: 160, hanging: 160 } },
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
      // First line: textIndent = -160 (firstLine(0) - hanging(160))
      // availableWidth should account for the negative textIndent:
      // base = 468 - max(0, 160) = 308, then adjusted by -(-160) = 308 + 160 = 468
      expect(content.lines[0].textIndentPx).toBe(-160);
      expect(content.lines[0].availableWidth).toBe(468);
      // Body line: no textIndent adjustment, availableWidth stays at base
      expect(content.lines[1].textIndentPx).toBe(0);
      expect(content.lines[1].availableWidth).toBe(308);
    });

    it('decreases availableWidth on first line when firstLine indent produces positive textIndent', () => {
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
          runs: [{ kind: 'text', text: 'Hello world test line' }],
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
      // First line: textIndent = 72 (firstLine(72) - hanging(0))
      // availableWidth should be reduced: base = 468 - 36 = 432, then 432 - 72 = 360
      expect(content.lines[0].textIndentPx).toBe(72);
      expect(content.lines[0].availableWidth).toBe(360);
      // Body line: no textIndent, availableWidth = 468 - 36 = 432
      expect(content.lines[1].textIndentPx).toBe(0);
      expect(content.lines[1].availableWidth).toBe(432);
    });

    it('adjusts availableWidth for hanging indent even when line.maxWidth is set (Math.min clamps it)', () => {
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
          runs: [{ kind: 'text', text: 'Hello world test line' }],
          attrs: { indent: { left: 160, hanging: 160 } },
        },
      ];
      // The measurer sets maxWidth = contentWidth - firstLineOffset = (468-160) - (-160) = 468
      // but Math.min(468, fallback=308) clamps it to 308. The textIndent adjustment restores it.
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine({ maxWidth: 468 }), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      // First line: min(468, 308) = 308, then adjusted by -(-160) = 468
      expect(content.lines[0].textIndentPx).toBe(-160);
      expect(content.lines[0].availableWidth).toBe(468);
    });

    it('does not adjust availableWidth for list paragraphs with hanging indent', () => {
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
          runs: [{ kind: 'text', text: 'List item text here' }],
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
      // List first line: textIndentPx should be 0 (list marker occupies the hanging region),
      // so availableWidth should NOT be adjusted for hanging indent.
      expect(content.lines[0].textIndentPx).toBe(0);
      // base = 468 - max(0, 36) = 432 — stays at 432, no hanging indent adjustment
      expect(content.lines[0].availableWidth).toBe(432);
    });

    it('does not adjust availableWidth on continuation fragment even with hanging indent', () => {
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
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ kind: 'text', text: 'Hello world test line continued' }],
          attrs: { indent: { left: 160, hanging: 160 } },
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
      // Page 1: first line of paragraph — gets hanging indent adjustment
      const page1Content = (result.pages[0].items[0] as any).content;
      expect(page1Content.lines[0].textIndentPx).toBe(-160);
      expect(page1Content.lines[0].availableWidth).toBe(468);

      // Page 2: continuation fragment — first line here is NOT the paragraph's first line,
      // so textIndentPx should be 0 and availableWidth should NOT be adjusted.
      const page2Content = (result.pages[1].items[0] as any).content;
      expect(page2Content.lines[0].textIndentPx).toBe(0);
      // base = 468 - max(0, 160) = 308 — no adjustment
      expect(page2Content.lines[0].availableWidth).toBe(308);
    });

    it('does not adjust availableWidth when suppressFirstLineIndent is true', () => {
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
          runs: [{ kind: 'text', text: 'Hello world test line' }],
          attrs: { indent: { left: 160, hanging: 160 }, suppressFirstLineIndent: true } as any,
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
      // suppressFirstLineIndent zeroes the firstLineOffset, so textIndent = 0
      // and availableWidth stays at base = 468 - max(0, 160) = 308
      expect(content.lines[0].textIndentPx).toBe(0);
      expect(content.lines[0].availableWidth).toBe(308);
    });

    it('does not double-subtract positive firstLine indent when line.maxWidth already accounts for it', () => {
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
          runs: [{ kind: 'text', text: 'Hello world test line' }],
          attrs: { indent: { left: 36, firstLine: 72 } },
        },
      ];
      // The measurer sets maxWidth = contentWidth - firstLineOffset = 432 - 72 = 360
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [makeLine({ maxWidth: 360 }), makeLine({ fromChar: 10, toChar: 20 })],
          totalHeight: 40,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const content = (result.pages[0].items[0] as any).content;
      // First line: min(360, 432) = 360 — already correct, should NOT subtract again
      expect(content.lines[0].textIndentPx).toBe(72);
      expect(content.lines[0].availableWidth).toBe(360);
    });
  });

  describe('page metadata fields', () => {
    it('carries margins through to resolved page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [],
            margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36, gutter: 0 },
          },
        ],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].margins).toEqual({
        top: 72,
        right: 72,
        bottom: 72,
        left: 72,
        header: 36,
        footer: 36,
        gutter: 0,
      });
    });

    it('leaves margins undefined when page has no margins', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [] }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].margins).toBeUndefined();
    });

    it('carries footnoteReserved through to resolved page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [], footnoteReserved: 48 }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].footnoteReserved).toBe(48);
    });

    it('carries numberText through to resolved page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [], numberText: 'i' }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].numberText).toBe('i');
    });

    it('carries vAlign and baseMargins through to resolved page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [],
            vAlign: 'center',
            baseMargins: { top: 72, bottom: 72 },
          },
        ],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].vAlign).toBe('center');
      expect(result.pages[0].baseMargins).toEqual({ top: 72, bottom: 72 });
    });

    it('carries sectionIndex through to resolved page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [], sectionIndex: 2 }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].sectionIndex).toBe(2);
    });

    it('carries sectionRefs through to resolved page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [],
            sectionRefs: {
              headerRefs: { default: 'hdr1', first: 'hdr-first' },
              footerRefs: { default: 'ftr1' },
            },
          },
        ],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].sectionRefs).toEqual({
        headerRefs: { default: 'hdr1', first: 'hdr-first' },
        footerRefs: { default: 'ftr1' },
      });
    });

    it('carries orientation through to resolved page', () => {
      const layout: Layout = {
        pageSize: { w: 792, h: 612 },
        pages: [{ number: 1, fragments: [], orientation: 'landscape' }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.pages[0].orientation).toBe('landscape');
    });

    it('leaves optional metadata undefined when not set on source page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [] }],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const page = result.pages[0];
      expect(page.margins).toBeUndefined();
      expect(page.footnoteReserved).toBeUndefined();
      expect(page.numberText).toBeUndefined();
      expect(page.vAlign).toBeUndefined();
      expect(page.baseMargins).toBeUndefined();
      expect(page.sectionIndex).toBeUndefined();
      expect(page.sectionRefs).toBeUndefined();
      expect(page.orientation).toBeUndefined();
    });

    it('carries all metadata fields together on a fully-populated page', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 3,
            fragments: [],
            margins: { top: 72, right: 72, bottom: 72, left: 72 },
            footnoteReserved: 24,
            numberText: 'iii',
            vAlign: 'bottom',
            baseMargins: { top: 96, bottom: 96 },
            sectionIndex: 1,
            sectionRefs: {
              headerRefs: { default: 'h1' },
              footerRefs: { default: 'f1', even: 'f-even' },
            },
            orientation: 'portrait',
          },
        ],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const page = result.pages[0];
      expect(page.margins).toEqual({ top: 72, right: 72, bottom: 72, left: 72 });
      expect(page.footnoteReserved).toBe(24);
      expect(page.numberText).toBe('iii');
      expect(page.vAlign).toBe('bottom');
      expect(page.baseMargins).toEqual({ top: 96, bottom: 96 });
      expect(page.sectionIndex).toBe(1);
      expect(page.sectionRefs).toEqual({
        headerRefs: { default: 'h1' },
        footerRefs: { default: 'f1', even: 'f-even' },
      });
      expect(page.orientation).toBe('portrait');
    });
  });

  describe('layoutEpoch', () => {
    it('carries layoutEpoch from source layout to resolved layout', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [],
        layoutEpoch: 42,
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.layoutEpoch).toBe(42);
    });

    it('defaults layoutEpoch to undefined when not set', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [],
      };
      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      expect(result.layoutEpoch).toBeUndefined();
    });
  });
  describe('sdtContainerKey resolution', () => {
    it('sets sdtContainerKey for a paragraph with block structuredContent sdt', () => {
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
          runs: [],
          attrs: { sdt: { type: 'structuredContent', scope: 'block', id: 'sdt-1' } },
        },
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBe('structuredContent:sdt-1');
    });

    it('sets sdtContainerKey for a paragraph with documentSection sdt', () => {
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
          runs: [],
          attrs: { sdt: { type: 'documentSection', id: 'sec-1' } },
        },
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBe('documentSection:sec-1');
    });

    it('uses sdBlockId for documentSection when id is absent', () => {
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
          runs: [],
          attrs: { sdt: { type: 'documentSection', sdBlockId: 'blk-99' } },
        },
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBe('documentSection:blk-99');
    });

    it('falls back to containerSdt when primary sdt has no container config', () => {
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
          runs: [],
          attrs: {
            sdt: { type: 'structuredContent', scope: 'inline', id: 'inline-1' },
            containerSdt: { type: 'documentSection', id: 'sec-2' },
          },
        },
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBe('documentSection:sec-2');
    });

    it('returns null (omits sdtContainerKey) for inline structuredContent scope', () => {
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
          runs: [],
          attrs: { sdt: { type: 'structuredContent', scope: 'inline', id: 'inline-1' } },
        },
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBeUndefined();
    });

    it('omits sdtContainerKey when paragraph has no sdt', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBeUndefined();
    });

    it('sets sdtContainerKey for a list-item fragment from its item paragraph sdt', () => {
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
              paragraph: {
                kind: 'paragraph',
                id: 'item-a-p',
                runs: [],
                attrs: { sdt: { type: 'structuredContent', scope: 'block', id: 'list-sdt-1' } },
              },
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
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBe('structuredContent:list-sdt-1');
    });

    it('sets sdtContainerKey for a table fragment with sdt', () => {
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
      const tableBlock = {
        kind: 'table' as const,
        id: 'tbl1',
        rows: [],
        attrs: { sdt: { type: 'documentSection' as const, id: 'tbl-sec-1' } },
      };
      const tableMeasure = {
        kind: 'table' as const,
        rows: [],
        columnWidths: [],
        totalWidth: 0,
        totalHeight: 0,
      };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [tableBlock as any],
        measures: [tableMeasure as any],
      });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedTableItem;
      expect(item.sdtContainerKey).toBe('documentSection:tbl-sec-1');
    });

    it('omits sdtContainerKey for image and drawing fragments', () => {
      const imageFragment: ImageFragment = {
        kind: 'image',
        blockId: 'img1',
        x: 100,
        y: 200,
        width: 300,
        height: 250,
      };
      const drawingFragment: DrawingFragment = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        blockId: 'dr1',
        x: 50,
        y: 60,
        width: 200,
        height: 150,
        geometry: { width: 200, height: 150 },
        scale: 1,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [imageFragment, drawingFragment] }],
      };
      const imageBlock = { kind: 'image' as const, id: 'img1', src: 'test.png', width: 300, height: 250 };
      const drawingBlock = {
        kind: 'drawing' as const,
        id: 'dr1',
        drawingKind: 'vectorShape' as const,
        geometry: { width: 200, height: 150 },
      };

      const result = resolveLayout({
        layout,
        flowMode: 'paginated',
        blocks: [imageBlock, drawingBlock as any],
        measures: [
          { kind: 'image', width: 300, height: 250 },
          { kind: 'drawing', width: 200, height: 150 },
        ],
      });
      const imgItem = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedImageItem;
      const drItem = result.pages[0].items[1] as import('@superdoc/contracts').ResolvedDrawingItem;
      expect(imgItem.sdtContainerKey).toBeUndefined();
      expect(drItem.sdtContainerKey).toBeUndefined();
    });

    it('returns null (omits key) for structuredContent block scope with no id', () => {
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
          runs: [],
          attrs: { sdt: { type: 'structuredContent', scope: 'block' } },
        },
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBeUndefined();
    });

    it('returns null (omits key) for documentSection with no id or sdBlockId', () => {
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
          runs: [],
          attrs: { sdt: { type: 'documentSection' } },
        },
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.sdtContainerKey).toBeUndefined();
    });
  });

  describe('paragraphBorders pre-computation', () => {
    it('populates paragraphBorders and paragraphBorderHash for a paragraph with borders', () => {
      const borders = {
        top: { style: 'solid' as const, width: 4, color: '#000000' },
        bottom: { style: 'solid' as const, width: 4, color: '#000000' },
        left: { style: 'solid' as const, width: 4, color: '#000000' },
        right: { style: 'solid' as const, width: 4, color: '#000000' },
        between: { style: 'solid' as const, width: 4, color: '#000000' },
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [], attrs: { borders } }];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 200, ascent: 12, descent: 4, lineHeight: 20 }],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.paragraphBorders).toEqual(borders);
      expect(item.paragraphBorderHash).toBeDefined();
      expect(typeof item.paragraphBorderHash).toBe('string');
      expect(item.paragraphBorderHash!.length).toBeGreaterThan(0);
    });

    it('omits paragraphBorders and paragraphBorderHash when paragraph has no borders', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 }],
          },
        ],
      };
      const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.paragraphBorders).toBeUndefined();
      expect(item.paragraphBorderHash).toBeUndefined();
    });

    it('produces matching hashes for identical border definitions', () => {
      const borders = {
        top: { style: 'solid' as const, width: 4, color: '#000000' },
        bottom: { style: 'solid' as const, width: 4, color: '#000000' },
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              { kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 },
              { kind: 'para', blockId: 'p2', fromLine: 0, toLine: 1, x: 72, y: 130, width: 468 },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [], attrs: { borders } },
        { kind: 'paragraph', id: 'p2', runs: [], attrs: { borders: { ...borders } } },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 200, ascent: 12, descent: 4, lineHeight: 20 }],
          totalHeight: 20,
        },
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 200, ascent: 12, descent: 4, lineHeight: 20 }],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item0 = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      const item1 = result.pages[0].items[1] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item0.paragraphBorderHash).toBe(item1.paragraphBorderHash);
    });

    it('produces different hashes for different border definitions', () => {
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              { kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 72, y: 100, width: 468 },
              { kind: 'para', blockId: 'p2', fromLine: 0, toLine: 1, x: 72, y: 130, width: 468 },
            ],
          },
        ],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [],
          attrs: { borders: { top: { style: 'solid' as const, width: 4, color: '#000000' } } },
        },
        {
          kind: 'paragraph',
          id: 'p2',
          runs: [],
          attrs: { borders: { top: { style: 'dashed' as const, width: 2, color: '#FF0000' } } },
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 200, ascent: 12, descent: 4, lineHeight: 20 }],
          totalHeight: 20,
        },
        {
          kind: 'paragraph',
          lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 200, ascent: 12, descent: 4, lineHeight: 20 }],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item0 = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      const item1 = result.pages[0].items[1] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item0.paragraphBorderHash).not.toBe(item1.paragraphBorderHash);
    });

    it('populates paragraphBorders for list-item fragments', () => {
      const borders = {
        top: { style: 'solid' as const, width: 2, color: '#0000FF' },
        between: { style: 'solid' as const, width: 1, color: '#0000FF' },
      };
      const listItemFragment: ListItemFragment = {
        kind: 'list-item',
        blockId: 'list1',
        itemId: 'item-a',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 100,
        width: 468,
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
              paragraph: { kind: 'paragraph', id: 'item-a-p', runs: [], attrs: { borders } },
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
                  { fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 200, ascent: 12, descent: 4, lineHeight: 20 },
                ],
                totalHeight: 20,
              },
            },
          ],
          totalHeight: 20,
        },
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as import('@superdoc/contracts').ResolvedFragmentItem;
      expect(item.paragraphBorders).toEqual(borders);
      expect(item.paragraphBorderHash).toBeDefined();
    });

    it('does not add paragraphBorders to table items', () => {
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'tbl1',
        fromRow: 0,
        toRow: 1,
        x: 72,
        y: 100,
        width: 468,
        height: 100,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [tableFragment] }],
      };
      const blocks: FlowBlock[] = [{ kind: 'table', id: 'tbl1', rows: [{ cells: [] }] } as any];
      const measures: Measure[] = [
        {
          kind: 'table',
          columnWidths: [468],
          rows: [{ cells: [{ width: 468, height: 100 }] }],
        } as any,
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.paragraphBorders).toBeUndefined();
      expect(item.paragraphBorderHash).toBeUndefined();
    });
  });

  describe('version signature', () => {
    it('sets version on paragraph fragment items', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'hello', fontFamily: 'Arial', fontSize: 12 }] } as any,
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [{ lineHeight: 20 }] } as any];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.version).toBeDefined();
      expect(typeof item.version).toBe('string');
      expect(item.version.length).toBeGreaterThan(0);
    });

    it('sets version on table fragment items', () => {
      const tableFragment: TableFragment = {
        kind: 'table',
        blockId: 'tbl1',
        fromRow: 0,
        toRow: 1,
        x: 72,
        y: 0,
        width: 468,
        height: 100,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [tableFragment] }],
      };
      const blocks: FlowBlock[] = [{ kind: 'table', id: 'tbl1', rows: [{ cells: [] }] } as any];
      const measures: Measure[] = [
        {
          kind: 'table',
          columnWidths: [468],
          rows: [{ cells: [{ width: 468, height: 100 }] }],
        } as any,
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.version).toBeDefined();
      expect(typeof item.version).toBe('string');
    });

    it('sets version on image fragment items', () => {
      const imageFragment: ImageFragment = {
        kind: 'image',
        blockId: 'img1',
        x: 72,
        y: 0,
        width: 200,
        height: 150,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [imageFragment] }],
      };
      const blocks: FlowBlock[] = [{ kind: 'image', id: 'img1', src: 'test.png', width: 200, height: 150 } as any];
      const measures: Measure[] = [{ kind: 'image' } as any];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.version).toBeDefined();
      expect(typeof item.version).toBe('string');
    });

    it('sets version on drawing fragment items', () => {
      const drawingFragment: DrawingFragment = {
        kind: 'drawing',
        blockId: 'dr1',
        drawingKind: 'image',
        x: 72,
        y: 0,
        width: 200,
        height: 150,
        geometry: { width: 200, height: 150 },
        scale: 1,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [drawingFragment] }],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          drawingKind: 'image',
          id: 'dr1',
          src: 'test.png',
          width: 200,
          height: 150,
          geometry: { width: 200, height: 150 },
        } as any,
      ];
      const measures: Measure[] = [{ kind: 'drawing' } as any];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.version).toBeDefined();
      expect(typeof item.version).toBe('string');
    });

    it('sets version on list-item fragment items', () => {
      const listFragment: ListItemFragment = {
        kind: 'list-item',
        blockId: 'list1',
        itemId: 'item1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [listFragment] }],
      };
      const blocks: FlowBlock[] = [
        {
          kind: 'list',
          id: 'list1',
          items: [
            {
              id: 'item1',
              marker: { text: '1.' },
              paragraph: {
                kind: 'paragraph',
                id: 'p-item1',
                runs: [{ text: 'item', fontFamily: 'Arial', fontSize: 12 }],
              },
            },
          ],
        } as any,
      ];
      const measures: Measure[] = [
        {
          kind: 'list',
          items: [{ itemId: 'item1', paragraph: { kind: 'paragraph', lines: [{ lineHeight: 20 }] } }],
        } as any,
      ];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0] as any;
      expect(item.version).toBeDefined();
      expect(typeof item.version).toBe('string');
    });

    it('produces different versions when block content changes', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const measures: Measure[] = [{ kind: 'paragraph', lines: [{ lineHeight: 20 }] } as any];

      const blocks1: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'hello', fontFamily: 'Arial', fontSize: 12 }] } as any,
      ];
      const blocks2: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'world', fontFamily: 'Arial', fontSize: 12 }] } as any,
      ];

      const result1 = resolveLayout({ layout, flowMode: 'paginated', blocks: blocks1, measures });
      const result2 = resolveLayout({ layout, flowMode: 'paginated', blocks: blocks2, measures });
      const ver1 = (result1.pages[0].items[0] as any).version;
      const ver2 = (result2.pages[0].items[0] as any).version;
      expect(ver1).not.toBe(ver2);
    });

    it('produces same version for identical inputs', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'hello', fontFamily: 'Arial', fontSize: 12 }] } as any,
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [{ lineHeight: 20 }] } as any];

      const result1 = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const result2 = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const ver1 = (result1.pages[0].items[0] as any).version;
      const ver2 = (result2.pages[0].items[0] as any).version;
      expect(ver1).toBe(ver2);
    });

    it('keeps visual version stable but changes paint cache version when source evidence changes', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };
      const measures: Measure[] = [{ kind: 'paragraph', lines: [{ lineHeight: 20 }] } as any];
      const anchorA: SourceAnchor = {
        sourceNodeId: 'srcnode_a',
        occurrenceId: 'occ_a',
        sourceRef: { partUri: 'word/document.xml', xpathLikePath: '/w:document[1]/w:body[1]/w:p[1]' },
      };
      const anchorB: SourceAnchor = {
        sourceNodeId: 'srcnode_b',
        occurrenceId: 'occ_b',
        sourceRef: { partUri: 'word/document.xml', xpathLikePath: '/w:document[1]/w:body[1]/w:p[1]' },
      };
      const blocks1: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          sourceAnchor: anchorA,
          runs: [{ text: 'hello', fontFamily: 'Arial', fontSize: 12 }],
        } as any,
      ];
      const blocks2: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          sourceAnchor: anchorB,
          runs: [{ text: 'hello', fontFamily: 'Arial', fontSize: 12 }],
        } as any,
      ];

      const result1 = resolveLayout({ layout, flowMode: 'paginated', blocks: blocks1, measures });
      const result2 = resolveLayout({ layout, flowMode: 'paginated', blocks: blocks2, measures });
      const item1 = result1.pages[0].items[0] as any;
      const item2 = result2.pages[0].items[0] as any;

      expect(item1.version).toBe(item2.version);
      expect(item1.evidenceVersion).not.toBe(item2.evidenceVersion);
      expect(item1.paintCacheVersion).not.toBe(item2.paintCacheVersion);
    });

    it('produces different versions when fragment line range changes', () => {
      const fragment1: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const fragment2: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 2,
        x: 72,
        y: 0,
        width: 468,
      };
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'hello', fontFamily: 'Arial', fontSize: 12 }] } as any,
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [{ lineHeight: 20 }, { lineHeight: 20 }] } as any];

      const layout1: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [fragment1] }],
      };
      const layout2: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [fragment2] }],
      };

      const result1 = resolveLayout({ layout: layout1, flowMode: 'paginated', blocks, measures });
      const result2 = resolveLayout({ layout: layout2, flowMode: 'paginated', blocks, measures });
      const ver1 = (result1.pages[0].items[0] as any).version;
      const ver2 = (result2.pages[0].items[0] as any).version;
      expect(ver1).not.toBe(ver2);
    });

    it('caches block version across fragments sharing the same block', () => {
      const frag1: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const frag2: ParaFragment = {
        kind: 'para',
        blockId: 'p1',
        fromLine: 1,
        toLine: 2,
        x: 72,
        y: 20,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [frag1, frag2] }],
      };
      const blocks: FlowBlock[] = [
        { kind: 'paragraph', id: 'p1', runs: [{ text: 'hello world', fontFamily: 'Arial', fontSize: 12 }] } as any,
      ];
      const measures: Measure[] = [{ kind: 'paragraph', lines: [{ lineHeight: 20 }, { lineHeight: 20 }] } as any];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const ver1 = (result.pages[0].items[0] as any).version;
      const ver2 = (result.pages[0].items[1] as any).version;

      // Both versions should be defined
      expect(ver1).toBeDefined();
      expect(ver2).toBeDefined();
      // They should differ (different line ranges)
      expect(ver1).not.toBe(ver2);
      // But both share the same block version prefix
      const prefix1 = ver1.split('|')[0];
      const prefix2 = ver2.split('|')[0];
      expect(prefix1).toBe(prefix2);
    });

    it('uses "missing" for fragments with no matching block', () => {
      const paraFragment: ParaFragment = {
        kind: 'para',
        blockId: 'nonexistent',
        fromLine: 0,
        toLine: 1,
        x: 72,
        y: 0,
        width: 468,
      };
      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [{ number: 1, fragments: [paraFragment] }],
      };

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0] as any;
      expect(item.version).toBeDefined();
      expect(item.version).toContain('missing');
    });
  });
});
