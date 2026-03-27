import { describe, it, expect } from 'vitest';
import { resolveLayout } from './resolveLayout.js';
import type { Layout } from '@superdoc/contracts';

describe('resolveLayout', () => {
  const baseLayout: Layout = {
    pageSize: { w: 800, h: 1000 },
    pages: [],
  };

  it('returns valid ResolvedLayout for empty pages', () => {
    const result = resolveLayout({ layout: baseLayout, flowMode: 'paginated' });
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
    const result = resolveLayout({ layout, flowMode: 'paginated' });
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
    const result = resolveLayout({ layout, flowMode: 'paginated' });
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
    const result = resolveLayout({ layout, flowMode: 'semantic' });
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
    const a = resolveLayout({ layout, flowMode: 'paginated' });
    const b = resolveLayout({ layout, flowMode: 'paginated' });
    expect(a).toEqual(b);
  });

  it('defaults pageGap to 0 when layout.pageGap is undefined', () => {
    const result = resolveLayout({ layout: baseLayout, flowMode: 'paginated' });
    expect(result.pageGap).toBe(0);
  });
});
