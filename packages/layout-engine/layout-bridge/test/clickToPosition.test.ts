import { describe, it, expect } from 'bun:test';
import { clickToPosition, hitTestPage } from '../src/index.ts';
import type { Layout } from '@superdoc/contracts';
import {
  simpleLayout,
  blocks,
  measures,
  multiLineLayout,
  multiBlocks,
  multiMeasures,
  drawingLayout,
  drawingBlock,
  drawingMeasure,
} from './mock-data';

describe('clickToPosition', () => {
  it('maps point to PM position near start', () => {
    const result = clickToPosition(simpleLayout, blocks, measures, { x: 40, y: 60 });
    expect(result?.pos).toBeGreaterThanOrEqual(1);
    expect(result?.pos).toBeLessThan(5);
  });

  it('maps point to end of line when clicking near right edge', () => {
    const result = clickToPosition(simpleLayout, blocks, measures, { x: 320, y: 60 });
    expect(result?.pos).toBeGreaterThan(7);
  });

  it('handles multi-line layout', () => {
    const result = clickToPosition(multiLineLayout, multiBlocks, multiMeasures, { x: 50, y: 75 });
    expect(result?.pos).toBeGreaterThan(1);
    expect(result?.pos).toBeGreaterThan(9);
  });

  it('returns drawing position when clicking on drawing fragment', () => {
    const result = clickToPosition(drawingLayout, [drawingBlock], [drawingMeasure], { x: 70, y: 90 });
    expect(result?.blockId).toBe('drawing-0');
    expect(result?.pos).toBe(20);
  });
});

describe('hitTestPage with pageGap', () => {
  const twoPageLayout: Layout = {
    pageSize: { w: 400, h: 500 },
    pageGap: 24,
    pages: [
      { number: 1, fragments: [] },
      { number: 2, fragments: [] },
      { number: 3, fragments: [] },
    ],
  };

  it('correctly identifies page 0 with pageGap', () => {
    // Page 0 spans y: [0, 500)
    const result = hitTestPage(twoPageLayout, { x: 100, y: 250 });
    expect(result?.pageIndex).toBe(0);
  });

  it('correctly identifies page 1 with pageGap', () => {
    // Page 1 starts at y = 500 + 24 = 524, spans [524, 1024)
    const result = hitTestPage(twoPageLayout, { x: 100, y: 600 });
    expect(result?.pageIndex).toBe(1);
  });

  it('correctly identifies page 2 with pageGap', () => {
    // Page 2 starts at y = 2*(500 + 24) = 1048, spans [1048, 1548)
    const result = hitTestPage(twoPageLayout, { x: 100, y: 1100 });
    expect(result?.pageIndex).toBe(2);
  });

  it('snaps to nearest page when clicking in gap between pages', () => {
    // Gap between page 0 and 1 is [500, 524); should snap to nearest page center
    const result = hitTestPage(twoPageLayout, { x: 100, y: 510 });
    expect(result?.pageIndex).toBe(0);
  });

  it('handles zero pageGap correctly', () => {
    const layoutNoGap: Layout = {
      pageSize: { w: 400, h: 500 },
      pageGap: 0,
      pages: [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ],
    };
    // Page 1 starts immediately at y = 500
    const result = hitTestPage(layoutNoGap, { x: 100, y: 500 });
    expect(result?.pageIndex).toBe(1);
  });

  it('handles undefined pageGap (defaults to 0)', () => {
    const layoutUndefinedGap: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ],
    };
    // With no gap, page 1 starts at y = 500
    const result = hitTestPage(layoutUndefinedGap, { x: 100, y: 500 });
    expect(result?.pageIndex).toBe(1);
  });
});
