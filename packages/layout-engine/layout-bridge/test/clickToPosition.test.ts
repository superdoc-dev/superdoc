import { describe, it, expect } from 'vitest';
import { clickToPosition, hitTestPage, hitTestTableFragment } from '../src/index.ts';
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
  rowspanTableLayout,
  rowspanTableBlock,
  rowspanTableMeasure,
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

describe('hitTestTableFragment with rowspan (SD-1626 / IT-22)', () => {
  // Table is at x:30, y:60, width:300, height:48
  // Row 0: y:60-84 (height 24) - has 3 cells
  // Row 1: y:84-108 (height 24) - has 2 cells starting at gridColumnStart=1

  it('selects first cell when clicking in rowspanned area, not last cell', () => {
    // Table structure:
    // Row 0: [Cell A (rowspan=2)] [Cell B] [Cell C]
    // Row 1:                      [Cell D] [Cell E]
    //
    // When clicking in the rowspanned area (column 0) on row 1,
    // the first cell in row 1 (Cell D at index 0) should be selected,
    // NOT the last cell (Cell E at index 1).

    // Click at x=80 (in column 0 area), y=90 (in row 1)
    const pageHit = hitTestPage(rowspanTableLayout, { x: 80, y: 90 });
    expect(pageHit).not.toBeNull();

    if (pageHit) {
      // x=80 -> localX=50 (in rowspanned area, column 0 is 0-100)
      // y=90 -> localY=30 (row 1 starts at y=24 relative to table)
      const result = hitTestTableFragment(pageHit, [rowspanTableBlock], [rowspanTableMeasure], { x: 80, y: 90 });

      expect(result).not.toBeNull();
      if (result) {
        // Should select first cell (index 0), not last cell (index 1)
        expect(result.cellColIndex).toBe(0);
        // Row should be 1 (the row we clicked on)
        expect(result.cellRowIndex).toBe(1);
      }
    }
  });

  it('still selects last cell when clicking right of all columns', () => {
    // Click at x=320 (right edge of table but still inside), y=90 (row 1)
    // Table ends at x=330, so x=320 is still inside
    const pageHit = hitTestPage(rowspanTableLayout, { x: 320, y: 90 });
    expect(pageHit).not.toBeNull();

    if (pageHit) {
      // x=320 -> localX=290 (right of all cells: col0=0-100, col1=100-200, col2=200-300)
      // But row 1 cells start at gridColumnStart=1, so they span 100-300
      // localX=290 is within cell at gridColumnStart=2 (200-300)
      const result = hitTestTableFragment(pageHit, [rowspanTableBlock], [rowspanTableMeasure], { x: 320, y: 90 });

      expect(result).not.toBeNull();
      if (result) {
        // Should select the cell at gridColumnStart=2 (last cell in row 1)
        expect(result.cellColIndex).toBe(1); // Last cell in row 1
        expect(result.cellRowIndex).toBe(1);
      }
    }
  });
});
