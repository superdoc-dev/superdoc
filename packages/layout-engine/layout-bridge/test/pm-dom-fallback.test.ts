/**
 * Tests for PmDomFallback
 *
 * Validates PM DOM coordinate transformation to paginated space.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PmDomFallback } from '../src/pm-dom-fallback';
import type { PmEditorView, PageTransform } from '../src/pm-dom-fallback';

describe('PmDomFallback', () => {
  let mockPmView: PmEditorView;
  let mockPageTransforms: PageTransform[];
  let fallback: PmDomFallback;

  beforeEach(() => {
    // Create mock editor DOM
    const editorDom = document.createElement('div');
    editorDom.style.position = 'absolute';
    editorDom.style.left = '100px';
    editorDom.style.top = '50px';
    editorDom.style.width = '800px';
    editorDom.style.height = '1000px';
    document.body.appendChild(editorDom);

    // Mock getBoundingClientRect to return consistent values
    editorDom.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      right: 900,
      bottom: 1050,
      width: 800,
      height: 1000,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    // Mock ProseMirror view
    mockPmView = {
      coordsAtPos: (pos: number) => {
        // Simple mock: return coords based on position
        // In real PM, this would be based on actual DOM rendering
        return {
          left: 100 + pos * 5, // Mock: each position is 5px apart
          top: 50 + Math.floor(pos / 20) * 20, // Mock: 20 positions per line, 20px line height
          bottom: 50 + Math.floor(pos / 20) * 20 + 20,
        };
      },
      dom: editorDom,
    };

    // Mock page transforms for multi-page layout
    mockPageTransforms = [
      { pageIndex: 0, x: 0, y: 0, scale: 1 },
      { pageIndex: 1, x: 0, y: 1100, scale: 1 },
      { pageIndex: 2, x: 0, y: 2200, scale: 1 },
    ];

    fallback = new PmDomFallback(mockPmView, () => mockPageTransforms);
  });

  describe('getCursorRect', () => {
    it('should get cursor rect for valid position', () => {
      const rect = fallback.getCursorRect(0);

      expect(rect).toBeTruthy();
      expect(rect?.pageIndex).toBe(0);
      expect(rect?.height).toBe(20);
    });

    it('should return null when PM coordsAtPos returns null', () => {
      mockPmView.coordsAtPos = () => null;

      const rect = fallback.getCursorRect(0);
      expect(rect).toBeNull();
    });

    it('should map coordinates to page space', () => {
      const rect = fallback.getCursorRect(0);

      expect(rect).toBeTruthy();
      // Coordinates should be relative to page, not viewport
      expect(rect?.x).toBeGreaterThanOrEqual(0);
      expect(rect?.y).toBeGreaterThanOrEqual(0);
    });

    it('should handle different page indices', () => {
      // Mock a position that would be on page 1
      mockPmView.coordsAtPos = () => ({
        left: 100,
        top: 1150, // Within page 1's Y range (1100-2200)
        bottom: 1170,
      });

      const rect = fallback.getCursorRect(0);

      expect(rect?.pageIndex).toBe(1);
    });

    it('should handle scaled pages', () => {
      // Set up page with 0.5 scale
      mockPageTransforms = [{ pageIndex: 0, x: 0, y: 0, scale: 0.5 }];

      const rect = fallback.getCursorRect(0);

      expect(rect).toBeTruthy();
      // Height should be scaled
      expect(rect?.height).toBe(40); // 20px / 0.5 scale = 40px
    });

    it('should return null when position is outside all pages (suppress incorrect rendering)', () => {
      // Mock coordinates way below all pages
      mockPmView.coordsAtPos = () => ({
        left: 100,
        top: 5000,
        bottom: 5020,
      });

      const rect = fallback.getCursorRect(0);

      // Should return null to suppress rendering at wrong offsets rather than guessing
      expect(rect).toBeNull();
    });
  });

  describe('mapToPageSpace', () => {
    it('should transform viewport coords to page coords', () => {
      const coords = { left: 150, top: 100, bottom: 120 };
      const rect = fallback.mapToPageSpace(coords);

      expect(rect).toBeTruthy();
      expect(rect?.x).toBeGreaterThanOrEqual(0);
      expect(rect?.y).toBeGreaterThanOrEqual(0);
      expect(rect?.height).toBe(20);
    });

    it('should handle coordinates on different pages', () => {
      const coords = { left: 150, top: 1200, bottom: 1220 };
      const rect = fallback.mapToPageSpace(coords);

      expect(rect?.pageIndex).toBe(1);
    });

    it('should apply scale transformation', () => {
      mockPageTransforms = [{ pageIndex: 0, x: 50, y: 100, scale: 2 }];

      const coords = { left: 200, top: 200, bottom: 240 };
      const rect = fallback.mapToPageSpace(coords);

      expect(rect).toBeTruthy();
      // X should be (200 - 100 - 50) / 2 = 25
      // Y should be (200 - 50 - 100) / 2 = 25
      expect(rect?.x).toBeCloseTo(25, 0);
      expect(rect?.y).toBeCloseTo(25, 0);
      expect(rect?.height).toBe(20); // (240 - 200) / 2
    });

    it('should return null when no page transforms available', () => {
      const fallbackEmpty = new PmDomFallback(mockPmView, () => []);

      const coords = { left: 150, top: 100, bottom: 120 };
      const rect = fallbackEmpty.mapToPageSpace(coords);

      expect(rect).toBeNull();
    });

    it('should handle page offsets', () => {
      mockPageTransforms = [{ pageIndex: 0, x: 100, y: 200, scale: 1 }];

      const coords = { left: 250, top: 350, bottom: 370 };
      const rect = fallback.mapToPageSpace(coords);

      expect(rect).toBeTruthy();
      // X should be 250 - 100 - 100 = 50
      // Y should be 350 - 50 - 200 = 100
      expect(rect?.x).toBeCloseTo(50, 0);
      expect(rect?.y).toBeCloseTo(100, 0);
    });
  });

  describe('isPositionVisible', () => {
    it('should return true for visible position', () => {
      const visible = fallback.isPositionVisible(0);
      expect(visible).toBe(true);
    });

    it('should return false when coordsAtPos returns null', () => {
      mockPmView.coordsAtPos = () => null;

      const visible = fallback.isPositionVisible(0);
      expect(visible).toBe(false);
    });

    it('should return false for position below viewport', () => {
      // Mock position far below viewport
      mockPmView.coordsAtPos = () => ({
        left: 100,
        top: window.innerHeight + 100,
        bottom: window.innerHeight + 120,
      });

      const visible = fallback.isPositionVisible(0);
      expect(visible).toBe(false);
    });

    it('should return false for position above viewport', () => {
      mockPmView.coordsAtPos = () => ({
        left: 100,
        top: -100,
        bottom: -80,
      });

      const visible = fallback.isPositionVisible(0);
      expect(visible).toBe(false);
    });

    it('should return false for position left of viewport', () => {
      mockPmView.coordsAtPos = () => ({
        left: -100,
        top: 100,
        bottom: 120,
      });

      const visible = fallback.isPositionVisible(0);
      expect(visible).toBe(false);
    });

    it('should return false for position right of viewport', () => {
      mockPmView.coordsAtPos = () => ({
        left: window.innerWidth + 100,
        top: 100,
        bottom: 120,
      });

      const visible = fallback.isPositionVisible(0);
      expect(visible).toBe(false);
    });
  });

  describe('getSelectionRects', () => {
    it('should return empty array for zero-length selection', () => {
      const rects = fallback.getSelectionRects(5, 5);
      expect(rects).toEqual([]);
    });

    it('should handle reversed range', () => {
      const rects = fallback.getSelectionRects(10, 5);
      expect(rects.length).toBeGreaterThan(0);
    });

    it('should return rects for small selection', () => {
      const rects = fallback.getSelectionRects(0, 5);

      expect(rects.length).toBeGreaterThan(0);
      expect(rects[0].pageIndex).toBeDefined();
    });

    it('should sample intermediate positions for large selection', () => {
      const rects = fallback.getSelectionRects(0, 100);

      // Should have start, end, and some intermediate points
      expect(rects.length).toBeGreaterThan(2);
    });

    it('should handle selection spanning pages', () => {
      // Mock positions on different pages
      let callCount = 0;
      mockPmView.coordsAtPos = (pos: number) => {
        const y = pos < 50 ? 100 : 1200; // First half on page 0, second half on page 1
        return { left: 100 + pos, top: y, bottom: y + 20 };
      };

      const rects = fallback.getSelectionRects(0, 100);

      expect(rects.length).toBeGreaterThan(0);
      // Should have rects on multiple pages
      const pageIndices = new Set(rects.map((r) => r.pageIndex));
      expect(pageIndices.size).toBeGreaterThan(1);
    });

    it('should filter out null rects', () => {
      let callCount = 0;
      mockPmView.coordsAtPos = (pos: number) => {
        // Return null for some positions
        return pos % 3 === 0 ? null : { left: 100, top: 100, bottom: 120 };
      };

      const rects = fallback.getSelectionRects(0, 30);

      // Should only include valid rects
      expect(rects.every((r) => r !== null)).toBe(true);
    });
  });
});
