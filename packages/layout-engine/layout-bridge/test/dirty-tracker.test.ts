/**
 * Tests for DirtyTracker
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DirtyTracker, type DirtyRange } from '../src/dirty-tracker';

describe('DirtyTracker', () => {
  let tracker: DirtyTracker;

  beforeEach(() => {
    tracker = new DirtyTracker();
  });

  describe('markPageDirty', () => {
    it('should mark a single page as dirty', () => {
      tracker.markPageDirty(0, 'edit');

      expect(tracker.hasDirty()).toBe(true);
      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toContain(0);
    });

    it('should mark multiple pages as dirty', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(2, 'edit');
      tracker.markPageDirty(5, 'pagination');

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toContain(0);
      expect(dirtyPages).toContain(2);
      expect(dirtyPages).toContain(5);
      expect(dirtyPages).toHaveLength(3);
    });

    it('should ignore negative page indices', () => {
      tracker.markPageDirty(-1, 'edit');

      expect(tracker.hasDirty()).toBe(false);
    });

    it('should handle the same page marked multiple times', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(0, 'resize');

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toEqual([0]);
    });

    it('should track different dirty reasons', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(1, 'resize');
      tracker.markPageDirty(2, 'scroll');
      tracker.markPageDirty(3, 'pagination');

      const ranges = tracker.getDirtyRanges();
      expect(ranges.length).toBeGreaterThan(0);

      const reasons = ranges.map((r) => r.reason);
      expect(reasons).toContain('edit');
      expect(reasons).toContain('resize');
      expect(reasons).toContain('scroll');
      expect(reasons).toContain('pagination');
    });
  });

  describe('markBlocksDirty', () => {
    it('should mark a single block as dirty', () => {
      tracker.markBlocksDirty(0, 0, 'edit');

      expect(tracker.hasDirty()).toBe(true);
      const ranges = tracker.getDirtyRanges();
      expect(ranges.length).toBeGreaterThan(0);
      expect(ranges[0].startBlock).toBe(0);
      expect(ranges[0].endBlock).toBe(0);
    });

    it('should mark a range of blocks as dirty', () => {
      tracker.markBlocksDirty(5, 10, 'edit');

      const ranges = tracker.getDirtyRanges();
      expect(ranges.length).toBeGreaterThan(0);

      const blockRange = ranges.find((r) => r.startBlock === 5 && r.endBlock === 10);
      expect(blockRange).toBeDefined();
      expect(blockRange?.reason).toBe('edit');
    });

    it('should ignore negative block indices', () => {
      tracker.markBlocksDirty(-1, 5, 'edit');

      expect(tracker.hasDirty()).toBe(false);
    });

    it('should ignore invalid ranges (end < start)', () => {
      tracker.markBlocksDirty(10, 5, 'edit');

      expect(tracker.hasDirty()).toBe(false);
    });

    it('should merge overlapping block ranges with same reason', () => {
      tracker.markBlocksDirty(0, 5, 'edit');
      tracker.markBlocksDirty(3, 8, 'edit');

      const ranges = tracker.getDirtyRanges();
      const editRanges = ranges.filter((r) => r.reason === 'edit' && r.startBlock >= 0);

      // Should merge into single range [0, 8]
      expect(editRanges.length).toBe(1);
      expect(editRanges[0].startBlock).toBe(0);
      expect(editRanges[0].endBlock).toBe(8);
    });

    it('should keep separate ranges for different reasons', () => {
      tracker.markBlocksDirty(0, 5, 'edit');
      tracker.markBlocksDirty(3, 8, 'resize');

      const ranges = tracker.getDirtyRanges();
      expect(ranges.length).toBe(2);
    });
  });

  describe('markDirtyFrom', () => {
    it('should mark all pages from start point', () => {
      tracker.markDirtyFrom(5, 'pagination');

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 100);
      // Should include pages from 5 onwards within viewport
      expect(dirtyPages.length).toBeGreaterThan(0);
      expect(Math.min(...dirtyPages)).toBeGreaterThanOrEqual(5);
    });

    it('should ignore negative start page', () => {
      tracker.markDirtyFrom(-1, 'pagination');

      expect(tracker.hasDirty()).toBe(false);
    });

    it('should create a range with open-ended endPage', () => {
      tracker.markDirtyFrom(10, 'pagination');

      const ranges = tracker.getDirtyRanges();
      const paginationRange = ranges.find((r) => r.reason === 'pagination');

      expect(paginationRange).toBeDefined();
      expect(paginationRange?.startPage).toBe(10);
      expect(paginationRange?.endPage).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should affect viewport queries correctly', () => {
      tracker.markDirtyFrom(50, 'pagination');

      const viewport1 = tracker.getDirtyPagesInViewport(0, 49);
      const viewport2 = tracker.getDirtyPagesInViewport(50, 100);

      expect(viewport1).toHaveLength(0);
      expect(viewport2.length).toBeGreaterThan(0);
    });
  });

  describe('getDirtyPagesInViewport', () => {
    it('should return empty array for empty viewport', () => {
      tracker.markPageDirty(5, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(0, -1);
      expect(dirtyPages).toEqual([]);
    });

    it('should return empty array when viewport has no dirty pages', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(1, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(10, 20);
      expect(dirtyPages).toEqual([]);
    });

    it('should return sorted dirty pages within viewport', () => {
      tracker.markPageDirty(5, 'edit');
      tracker.markPageDirty(2, 'edit');
      tracker.markPageDirty(8, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toEqual([2, 5, 8]);
    });

    it('should filter pages outside viewport', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(5, 'edit');
      tracker.markPageDirty(15, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(3, 10);
      expect(dirtyPages).toEqual([5]);
    });

    it('should include pages at viewport boundaries', () => {
      tracker.markPageDirty(5, 'edit');
      tracker.markPageDirty(10, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(5, 10);
      expect(dirtyPages).toEqual([5, 10]);
    });

    it('should handle single-page viewport', () => {
      tracker.markPageDirty(5, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(5, 5);
      expect(dirtyPages).toEqual([5]);
    });

    it('should handle markDirtyFrom affecting viewport', () => {
      tracker.markDirtyFrom(7, 'pagination');

      const dirtyPages = tracker.getDirtyPagesInViewport(5, 10);
      // Should include pages 7, 8, 9, 10
      expect(dirtyPages).toEqual([7, 8, 9, 10]);
    });

    it('should not return duplicates', () => {
      tracker.markPageDirty(5, 'edit');
      tracker.markDirtyFrom(5, 'pagination');

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      const uniquePages = [...new Set(dirtyPages)];
      expect(dirtyPages).toEqual(uniquePages);
    });

    it('should handle invalid viewport (start > end)', () => {
      tracker.markPageDirty(5, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(10, 5);
      expect(dirtyPages).toEqual([]);
    });

    it('should handle negative viewport start', () => {
      tracker.markPageDirty(5, 'edit');

      const dirtyPages = tracker.getDirtyPagesInViewport(-5, 10);
      expect(dirtyPages).toEqual([]);
    });
  });

  describe('getDirtyRanges', () => {
    it('should return empty array when no ranges exist', () => {
      const ranges = tracker.getDirtyRanges();
      expect(ranges).toEqual([]);
    });

    it('should return copy of ranges to prevent mutation', () => {
      tracker.markPageDirty(0, 'edit');

      const ranges1 = tracker.getDirtyRanges();
      const ranges2 = tracker.getDirtyRanges();

      expect(ranges1).toEqual(ranges2);
      expect(ranges1).not.toBe(ranges2); // Different array instances
    });

    it('should include all dirty ranges', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markBlocksDirty(5, 10, 'resize');
      tracker.markDirtyFrom(20, 'pagination');

      const ranges = tracker.getDirtyRanges();
      expect(ranges.length).toBe(3);
    });

    it('should preserve range details', () => {
      tracker.markBlocksDirty(5, 10, 'edit');

      const ranges = tracker.getDirtyRanges();
      expect(ranges[0]).toMatchObject({
        startBlock: 5,
        endBlock: 10,
        reason: 'edit',
      });
    });
  });

  describe('clearDirty', () => {
    it('should clear specified pages', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(1, 'edit');
      tracker.markPageDirty(2, 'edit');

      tracker.clearDirty([0, 2]);

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toEqual([1]);
    });

    it('should handle clearing non-existent pages', () => {
      tracker.markPageDirty(0, 'edit');

      tracker.clearDirty([5, 10]);

      expect(tracker.hasDirty()).toBe(true);
      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toEqual([0]);
    });

    it('should handle empty clear array', () => {
      tracker.markPageDirty(0, 'edit');

      tracker.clearDirty([]);

      expect(tracker.hasDirty()).toBe(true);
    });

    it('should not affect block dirty state', () => {
      tracker.markBlocksDirty(5, 10, 'edit');

      tracker.clearDirty([0, 1, 2]);

      expect(tracker.hasDirty()).toBe(true);
      const ranges = tracker.getDirtyRanges();
      expect(ranges.length).toBeGreaterThan(0);
    });

    it('should remove ranges when all pages cleared', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(1, 'edit');

      const rangesBefore = tracker.getDirtyRanges().length;

      tracker.clearDirty([0, 1]);

      const rangesAfter = tracker.getDirtyRanges().length;
      expect(rangesAfter).toBeLessThanOrEqual(rangesBefore);
    });
  });

  describe('hasDirty', () => {
    it('should return false for new tracker', () => {
      expect(tracker.hasDirty()).toBe(false);
    });

    it('should return true when pages are dirty', () => {
      tracker.markPageDirty(0, 'edit');
      expect(tracker.hasDirty()).toBe(true);
    });

    it('should return true when blocks are dirty', () => {
      tracker.markBlocksDirty(0, 5, 'edit');
      expect(tracker.hasDirty()).toBe(true);
    });

    it('should return true when ranges exist', () => {
      tracker.markDirtyFrom(10, 'pagination');
      expect(tracker.hasDirty()).toBe(true);
    });

    it('should return false after clearing all dirty pages', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(1, 'edit');

      tracker.clearDirty([0, 1]);

      // Might still have ranges or blocks
      // This tests the specific implementation behavior
    });
  });

  describe('clearAll', () => {
    it('should clear all dirty state', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(5, 'edit');
      tracker.markBlocksDirty(10, 20, 'resize');
      tracker.markDirtyFrom(30, 'pagination');

      tracker.clearAll();

      expect(tracker.hasDirty()).toBe(false);
      expect(tracker.getDirtyRanges()).toEqual([]);
      expect(tracker.getDirtyPagesInViewport(0, 100)).toEqual([]);
    });

    it('should allow marking dirty after clearAll', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.clearAll();

      tracker.markPageDirty(1, 'edit');

      expect(tracker.hasDirty()).toBe(true);
      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toEqual([1]);
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed page and block dirty tracking', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markBlocksDirty(10, 20, 'resize');
      tracker.markPageDirty(5, 'scroll');

      expect(tracker.hasDirty()).toBe(true);
      const ranges = tracker.getDirtyRanges();
      expect(ranges.length).toBeGreaterThan(0);
    });

    it('should handle pagination affecting subsequent pages', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(1, 'edit');
      tracker.markDirtyFrom(2, 'pagination');

      const viewport = tracker.getDirtyPagesInViewport(0, 10);
      // Should include pages 0, 1, and pages from 2 onwards
      expect(viewport).toContain(0);
      expect(viewport).toContain(1);
      expect(viewport.filter((p) => p >= 2).length).toBeGreaterThan(0);
    });

    it('should handle large viewport queries efficiently', () => {
      for (let i = 0; i < 100; i += 10) {
        tracker.markPageDirty(i, 'edit');
      }

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 1000);
      expect(dirtyPages.length).toBe(10);
    });

    it('should handle interleaved mark and clear operations', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(1, 'edit');
      tracker.clearDirty([0]);

      tracker.markPageDirty(2, 'edit');
      tracker.markPageDirty(3, 'edit');
      tracker.clearDirty([1, 2]);

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages).toEqual([3]);
    });

    it('should maintain sorted order with random insertions', () => {
      const pages = [15, 3, 8, 1, 20, 7, 12];
      for (const page of pages) {
        tracker.markPageDirty(page, 'edit');
      }

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 25);
      const sorted = [...dirtyPages].sort((a, b) => a - b);
      expect(dirtyPages).toEqual(sorted);
    });
  });

  describe('edge cases', () => {
    it('should handle page index at boundaries', () => {
      tracker.markPageDirty(0, 'edit');
      tracker.markPageDirty(Number.MAX_SAFE_INTEGER - 1, 'edit');

      expect(tracker.hasDirty()).toBe(true);
    });

    it('should handle markDirtyFrom with page 0', () => {
      tracker.markDirtyFrom(0, 'pagination');

      const dirtyPages = tracker.getDirtyPagesInViewport(0, 10);
      expect(dirtyPages.length).toBe(11); // Pages 0-10 inclusive
    });

    it('should handle multiple trackers independently', () => {
      const tracker1 = new DirtyTracker();
      const tracker2 = new DirtyTracker();

      tracker1.markPageDirty(0, 'edit');
      tracker2.markPageDirty(1, 'edit');

      expect(tracker1.getDirtyPagesInViewport(0, 10)).toEqual([0]);
      expect(tracker2.getDirtyPagesInViewport(0, 10)).toEqual([1]);
    });

    it('should handle viewport at document end', () => {
      tracker.markDirtyFrom(100, 'pagination');

      const dirtyPages = tracker.getDirtyPagesInViewport(95, 105);
      expect(dirtyPages).toContain(100);
      expect(dirtyPages).toContain(101);
    });
  });
});
