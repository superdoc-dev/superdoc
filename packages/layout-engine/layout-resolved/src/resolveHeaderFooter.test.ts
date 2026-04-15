import { describe, it, expect } from 'vitest';
import { resolveHeaderFooterLayout } from './resolveHeaderFooter.js';
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
});
