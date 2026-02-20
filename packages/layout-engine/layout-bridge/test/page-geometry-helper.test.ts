/**
 * Tests for PageGeometryHelper
 *
 * Validates cumulative Y calculations, per-page heights, cache behavior,
 * and edge cases for mixed page sizes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PageGeometryHelper } from '../src/page-geometry-helper';
import type { Layout } from '@superdoc/contracts';

/**
 * Creates a mock layout with specified page configurations.
 */
function createMockLayout(config: {
  pageCount: number;
  defaultHeight: number;
  pageGap?: number;
  perPageHeights?: Record<number, number>;
}): Layout {
  const pages = [];
  for (let i = 0; i < config.pageCount; i++) {
    const customHeight = config.perPageHeights?.[i];
    pages.push({
      fragments: [],
      size: customHeight !== undefined ? { w: 612, h: customHeight } : undefined,
    });
  }

  return {
    pages,
    pageSize: { w: 612, h: config.defaultHeight },
    pageGap: config.pageGap,
  } as Layout;
}

describe('PageGeometryHelper', () => {
  describe('Construction and initialization', () => {
    it('should create instance with layout and default gap', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageCount()).toBe(3);
      expect(helper.getPageGap()).toBe(0); // Default when layout.pageGap is undefined
    });

    it('should use layout.pageGap when provided', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageGap()).toBe(24);
    });

    it('should override layout.pageGap with config.pageGap', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout, pageGap: 48 });

      expect(helper.getPageGap()).toBe(48);
    });
  });

  describe('getPageTop', () => {
    it('should return 0 for first page', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageTop(0)).toBe(0);
    });

    it('should calculate correct cumulative Y for uniform page heights', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      // Page 0: Y = 0
      // Page 1: Y = 1000 + 24 = 1024
      // Page 2: Y = 1000 + 24 + 1000 + 24 = 2048
      expect(helper.getPageTop(0)).toBe(0);
      expect(helper.getPageTop(1)).toBe(1024);
      expect(helper.getPageTop(2)).toBe(2048);
    });

    it('should calculate correct cumulative Y for mixed page heights', () => {
      const layout = createMockLayout({
        pageCount: 4,
        defaultHeight: 1000,
        pageGap: 24,
        perPageHeights: { 1: 1200, 3: 800 },
      });
      const helper = new PageGeometryHelper({ layout });

      // Page 0: Y = 0 (height 1000)
      // Page 1: Y = 1000 + 24 = 1024 (height 1200)
      // Page 2: Y = 1000 + 24 + 1200 + 24 = 2248 (height 1000)
      // Page 3: Y = 1000 + 24 + 1200 + 24 + 1000 + 24 = 3272 (height 800)
      expect(helper.getPageTop(0)).toBe(0);
      expect(helper.getPageTop(1)).toBe(1024);
      expect(helper.getPageTop(2)).toBe(2248);
      expect(helper.getPageTop(3)).toBe(3272);
    });

    it('should handle zero gap correctly', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 0 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageTop(0)).toBe(0);
      expect(helper.getPageTop(1)).toBe(1000);
      expect(helper.getPageTop(2)).toBe(2000);
    });

    it('should return 0 for invalid page index (negative)', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageTop(-1)).toBe(0);
    });

    it('should return 0 for invalid page index (beyond page count)', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageTop(3)).toBe(0);
      expect(helper.getPageTop(100)).toBe(0);
    });
  });

  describe('getPageHeight', () => {
    it('should return default height when no per-page height specified', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageHeight(0)).toBe(1000);
      expect(helper.getPageHeight(1)).toBe(1000);
      expect(helper.getPageHeight(2)).toBe(1000);
    });

    it('should return per-page height when specified', () => {
      const layout = createMockLayout({
        pageCount: 3,
        defaultHeight: 1000,
        perPageHeights: { 1: 1200 },
      });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageHeight(0)).toBe(1000);
      expect(helper.getPageHeight(1)).toBe(1200);
      expect(helper.getPageHeight(2)).toBe(1000);
    });

    it('should return 0 for invalid page index', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageHeight(-1)).toBe(0);
      expect(helper.getPageHeight(3)).toBe(0);
    });
  });

  describe('getTotalHeight', () => {
    it('should calculate correct total for uniform heights', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      // 1000 + 24 + 1000 + 24 + 1000 = 3048
      expect(helper.getTotalHeight()).toBe(3048);
    });

    it('should calculate correct total for mixed heights', () => {
      const layout = createMockLayout({
        pageCount: 3,
        defaultHeight: 1000,
        pageGap: 24,
        perPageHeights: { 1: 1200 },
      });
      const helper = new PageGeometryHelper({ layout });

      // 1000 + 24 + 1200 + 24 + 1000 = 3248
      expect(helper.getTotalHeight()).toBe(3248);
    });

    it('should calculate correct total with zero gap', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 0 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getTotalHeight()).toBe(3000);
    });

    it('should return 0 for empty layout', () => {
      const layout = createMockLayout({ pageCount: 0, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getTotalHeight()).toBe(0);
    });

    it('should return correct total for single page', () => {
      const layout = createMockLayout({ pageCount: 1, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getTotalHeight()).toBe(1000); // No gap after single page
    });
  });

  describe('getPageIndexAtY', () => {
    it('should find correct page for Y coordinate', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      // Page 0: [0, 1000)
      // Page 1: [1024, 2024)
      // Page 2: [2048, 3048)
      expect(helper.getPageIndexAtY(0)).toBe(0);
      expect(helper.getPageIndexAtY(500)).toBe(0);
      expect(helper.getPageIndexAtY(999)).toBe(0);

      expect(helper.getPageIndexAtY(1024)).toBe(1);
      expect(helper.getPageIndexAtY(1500)).toBe(1);
      expect(helper.getPageIndexAtY(2023)).toBe(1);

      expect(helper.getPageIndexAtY(2048)).toBe(2);
      expect(helper.getPageIndexAtY(2500)).toBe(2);
      expect(helper.getPageIndexAtY(3047)).toBe(2);
    });

    it('should return null for Y in gap between pages', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      // Gaps are: [1000, 1024) and [2024, 2048)
      expect(helper.getPageIndexAtY(1000)).toBe(null);
      expect(helper.getPageIndexAtY(1010)).toBe(null);
      expect(helper.getPageIndexAtY(1023)).toBe(null);

      expect(helper.getPageIndexAtY(2024)).toBe(null);
      expect(helper.getPageIndexAtY(2047)).toBe(null);
    });

    it('should return null for Y beyond all pages', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageIndexAtY(5000)).toBe(null);
      expect(helper.getPageIndexAtY(-100)).toBe(null);
    });

    it('should handle mixed page heights correctly', () => {
      const layout = createMockLayout({
        pageCount: 3,
        defaultHeight: 1000,
        pageGap: 24,
        perPageHeights: { 1: 1200 },
      });
      const helper = new PageGeometryHelper({ layout });

      // Page 0: [0, 1000)
      // Gap: [1000, 1024)
      // Page 1: [1024, 2224) (height 1200)
      // Gap: [2224, 2248)
      // Page 2: [2248, 3248)
      expect(helper.getPageIndexAtY(500)).toBe(0);
      expect(helper.getPageIndexAtY(1500)).toBe(1);
      expect(helper.getPageIndexAtY(2500)).toBe(2);

      // Gaps should return null
      expect(helper.getPageIndexAtY(1010)).toBe(null);
      expect(helper.getPageIndexAtY(2230)).toBe(null);
    });
  });

  describe('getNearestPageIndex', () => {
    it('should snap to closest page when in gap', () => {
      const layout = createMockLayout({ pageCount: 2, defaultHeight: 1000, pageGap: 200 });
      const helper = new PageGeometryHelper({ layout });

      // Gap between pages: [1000, 1200)
      // Page 0: center at Y=500, Page 1: center at Y=1700
      expect(helper.getPageIndexAtY(1100)).toBe(null);
      // Y=1100 is equidistant from both centers (600px each), so first page wins (tie-breaking)
      expect(helper.getNearestPageIndex(1100)).toBe(0);
      // Y=50 is clearly closer to page 0 center (450px) than page 1 center (1650px)
      expect(helper.getNearestPageIndex(50)).toBe(0);
      // Y=1300 is closer to page 1 center (400px) than page 0 center (800px)
      expect(helper.getNearestPageIndex(1300)).toBe(1);
    });

    it('should return null when there are no pages', () => {
      const layout = createMockLayout({ pageCount: 0, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getNearestPageIndex(0)).toBe(null);
    });
  });

  describe('Cache behavior', () => {
    it('should build cache on first access', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      const debug1 = helper.getDebugInfo();
      expect(debug1.isCached).toBe(true);
      expect(debug1.cumulativeY).toEqual([0, 1024, 2048]);
    });

    it('should reuse cached values on subsequent access', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      const y1 = helper.getPageTop(1);
      const y2 = helper.getPageTop(1);
      const y3 = helper.getPageTop(1);

      expect(y1).toBe(1024);
      expect(y2).toBe(1024);
      expect(y3).toBe(1024);
    });

    it('should invalidate cache when layout updated', () => {
      const layout1 = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout: layout1 });

      const y1 = helper.getPageTop(1);
      expect(y1).toBe(1024);

      const layout2 = createMockLayout({ pageCount: 3, defaultHeight: 1200, pageGap: 24 });
      helper.updateLayout(layout2);

      const y2 = helper.getPageTop(1);
      expect(y2).toBe(1224); // New height: 1200 + 24
    });

    it('should invalidate cache when page gap updated', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      const y1 = helper.getPageTop(1);
      expect(y1).toBe(1024);

      helper.updatePageGap(48);

      const y2 = helper.getPageTop(1);
      expect(y2).toBe(1048); // New gap: 1000 + 48
    });

    it('should not invalidate cache when updating to same gap', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      helper.getPageTop(1); // Build cache
      const debug1 = helper.getDebugInfo();

      helper.updatePageGap(24); // Same gap
      const debug2 = helper.getDebugInfo();

      // Cache should still be valid (same cumulative Y values)
      expect(debug2.cumulativeY).toEqual(debug1.cumulativeY);
    });

    it('should clear cache when explicitly requested', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      helper.getPageTop(1); // Build cache
      expect(helper.getDebugInfo().isCached).toBe(true);

      helper.clearCache();
      // Cache is cleared but will be rebuilt on next access
      const y = helper.getPageTop(1);
      expect(y).toBe(1024); // Still works correctly
      expect(helper.getDebugInfo().isCached).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty layout (0 pages)', () => {
      const layout = createMockLayout({ pageCount: 0, defaultHeight: 1000 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageCount()).toBe(0);
      expect(helper.getTotalHeight()).toBe(0);
      expect(helper.getPageTop(0)).toBe(0);
      expect(helper.getPageIndexAtY(0)).toBe(null);
    });

    it('should handle single page layout', () => {
      const layout = createMockLayout({ pageCount: 1, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      expect(helper.getPageTop(0)).toBe(0);
      expect(helper.getPageHeight(0)).toBe(1000);
      expect(helper.getTotalHeight()).toBe(1000); // No gap after last page
      expect(helper.getPageIndexAtY(500)).toBe(0);
      expect(helper.getPageIndexAtY(1000)).toBe(null); // Beyond page
    });

    it('should handle very large page gap', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 500 });
      const helper = new PageGeometryHelper({ layout });

      // Page 0: [0, 1000)
      // Gap: [1000, 1500)
      // Page 1: [1500, 2500)
      // Gap: [2500, 3000)
      // Page 2: [3000, 4000)
      expect(helper.getPageTop(1)).toBe(1500);
      expect(helper.getPageTop(2)).toBe(3000);
      expect(helper.getTotalHeight()).toBe(4000);
    });

    it('should handle zero-height pages gracefully', () => {
      const layout = createMockLayout({
        pageCount: 3,
        defaultHeight: 1000,
        pageGap: 24,
        perPageHeights: { 1: 0 },
      });
      const helper = new PageGeometryHelper({ layout });

      // Page 0: [0, 1000)
      // Gap: [1000, 1024)
      // Page 1: [1024, 1024) (zero height)
      // Gap: [1024, 1048)
      // Page 2: [1048, 2048)
      expect(helper.getPageTop(0)).toBe(0);
      expect(helper.getPageTop(1)).toBe(1024);
      expect(helper.getPageTop(2)).toBe(1048);
      expect(helper.getPageHeight(1)).toBe(0);
    });

    it('should handle very large documents (100+ pages) efficiently', () => {
      const layout = createMockLayout({ pageCount: 150, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      // Should compute without errors
      const lastPageY = helper.getPageTop(149);
      expect(lastPageY).toBe(149 * (1000 + 24)); // 149 gaps before last page

      const totalHeight = helper.getTotalHeight();
      expect(totalHeight).toBe(150 * 1000 + 149 * 24); // 150 pages, 149 gaps
    });

    it('should handle fractional pixel heights correctly', () => {
      const layout = createMockLayout({
        pageCount: 3,
        defaultHeight: 1000.5,
        pageGap: 24.25,
      });
      const helper = new PageGeometryHelper({ layout });

      // Should preserve fractional precision
      expect(helper.getPageTop(1)).toBeCloseTo(1024.75, 2); // 1000.5 + 24.25
      expect(helper.getPageTop(2)).toBeCloseTo(2049.5, 2); // 1000.5 + 24.25 + 1000.5 + 24.25
    });
  });

  describe('getDebugInfo', () => {
    it('should return complete debug information', () => {
      const layout = createMockLayout({ pageCount: 3, defaultHeight: 1000, pageGap: 24 });
      const helper = new PageGeometryHelper({ layout });

      const debug = helper.getDebugInfo();

      expect(debug.isCached).toBe(true);
      expect(debug.pageCount).toBe(3);
      expect(debug.pageGap).toBe(24);
      expect(debug.totalHeight).toBe(3048);
      expect(debug.cumulativeY).toEqual([0, 1024, 2048]);
      expect(debug.pageHeights).toEqual([1000, 1000, 1000]);
    });

    it('should show per-page heights correctly', () => {
      const layout = createMockLayout({
        pageCount: 3,
        defaultHeight: 1000,
        pageGap: 24,
        perPageHeights: { 1: 1200 },
      });
      const helper = new PageGeometryHelper({ layout });

      const debug = helper.getDebugInfo();
      expect(debug.pageHeights).toEqual([1000, 1200, 1000]);
    });
  });
});
