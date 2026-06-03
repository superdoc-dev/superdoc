import { describe, it, expect } from 'vitest';
import { resolveHeaderFooterLayout } from './resolveHeaderFooter.js';
import { namedStoryLocator } from '@superdoc/contracts';
import type { FlowBlock, HeaderFooterLayout, Measure, ParaFragment, ResolvedFragmentItem } from '@superdoc/contracts';

describe('resolveHeaderFooterLayout', () => {
  it('resolves a header/footer with one paragraph fragment', () => {
    const paraFragment: ParaFragment = {
      kind: 'para',
      blockId: 'p1',
      fromLine: 0,
      toLine: 1,
      x: 72,
      y: 10,
      width: 468,
    };
    const layout: HeaderFooterLayout = {
      height: 50,
      pages: [{ number: 1, fragments: [paraFragment] }],
    };
    const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }];
    const measures: Measure[] = [
      {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 5, width: 100, ascent: 10, descent: 3, lineHeight: 18 }],
        totalHeight: 18,
      },
    ];

    const result = resolveHeaderFooterLayout(layout, blocks, measures);
    expect(result.pages).toHaveLength(1);
    const item = result.pages[0].items[0] as ResolvedFragmentItem;
    expect(item.version).toBeDefined();
    expect(item.block?.kind).toBe('paragraph');
    expect(item.measure?.kind).toBe('paragraph');
  });

  it('stamps resolved fragment identities with the supplied header/footer story', () => {
    const paraFragment: ParaFragment = {
      kind: 'para',
      blockId: 'header-p1',
      fromLine: 0,
      toLine: 1,
      x: 72,
      y: 10,
      width: 468,
    };
    const layout: HeaderFooterLayout = {
      height: 50,
      pages: [{ number: 1, fragments: [paraFragment] }],
    };
    const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'header-p1', runs: [] }];
    const measures: Measure[] = [
      {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 0, width: 100, ascent: 10, descent: 3, lineHeight: 18 }],
        totalHeight: 18,
      },
    ];

    const result = resolveHeaderFooterLayout(layout, blocks, measures, namedStoryLocator('header', 'rIdHeader1'));
    const item = result.pages[0].items[0] as ResolvedFragmentItem;

    expect(item.layoutSourceIdentity?.story).toEqual({ kind: 'header', id: 'rIdHeader1' });
    expect(item.layoutSourceIdentity?.fragmentId).toContain('header:rIdHeader1');
  });

  it('preserves height, minY, maxY, renderHeight from input', () => {
    const layout: HeaderFooterLayout = {
      height: 100,
      minY: 5,
      maxY: 120,
      renderHeight: 115,
      pages: [],
    };

    const result = resolveHeaderFooterLayout(layout, [], []);
    expect(result.height).toBe(100);
    expect(result.minY).toBe(5);
    expect(result.maxY).toBe(120);
    expect(result.renderHeight).toBe(115);
  });

  it('preserves numberText on pages', () => {
    const layout: HeaderFooterLayout = {
      height: 50,
      pages: [
        { number: 1, fragments: [], numberText: 'i' },
        { number: 2, fragments: [], numberText: 'ii' },
      ],
    };

    const result = resolveHeaderFooterLayout(layout, [], []);
    expect(result.pages[0].numberText).toBe('i');
    expect(result.pages[1].numberText).toBe('ii');
  });

  it('returns empty items array for empty fragments array', () => {
    const layout: HeaderFooterLayout = {
      height: 50,
      pages: [{ number: 1, fragments: [] }],
    };

    const result = resolveHeaderFooterLayout(layout, [], []);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].items).toEqual([]);
  });

  it('leaves block/measure undefined when block entry is missing', () => {
    const paraFragment: ParaFragment = {
      kind: 'para',
      blockId: 'missing-id',
      fromLine: 0,
      toLine: 1,
      x: 0,
      y: 0,
      width: 100,
    };
    const layout: HeaderFooterLayout = {
      height: 50,
      pages: [{ number: 1, fragments: [paraFragment] }],
    };

    const result = resolveHeaderFooterLayout(layout, [], []);
    const item = result.pages[0].items[0] as ResolvedFragmentItem;
    expect(item.block).toBeUndefined();
    expect(item.measure).toBeUndefined();
  });

  it('resolves each page against its own cloned block data', () => {
    const paraFragment: ParaFragment = {
      kind: 'para',
      blockId: 'page-token',
      fromLine: 0,
      toLine: 1,
      x: 0,
      y: 0,
      width: 120,
    };
    const pageOneBlocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'page-token',
        runs: [
          { text: 'Page ', fontFamily: 'Arial', fontSize: 16 },
          { text: '1', token: 'pageNumber', fontFamily: 'Arial', fontSize: 16 },
        ],
      },
    ];
    const pageTwoBlocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'page-token',
        runs: [
          { text: 'Page ', fontFamily: 'Arial', fontSize: 16 },
          { text: '2', token: 'pageNumber', fontFamily: 'Arial', fontSize: 16 },
        ],
      },
    ];
    const makeMeasure = (text: string): Measure => ({
      kind: 'paragraph',
      lines: [
        { fromRun: 0, fromChar: 0, toRun: 1, toChar: text.length, width: 120, ascent: 10, descent: 3, lineHeight: 18 },
      ],
      totalHeight: 18,
    });
    const layout: HeaderFooterLayout = {
      height: 50,
      pages: [
        { number: 1, fragments: [paraFragment], blocks: pageOneBlocks, measures: [makeMeasure('Page 1')] },
        { number: 2, fragments: [paraFragment], blocks: pageTwoBlocks, measures: [makeMeasure('Page 2')] },
      ],
    };

    const result = resolveHeaderFooterLayout(layout, pageOneBlocks, [makeMeasure('Page 1')]);
    const firstItem = result.pages[0].items[0] as ResolvedFragmentItem;
    const secondItem = result.pages[1].items[0] as ResolvedFragmentItem;

    expect(firstItem.block?.kind).toBe('paragraph');
    expect(secondItem.block?.kind).toBe('paragraph');
    expect(firstItem.block?.runs[1]?.text).toBe('1');
    expect(secondItem.block?.runs[1]?.text).toBe('2');
    expect(firstItem.version).not.toBe(secondItem.version);
  });

  it('uses document page indices for sparse header/footer pages', () => {
    const paraFragment: ParaFragment = {
      kind: 'para',
      blockId: 'p1',
      fromLine: 0,
      toLine: 1,
      x: 0,
      y: 0,
      width: 100,
    };
    const layout: HeaderFooterLayout = {
      height: 50,
      pages: [
        { number: 5, fragments: [paraFragment], numberText: '5' },
        { number: 50, fragments: [paraFragment], numberText: '50' },
        { number: 500, fragments: [paraFragment], numberText: '500' },
      ],
    };
    const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [] }];
    const measures: Measure[] = [
      {
        kind: 'paragraph',
        lines: [{ fromRun: 0, fromChar: 0, toRun: 0, toChar: 0, width: 100, ascent: 10, descent: 3, lineHeight: 18 }],
        totalHeight: 18,
      },
    ];

    const result = resolveHeaderFooterLayout(layout, blocks, measures);

    expect((result.pages[0].items[0] as ResolvedFragmentItem).pageIndex).toBe(4);
    expect((result.pages[1].items[0] as ResolvedFragmentItem).pageIndex).toBe(49);
    expect((result.pages[2].items[0] as ResolvedFragmentItem).pageIndex).toBe(499);
  });
});
