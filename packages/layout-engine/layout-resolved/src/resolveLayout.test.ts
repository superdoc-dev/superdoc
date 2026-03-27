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
      expect(item).toEqual({
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

    it('resolves an image fragment with height and zIndex', () => {
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
      const blocks: FlowBlock[] = [{ kind: 'image', id: 'img1', src: 'test.png', width: 300, height: 250 }];
      const measures: Measure[] = [{ kind: 'image', width: 300, height: 250 }];

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
      const item = result.pages[0].items[0];
      expect(item).toMatchObject({
        kind: 'fragment',
        id: 'image:img1:100:200',
        fragmentKind: 'image',
        height: 250,
        zIndex: 5,
      });
    });

    it('resolves a drawing fragment with zIndex', () => {
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

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0];
      expect(item).toMatchObject({
        id: 'drawing:dr1:50:60',
        fragmentKind: 'drawing',
        height: 150,
        zIndex: 3,
      });
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

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
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

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
      const item = result.pages[0].items[0];
      expect(item.id).toBe('table:tbl1:0:3:0,0,1-2,3,-1');
      expect(item.height).toBe(300);
      expect(item.fragmentKind).toBe('table');
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

      const result = resolveLayout({ layout, flowMode: 'paginated', blocks: [], measures: [] });
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
});
