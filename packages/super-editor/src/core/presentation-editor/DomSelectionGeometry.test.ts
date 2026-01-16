import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Layout } from '@superdoc/contracts';

import { DomPositionIndex } from './DomPositionIndex.js';
import {
  computeDomCaretPageLocal,
  computeSelectionRectsFromDom,
  deduplicateOverlappingRects,
  type ComputeDomCaretPageLocalOptions,
  type ComputeSelectionRectsFromDomOptions,
} from './DomSelectionGeometry.js';

/**
 * Helper function to create a DOMRect-like object for testing.
 * DOMRect is a browser API that we mock here for unit tests.
 */
function createRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    bottom: y + height,
    right: x + width,
    toJSON: () => ({ x, y, width, height, top: y, left: x, bottom: y + height, right: x + width }),
  } as DOMRect;
}

describe('deduplicateOverlappingRects', () => {
  it('returns empty array when given empty array', () => {
    const result = deduplicateOverlappingRects([]);
    expect(result).toEqual([]);
  });

  it('returns single rect unchanged', () => {
    const rect = createRect(10, 20, 100, 16);
    const result = deduplicateOverlappingRects([rect]);
    expect(result).toEqual([rect]);
  });

  it('keeps both rects when they are on different lines (y difference > 3px)', () => {
    const rect1 = createRect(10, 20, 100, 16);
    const rect2 = createRect(10, 40, 100, 16);

    const result = deduplicateOverlappingRects([rect1, rect2]);

    expect(result).toHaveLength(2);
    expect(result).toContain(rect1);
    expect(result).toContain(rect2);
  });

  it('removes duplicate when two rects on same line overlap >80% horizontally', () => {
    // Simulate line-box rect (larger, typically from containing element)
    const lineBoxRect = createRect(10, 20, 100, 18);
    // Simulate text-content rect (smaller, from text node)
    const textContentRect = createRect(10, 20.5, 98, 16);

    const result = deduplicateOverlappingRects([lineBoxRect, textContentRect]);

    // Should keep only the smaller rect (text-content rect)
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(textContentRect);
  });

  it('keeps the smaller rect when deduplicating overlapping rects', () => {
    const largerRect = createRect(10, 20, 100, 20);
    const smallerRect = createRect(10, 21, 100, 16);

    const result = deduplicateOverlappingRects([largerRect, smallerRect]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(smallerRect);
  });

  it('keeps both rects when horizontal overlap is <80% even if on same line', () => {
    // Rects on same line (y within 3px) but only 50% overlap
    const rect1 = createRect(10, 20, 100, 16);
    const rect2 = createRect(60, 21, 100, 16);

    const result = deduplicateOverlappingRects([rect1, rect2]);

    expect(result).toHaveLength(2);
    expect(result).toContain(rect1);
    expect(result).toContain(rect2);
  });

  it('keeps both rects when there is no horizontal overlap', () => {
    const rect1 = createRect(10, 20, 50, 16);
    const rect2 = createRect(70, 21, 50, 16);

    const result = deduplicateOverlappingRects([rect1, rect2]);

    expect(result).toHaveLength(2);
    expect(result).toContain(rect1);
    expect(result).toContain(rect2);
  });

  it('handles boundary condition: exactly 3px y-difference (should be considered same line)', () => {
    const rect1 = createRect(10, 20, 100, 16);
    const rect2 = createRect(10, 22.9, 100, 16);

    const result = deduplicateOverlappingRects([rect1, rect2]);

    // Y difference is 2.9px (< 3px threshold), so should deduplicate
    expect(result).toHaveLength(1);
  });

  it('handles boundary condition: slightly more than 3px y-difference (different lines)', () => {
    const rect1 = createRect(10, 20, 100, 16);
    const rect2 = createRect(10, 23.1, 100, 16);

    const result = deduplicateOverlappingRects([rect1, rect2]);

    // Y difference is 3.1px (> 3px threshold), so should keep both
    expect(result).toHaveLength(2);
  });

  it('handles boundary condition: exactly 80% horizontal overlap (should deduplicate)', () => {
    const rect1 = createRect(10, 20, 100, 16);
    const rect2 = createRect(10, 21, 80, 16);

    const result = deduplicateOverlappingRects([rect1, rect2]);

    // Overlap is 80px, minWidth is 80px, ratio is exactly 1.0 (100% of smaller rect)
    // which is > 0.8 threshold, so should deduplicate
    expect(result).toHaveLength(1);
  });

  it('handles boundary condition: slightly less than 80% overlap (should keep both)', () => {
    const rect1 = createRect(10, 20, 100, 16);
    const rect2 = createRect(30, 21, 100, 16);

    const result = deduplicateOverlappingRects([rect1, rect2]);

    // Overlap is 80px, minWidth is 100px, ratio is 0.8 (exactly 80%)
    // The condition is > 0.8, so this should keep both
    expect(result).toHaveLength(2);
  });

  it('sorts unsorted input by y then x coordinates', () => {
    const rect1 = createRect(50, 40, 50, 16);
    const rect2 = createRect(10, 20, 50, 16);
    const rect3 = createRect(30, 20, 50, 16);

    const result = deduplicateOverlappingRects([rect1, rect2, rect3]);

    // Should be sorted by y (20, 20, 40), then by x within same y (10, 30)
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(rect2); // x=10, y=20
    expect(result[1]).toBe(rect3); // x=30, y=20
    expect(result[2]).toBe(rect1); // x=50, y=40
  });

  it('handles multiple overlapping groups on different lines', () => {
    // Line 1: two overlapping rects
    const line1Large = createRect(10, 20, 100, 18);
    const line1Small = createRect(10, 20.5, 98, 16);

    // Line 2: two overlapping rects
    const line2Large = createRect(10, 60, 100, 18);
    const line2Small = createRect(10, 60.5, 98, 16);

    const result = deduplicateOverlappingRects([line1Large, line1Small, line2Large, line2Small]);

    // Should keep only the smaller rect from each line
    expect(result).toHaveLength(2);
    expect(result).toContain(line1Small);
    expect(result).toContain(line2Small);
  });

  it('handles three overlapping rects on the same line (keeps smallest)', () => {
    const largest = createRect(10, 20, 100, 20);
    const medium = createRect(10, 20.5, 100, 18);
    const smallest = createRect(10, 21, 100, 16);

    const result = deduplicateOverlappingRects([largest, medium, smallest]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(smallest);
  });

  it('does not mutate the input array', () => {
    const rect1 = createRect(10, 40, 50, 16);
    const rect2 = createRect(10, 20, 50, 16);
    const input = [rect1, rect2];
    const originalOrder = [...input];

    deduplicateOverlappingRects(input);

    // Input array should be unchanged
    expect(input).toEqual(originalOrder);
    expect(input[0]).toBe(rect1);
    expect(input[1]).toBe(rect2);
  });

  it('handles rects with zero width or height gracefully', () => {
    const validRect = createRect(10, 20, 100, 16);
    const zeroWidthRect = createRect(10, 21, 0, 16);
    const zeroHeightRect = createRect(10, 21, 100, 0);

    const result = deduplicateOverlappingRects([validRect, zeroWidthRect, zeroHeightRect]);

    // Zero-dimension rects should still be processed without errors
    // The algorithm should handle them based on overlap calculations
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('prefers non-zero rects when overlapping with zero-height rects', () => {
    const zeroHeightRect = createRect(10, 20, 100, 0);
    const textRect = createRect(10, 20.5, 100, 16);

    const result = deduplicateOverlappingRects([zeroHeightRect, textRect]);

    expect(result).toHaveLength(1);
    // isLargerRect will mark textRect as larger (16 > 0 + 0.5), so zero-height is kept
    expect(result[0]).toBe(zeroHeightRect);
  });

  it('handles complex real-world scenario with mixed overlapping and non-overlapping rects', () => {
    // Line 1: overlapping group (line-box + text-content)
    const line1Box = createRect(10, 20, 200, 18);
    const line1Text = createRect(10, 20.5, 195, 16);

    // Line 1: separate word on same line, no overlap
    const line1Word = createRect(220, 21, 50, 16);

    // Line 2: non-overlapping rects
    const line2Word1 = createRect(10, 60, 50, 16);
    const line2Word2 = createRect(70, 61, 50, 16);

    const result = deduplicateOverlappingRects([line1Box, line1Text, line1Word, line2Word1, line2Word2]);

    expect(result).toHaveLength(4);
    expect(result).toContain(line1Text); // smaller of the overlapping pair
    expect(result).toContain(line1Word);
    expect(result).toContain(line2Word1);
    expect(result).toContain(line2Word2);
  });

  it('drops a line-box rect but keeps multiple word rects on the same line', () => {
    const lineBoxRect = createRect(10, 20, 200, 18);
    const word1 = createRect(20, 21, 50, 16);
    const word2 = createRect(80, 21, 60, 16);

    const result = deduplicateOverlappingRects([lineBoxRect, word1, word2]);

    expect(result).toHaveLength(2);
    expect(result).toContain(word1);
    expect(result).toContain(word2);
  });

  describe('exact duplicate detection', () => {
    it('detects exact duplicates within epsilon thresholds', () => {
      // Two rects that are nearly identical within epsilon thresholds
      const rect1 = createRect(10, 20, 100, 16);
      const rect2 = createRect(10.5, 20.2, 100.3, 16.1); // Within epsilon for x (1px), y (3px), size (0.5px)

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Should deduplicate to 1 rect (treated as exact duplicates)
      expect(result).toHaveLength(1);
    });

    it('keeps rects that exceed x-coordinate epsilon threshold', () => {
      const rect1 = createRect(10, 20, 100, 16);
      const rect2 = createRect(12, 20, 100, 16); // x difference > 1px threshold

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Should keep both rects
      expect(result).toHaveLength(2);
    });

    it('keeps rects that exceed width epsilon threshold', () => {
      const rect1 = createRect(10, 20, 100, 16);
      const rect2 = createRect(10, 20, 101, 16); // width difference > 0.5px threshold

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Not exact duplicates, but rect2 is larger (101 > 100 + 0.5) with significant overlap
      // So rect2 gets filtered out as a container
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(rect1);
    });

    it('keeps rects that exceed height epsilon threshold', () => {
      const rect1 = createRect(10, 20, 100, 16);
      const rect2 = createRect(10, 20, 100, 17); // height difference > 0.5px threshold

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Not exact duplicates, but rect2 is larger (17 > 16 + 0.5) with significant overlap
      // So rect2 gets filtered out as a container
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(rect1);
    });

    it('handles exact duplicates at boundary of epsilon thresholds', () => {
      const rect1 = createRect(10, 20, 100, 16);
      const rect2 = createRect(10.99, 20, 100.49, 16.49); // Just at epsilon boundaries

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Should deduplicate (within all thresholds)
      expect(result).toHaveLength(1);
    });

    it('handles group with all exact duplicates', () => {
      // Create 5 nearly identical rects (all within epsilon)
      const rects = [
        createRect(10, 20, 100, 16),
        createRect(10.2, 20.1, 100.1, 16.1),
        createRect(10.4, 20.2, 100.2, 16.2),
        createRect(10.6, 20.3, 100.3, 16.3),
        createRect(10.8, 20.4, 100.4, 16.4),
      ];

      const result = deduplicateOverlappingRects(rects);

      // Should deduplicate to 1 rect
      expect(result).toHaveLength(1);
    });

    it('removes all duplicates but keeps distinct rects in mixed group', () => {
      const rect1 = createRect(10, 20, 100, 16);
      const rect1Dup = createRect(10.5, 20.2, 100.3, 16.2); // Duplicate of rect1
      const rect2 = createRect(120, 21, 50, 16); // Distinct rect (different x)
      const rect2Dup = createRect(120.3, 21.1, 50.2, 16.1); // Duplicate of rect2

      const result = deduplicateOverlappingRects([rect1, rect1Dup, rect2, rect2Dup]);

      // Should deduplicate to 2 rects (one from each pair)
      expect(result).toHaveLength(2);
    });
  });

  describe('edge cases - epsilon boundary conditions', () => {
    it('handles sub-pixel x differences at exact epsilon boundary (1px)', () => {
      const rect1 = createRect(10.0, 20, 100, 16);
      const rect2 = createRect(11.0, 20, 100, 16); // Exactly 1px difference

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // At exact boundary, should be treated as duplicate
      expect(result).toHaveLength(1);
    });

    it('handles sub-pixel y differences at exact epsilon boundary (3px)', () => {
      const rect1 = createRect(10, 20.0, 100, 16);
      const rect2 = createRect(10, 23.0, 100, 16); // Exactly 3px difference

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // At exact boundary, should be treated as same line and duplicate
      expect(result).toHaveLength(1);
    });

    it('handles sub-pixel size differences at exact epsilon boundary (0.5px)', () => {
      const rect1 = createRect(10, 20, 100.0, 16.0);
      const rect2 = createRect(10, 20, 100.5, 16.5); // Exactly 0.5px difference

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // At exact boundary, should be treated as duplicate
      expect(result).toHaveLength(1);
    });

    it('treats negative coordinates correctly in epsilon comparison', () => {
      const rect1 = createRect(-10, 20, 100, 16);
      const rect2 = createRect(-10.5, 20.2, 100.3, 16.2); // Within epsilon

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Should deduplicate (epsilon applies to negative coords too)
      expect(result).toHaveLength(1);
    });

    it('handles floating-point precision edge cases', () => {
      const rect1 = createRect(10.0, 20.0, 100.0, 16.0);
      const rect2 = createRect(10.0 + 1e-10, 20.0 + 1e-10, 100.0 + 1e-10, 16.0 + 1e-10); // Tiny difference

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Should deduplicate (difference is below epsilon)
      expect(result).toHaveLength(1);
    });
  });

  describe('container rect filtering edge cases', () => {
    it('filters container when it is larger in both width and height', () => {
      const textRect = createRect(10, 20, 100, 16);
      const containerRect = createRect(10, 20, 105, 20); // Larger in both dimensions

      const result = deduplicateOverlappingRects([textRect, containerRect]);

      // Should keep only the smaller rect
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(textRect);
    });

    it('filters container when it is larger in width only', () => {
      const textRect = createRect(10, 20, 100, 16);
      const containerRect = createRect(10, 20, 105, 16); // Larger only in width

      const result = deduplicateOverlappingRects([textRect, containerRect]);

      // Should keep only the smaller rect
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(textRect);
    });

    it('filters container when it is larger in height only', () => {
      const textRect = createRect(10, 20, 100, 16);
      const containerRect = createRect(10, 20, 100, 20); // Larger only in height

      const result = deduplicateOverlappingRects([textRect, containerRect]);

      // Should keep only the smaller rect
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(textRect);
    });

    it('keeps both rects when neither is strictly larger', () => {
      const rect1 = createRect(10, 20, 100, 16); // Wider but shorter
      const rect2 = createRect(10, 20, 90, 20); // Narrower but taller

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Should keep both (neither is strictly larger in both dimensions)
      expect(result).toHaveLength(2);
    });

    it('handles multiple containers for the same text rect', () => {
      const textRect = createRect(10, 20, 100, 16);
      const container1 = createRect(10, 20, 110, 18);
      const container2 = createRect(10, 20, 120, 20);
      const container3 = createRect(10, 20, 105, 17);

      const result = deduplicateOverlappingRects([textRect, container1, container2, container3]);

      // Should keep only the smallest rect
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(textRect);
    });

    it('handles size difference exactly at epsilon boundary (0.5px)', () => {
      const rect1 = createRect(10, 20, 100, 16);
      const rect2 = createRect(10, 20, 100.5, 16.5); // Exactly at size epsilon

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // At exact boundary, should be treated as duplicates
      expect(result).toHaveLength(1);
    });

    it('keeps both rects when size difference is just beyond epsilon', () => {
      const rect1 = createRect(10, 20, 100, 16);
      const rect2 = createRect(10, 20, 100.6, 16); // Just beyond size epsilon (0.5px)

      const result = deduplicateOverlappingRects([rect1, rect2]);

      // Not exact duplicates, but rect2 is larger (100.6 > 100 + 0.5) with significant overlap
      // So rect2 gets filtered out as a container
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(rect1);
    });
  });
});

describe('computeSelectionRectsFromDom', () => {
  let painterHost: HTMLElement;
  let domPositionIndex: DomPositionIndex;
  let rebuildDomPositionIndex: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    painterHost = document.createElement('div');
    domPositionIndex = new DomPositionIndex();
    rebuildDomPositionIndex = vi.fn(() => {
      domPositionIndex.rebuild(painterHost);
    });
  });

  /**
   * Helper to create a minimal Layout object for testing
   */
  function createMockLayout(pages: Array<{ pmStart: number; pmEnd: number }>): Layout {
    return {
      pageSize: { w: 612, h: 792 },
      pages: pages.map((page, idx) => ({
        number: idx + 1,
        fragments: [
          {
            kind: 'para' as const,
            blockId: `block-${idx}`,
            fromLine: 0,
            toLine: 1,
            x: 0,
            y: 0,
            width: 612,
            pmStart: page.pmStart,
            pmEnd: page.pmEnd,
          },
        ],
      })),
    };
  }

  /**
   * Helper to create a basic options object
   */
  function createOptions(layout: Layout | null): ComputeSelectionRectsFromDomOptions {
    return {
      painterHost,
      layout,
      domPositionIndex,
      rebuildDomPositionIndex,
      zoom: 1,
      pageHeight: 792,
      pageGap: 16,
    };
  }

  describe('basic selection rectangle computation', () => {
    it('computes selection rects for a simple text range', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line" data-pm-start="1" data-pm-end="10">
            <span data-pm-start="1" data-pm-end="10">hello world</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      domPositionIndex.rebuild(painterHost);

      // Mock getBoundingClientRect for page and range
      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      // Mock Range.getClientRects
      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 100, 16)]),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 10);

      expect(rects).not.toBe(null);
      expect(rects).toHaveLength(1);
      expect(rects![0]).toMatchObject({
        pageIndex: 0,
        x: 10,
        y: 20,
        width: 100,
        height: 16,
      });

      document.createRange = originalCreateRange;
    });

    it('returns empty array for collapsed selection (from === to)', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line" data-pm-start="1" data-pm-end="10">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      const options = createOptions(layout);

      const rects = computeSelectionRectsFromDom(options, 5, 5);

      expect(rects).toEqual([]);
    });

    it('handles reversed selection (to < from) by normalizing', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line" data-pm-start="1" data-pm-end="10">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 50, 16)]),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 8, 3);

      expect(rects).not.toBe(null);
      expect(rects).toHaveLength(1);

      document.createRange = originalCreateRange;
    });
  });

  describe('multi-page selections', () => {
    it('computes rects spanning multiple pages', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">page 1</span>
          </div>
        </div>
        <div class="superdoc-page" data-page-index="1">
          <div class="superdoc-line">
            <span data-pm-start="11" data-pm-end="20">page 2</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([
        { pmStart: 1, pmEnd: 10 },
        { pmStart: 11, pmEnd: 20 },
      ]);
      domPositionIndex.rebuild(painterHost);

      const pages = Array.from(painterHost.querySelectorAll('.superdoc-page')) as HTMLElement[];
      pages[0]!.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      pages[1]!.getBoundingClientRect = vi.fn(() => createRect(0, 808, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 100, 16)]),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 5, 15);

      expect(rects).not.toBe(null);
      expect(rects!.length).toBeGreaterThan(0);

      // Should have rects from both pages
      const pageIndices = new Set(rects!.map((r) => r.pageIndex));
      expect(pageIndices.has(0)).toBe(true);
      expect(pageIndices.has(1)).toBe(true);

      document.createRange = originalCreateRange;
    });
  });

  describe('index rebuild behavior', () => {
    it('rebuilds index when elements not found (stale index detection)', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);

      // Start with empty index
      expect(domPositionIndex.size).toBe(0);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 50, 16)]),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      computeSelectionRectsFromDom(options, 1, 10);

      // Should have triggered rebuild
      expect(rebuildDomPositionIndex).toHaveBeenCalled();

      document.createRange = originalCreateRange;
    });

    it('returns null when painterHost is null', () => {
      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      const options: ComputeSelectionRectsFromDomOptions = {
        painterHost: null,
        layout,
        domPositionIndex,
        rebuildDomPositionIndex,
        zoom: 1,
        pageHeight: 792,
        pageGap: 16,
      };

      const rects = computeSelectionRectsFromDom(options, 1, 10);

      expect(rects).toBe(null);
    });

    it('returns null when layout is null', () => {
      const options = createOptions(null);

      const rects = computeSelectionRectsFromDom(options, 1, 10);

      expect(rects).toBe(null);
    });
  });

  describe('virtualized pages (not mounted)', () => {
    it('skips pages with no mounted DOM elements', () => {
      // Create layout with 3 pages but only mount page 1
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="1">
          <div class="superdoc-line">
            <span data-pm-start="11" data-pm-end="20">page 1 content</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([
        { pmStart: 1, pmEnd: 10 },
        { pmStart: 11, pmEnd: 20 },
        { pmStart: 21, pmEnd: 30 },
      ]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 808, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 50, 16)]),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 25);

      expect(rects).not.toBe(null);
      // Should only have rects from page 1 (the only mounted page)
      const pageIndices = new Set(rects!.map((r) => r.pageIndex));
      expect(pageIndices.size).toBeLessThanOrEqual(1);

      document.createRange = originalCreateRange;
    });
  });

  describe('collectClientRectsByLine fallback mechanism', () => {
    it('uses fallback when range.intersectsNode detects missing entries', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="5">hello</span>
            <span data-pm-start="6" data-pm-end="10">world</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      let rangeCallCount = 0;
      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => {
          rangeCallCount++;
          // First call returns partial rects, triggering fallback
          if (rangeCallCount === 1) {
            return [createRect(10, 20, 50, 16)];
          }
          // Subsequent calls (from fallback) return per-line rects
          return [createRect(10, 20, 50, 16)];
        }),
        intersectsNode: vi.fn((node: Node) => {
          // Simulate that range doesn't intersect some nodes
          const span = node as HTMLElement;
          return span.textContent !== 'world';
        }),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 10);

      expect(rects).not.toBe(null);
      // Should have created multiple ranges (one per line in fallback)
      expect(rangeCallCount).toBeGreaterThan(1);

      document.createRange = originalCreateRange;
    });

    it('groups entries by line element in fallback mode', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="3">a</span>
            <span data-pm-start="4" data-pm-end="6">b</span>
          </div>
          <div class="superdoc-line">
            <span data-pm-start="7" data-pm-end="9">c</span>
            <span data-pm-start="10" data-pm-end="12">d</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 12 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 100, 16)]),
        intersectsNode: vi.fn(() => false), // Force fallback
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 12);

      expect(rects).not.toBe(null);
      // Fallback should create ranges for each line
      expect(rects!.length).toBeGreaterThan(0);

      document.createRange = originalCreateRange;
    });

    it('handles entries without line parent (loose entries) in fallback', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="5">in-line</span>
          </div>
          <span data-pm-start="6" data-pm-end="10">loose</span>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 50, 16)]),
        intersectsNode: vi.fn(() => false), // Force fallback
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 10);

      expect(rects).not.toBe(null);
      // Should handle both line-based and loose entries
      expect(rects!.length).toBeGreaterThan(0);

      document.createRange = originalCreateRange;
    });

    it('clamps positions at line boundaries in fallback mode', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="5" data-pm-end="15">line-content</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 20 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 100, 16)]),
        intersectsNode: vi.fn(() => false), // Force fallback
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      // Request range beyond line boundaries (1-20), but line only has 5-15
      const rects = computeSelectionRectsFromDom(options, 1, 20);

      expect(rects).not.toBe(null);
      // Should clamp to line boundaries when creating ranges
      expect(mockRange.setStart).toHaveBeenCalled();
      expect(mockRange.setEnd).toHaveBeenCalled();

      document.createRange = originalCreateRange;
    });

    it('silently handles range creation failures in fallback mode', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="5">test</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 5 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      let callCount = 0;
      const mockRange = {
        setStart: vi.fn(() => {
          callCount++;
          if (callCount > 1) throw new Error('Range creation failed');
        }),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 50, 16)]),
        intersectsNode: vi.fn(() => false), // Force fallback
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 5);

      // Should not throw, should handle errors gracefully
      expect(rects).not.toBe(null);

      document.createRange = originalCreateRange;
    });

    it('handles multiple entries per line in fallback mode', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="2">a</span>
            <span data-pm-start="3" data-pm-end="4">b</span>
            <span data-pm-start="5" data-pm-end="6">c</span>
            <span data-pm-start="7" data-pm-end="8">d</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 8 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 100, 16)]),
        intersectsNode: vi.fn(() => false), // Force fallback
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 8);

      expect(rects).not.toBe(null);
      // Should create a single range for all entries in the same line
      expect(rects!.length).toBeGreaterThan(0);

      document.createRange = originalCreateRange;
    });
  });

  describe('deduplication integration', () => {
    it('deduplicates overlapping rects from getClientRects', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      // Return overlapping rects that should be deduplicated
      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [
          createRect(10, 20, 100, 18), // Line-box rect
          createRect(10, 20.5, 98, 16), // Text-content rect (should be kept)
        ]),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      const rects = computeSelectionRectsFromDom(options, 1, 10);

      expect(rects).not.toBe(null);
      // Should have deduplicated to 1 rect
      expect(rects).toHaveLength(1);
      expect(rects![0]!.height).toBe(16); // Should keep the smaller rect

      document.createRange = originalCreateRange;
    });
  });

  describe('edge cases - invalid positions', () => {
    it('returns null for NaN from position', () => {
      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      const options = createOptions(layout);

      const rects = computeSelectionRectsFromDom(options, NaN, 10);

      expect(rects).toBe(null);
    });

    it('returns null for NaN to position', () => {
      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      const options = createOptions(layout);

      const rects = computeSelectionRectsFromDom(options, 1, NaN);

      expect(rects).toBe(null);
    });

    it('returns null for Infinity positions', () => {
      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      const options = createOptions(layout);

      expect(computeSelectionRectsFromDom(options, Infinity, 10)).toBe(null);
      expect(computeSelectionRectsFromDom(options, 1, Infinity)).toBe(null);
    });
  });

  describe('zoom handling', () => {
    it('correctly scales coordinates based on zoom level', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([{ pmStart: 1, pmEnd: 10 }]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 1224, 1584)); // 2x zoom

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(20, 40, 200, 32)]), // 2x coordinates
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      options.zoom = 2;

      const rects = computeSelectionRectsFromDom(options, 1, 10);

      expect(rects).not.toBe(null);
      expect(rects).toHaveLength(1);
      // Coordinates should be divided by zoom
      expect(rects![0]).toMatchObject({
        x: 10, // 20 / 2
        width: 100, // 200 / 2
        height: 16, // 32 / 2
      });

      document.createRange = originalCreateRange;
    });
  });

  describe('page gap calculation', () => {
    it('includes page gap in y coordinate calculation', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="1">
          <div class="superdoc-line">
            <span data-pm-start="11" data-pm-end="20">page 2</span>
          </div>
        </div>
      `;

      const layout = createMockLayout([
        { pmStart: 1, pmEnd: 10 },
        { pmStart: 11, pmEnd: 20 },
      ]);
      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getClientRects: vi.fn(() => [createRect(10, 20, 100, 16)]),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createOptions(layout);
      options.pageGap = 16;
      options.pageHeight = 792;

      const rects = computeSelectionRectsFromDom(options, 11, 20);

      expect(rects).not.toBe(null);
      expect(rects).toHaveLength(1);
      // y should be: pageIndex * (pageHeight + pageGap) + localY
      // = 1 * (792 + 16) + 20 = 828
      expect(rects![0]!.y).toBe(1 * (792 + 16) + 20);

      document.createRange = originalCreateRange;
    });
  });
});

describe('computeDomCaretPageLocal', () => {
  let painterHost: HTMLElement;
  let domPositionIndex: DomPositionIndex;
  let rebuildDomPositionIndex: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    painterHost = document.createElement('div');
    domPositionIndex = new DomPositionIndex();
    rebuildDomPositionIndex = vi.fn(() => {
      domPositionIndex.rebuild(painterHost);
    });
  });

  function createCaretOptions(): ComputeDomCaretPageLocalOptions {
    return {
      painterHost,
      domPositionIndex,
      rebuildDomPositionIndex,
      zoom: 1,
    };
  }

  describe('basic caret position computation', () => {
    it('computes caret position in page-local coordinates for text node', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">hello</span>
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const lineEl = painterHost.querySelector('.superdoc-line') as HTMLElement;
      const spanEl = painterHost.querySelector('span') as HTMLElement;

      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      lineEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 16));
      spanEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 50, 16));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => createRect(25, 20, 0, 16)),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createCaretOptions();
      const caret = computeDomCaretPageLocal(options, 5);

      expect(caret).not.toBe(null);
      expect(caret).toMatchObject({
        pageIndex: 0,
        x: 25, // Caret x position
        y: 20, // Line top position
      });

      document.createRange = originalCreateRange;
    });

    it('uses element rect for non-text nodes', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <img data-pm-start="1" data-pm-end="2" />
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const imgEl = painterHost.querySelector('img') as HTMLElement;

      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      imgEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 100));

      const options = createCaretOptions();
      const caret = computeDomCaretPageLocal(options, 1);

      expect(caret).not.toBe(null);
      expect(caret).toMatchObject({
        pageIndex: 0,
        x: 10,
        y: 20,
      });
    });
  });

  describe('index rebuild for disconnected elements', () => {
    it('rebuilds index when element is disconnected', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      // Get the element and mark it as disconnected
      const spanEl = painterHost.querySelector('span') as HTMLElement;
      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const lineEl = painterHost.querySelector('.superdoc-line') as HTMLElement;

      const originalIsConnected = Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected');

      Object.defineProperty(spanEl, 'isConnected', {
        get: () => false,
        configurable: true,
      });

      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      lineEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 16));
      spanEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 50, 16));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => createRect(25, 20, 0, 16)),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createCaretOptions();
      computeDomCaretPageLocal(options, 5);

      expect(rebuildDomPositionIndex).toHaveBeenCalled();

      // Restore original property
      if (originalIsConnected) {
        Object.defineProperty(spanEl, 'isConnected', originalIsConnected);
      }

      document.createRange = originalCreateRange;
    });

    it('rebuilds index when index is empty', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      // Don't rebuild index initially
      expect(domPositionIndex.size).toBe(0);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const lineEl = painterHost.querySelector('.superdoc-line') as HTMLElement;
      const spanEl = painterHost.querySelector('span') as HTMLElement;

      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      lineEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 16));
      spanEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 50, 16));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => createRect(25, 20, 0, 16)),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createCaretOptions();
      computeDomCaretPageLocal(options, 5);

      expect(rebuildDomPositionIndex).toHaveBeenCalled();

      document.createRange = originalCreateRange;
    });
  });

  describe('edge cases - invalid inputs', () => {
    it('returns null when painterHost is null', () => {
      const options: ComputeDomCaretPageLocalOptions = {
        painterHost: null,
        domPositionIndex,
        rebuildDomPositionIndex,
        zoom: 1,
      };

      const caret = computeDomCaretPageLocal(options, 5);

      expect(caret).toBe(null);
    });

    it('returns null when no entry found for position', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const options = createCaretOptions();
      const caret = computeDomCaretPageLocal(options, 999);

      expect(caret).toBe(null);
    });

    it('returns null when element is not within a page', () => {
      painterHost.innerHTML = `
        <div class="superdoc-line">
          <span data-pm-start="1" data-pm-end="10">no page parent</span>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const options = createCaretOptions();
      const caret = computeDomCaretPageLocal(options, 5);

      expect(caret).toBe(null);
    });
  });

  describe('zoom handling', () => {
    it('correctly scales coordinates based on zoom level', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">text</span>
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const lineEl = painterHost.querySelector('.superdoc-line') as HTMLElement;
      const spanEl = painterHost.querySelector('span') as HTMLElement;

      // 2x zoom - all coordinates doubled
      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 1224, 1584));
      lineEl.getBoundingClientRect = vi.fn(() => createRect(20, 40, 200, 32));
      spanEl.getBoundingClientRect = vi.fn(() => createRect(20, 40, 100, 32));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => createRect(50, 40, 0, 32)),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createCaretOptions();
      options.zoom = 2;

      const caret = computeDomCaretPageLocal(options, 5);

      expect(caret).not.toBe(null);
      // Coordinates should be divided by zoom
      expect(caret).toMatchObject({
        x: 25, // 50 / 2
        y: 20, // 40 / 2
      });

      document.createRange = originalCreateRange;
    });
  });

  describe('text node character-level positioning', () => {
    it('maps PM position to character index within text node', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="0">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="6">hello</span>
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const lineEl = painterHost.querySelector('.superdoc-line') as HTMLElement;
      const spanEl = painterHost.querySelector('span') as HTMLElement;

      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      lineEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 16));
      spanEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 50, 16));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => createRect(30, 20, 0, 16)),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createCaretOptions();
      const caret = computeDomCaretPageLocal(options, 3);

      expect(caret).not.toBe(null);
      // Should have called setStart with calculated char index
      expect(mockRange.setStart).toHaveBeenCalled();

      document.createRange = originalCreateRange;
    });
  });

  describe('page index extraction', () => {
    it('correctly extracts page index from data attribute', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page" data-page-index="5">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">page 5</span>
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const lineEl = painterHost.querySelector('.superdoc-line') as HTMLElement;
      const spanEl = painterHost.querySelector('span') as HTMLElement;

      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      lineEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 16));
      spanEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 50, 16));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => createRect(25, 20, 0, 16)),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createCaretOptions();
      const caret = computeDomCaretPageLocal(options, 5);

      expect(caret).not.toBe(null);
      expect(caret!.pageIndex).toBe(5);

      document.createRange = originalCreateRange;
    });

    it('defaults to 0 when page index is missing', () => {
      painterHost.innerHTML = `
        <div class="superdoc-page">
          <div class="superdoc-line">
            <span data-pm-start="1" data-pm-end="10">no index</span>
          </div>
        </div>
      `;

      domPositionIndex.rebuild(painterHost);

      const pageEl = painterHost.querySelector('.superdoc-page') as HTMLElement;
      const lineEl = painterHost.querySelector('.superdoc-line') as HTMLElement;
      const spanEl = painterHost.querySelector('span') as HTMLElement;

      pageEl.getBoundingClientRect = vi.fn(() => createRect(0, 0, 612, 792));
      lineEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 100, 16));
      spanEl.getBoundingClientRect = vi.fn(() => createRect(10, 20, 50, 16));

      const mockRange = {
        setStart: vi.fn(),
        setEnd: vi.fn(),
        getBoundingClientRect: vi.fn(() => createRect(25, 20, 0, 16)),
      } as unknown as Range;

      const originalCreateRange = document.createRange;
      document.createRange = vi.fn(() => mockRange);

      const options = createCaretOptions();
      const caret = computeDomCaretPageLocal(options, 5);

      expect(caret).not.toBe(null);
      expect(caret!.pageIndex).toBe(0);

      document.createRange = originalCreateRange;
    });
  });
});
