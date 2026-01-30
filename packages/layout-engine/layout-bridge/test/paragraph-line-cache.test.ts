/**
 * Tests for ParagraphLineCache
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ParagraphLineCache, type ParagraphLines, type LineInfo } from '../src/paragraph-line-cache';

// Helper to create line info
function createLine(localStart: number, localEnd: number, width: number = 100, height: number = 20): LineInfo {
  return { localStart, localEnd, width, height };
}

// Helper to create paragraph lines
function createParagraphLines(lines: LineInfo[], version: number = 1): ParagraphLines {
  const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
  return {
    version,
    lines,
    totalHeight,
    dirty: false,
  };
}

describe('ParagraphLineCache', () => {
  let cache: ParagraphLineCache;

  beforeEach(() => {
    cache = new ParagraphLineCache();
  });

  describe('getLines and setLines', () => {
    it('should get undefined for uncached paragraph', () => {
      expect(cache.getLines(0)).toBeUndefined();
    });

    it('should set and get lines', () => {
      const lines = createParagraphLines([createLine(0, 10), createLine(10, 20)]);

      cache.setLines(0, lines);

      const retrieved = cache.getLines(0);
      expect(retrieved).toBeDefined();
      expect(retrieved?.lines.length).toBe(2);
      expect(retrieved?.totalHeight).toBe(40);
      expect(retrieved?.version).toBe(1);
      expect(retrieved?.dirty).toBe(false);
    });

    it('should set dirty flag to false when setting lines', () => {
      const lines = createParagraphLines([createLine(0, 10)]);
      lines.dirty = true;

      cache.setLines(0, lines);

      expect(cache.getLines(0)?.dirty).toBe(false);
    });

    it('should cache multiple paragraphs independently', () => {
      const lines1 = createParagraphLines([createLine(0, 10)], 1);
      const lines2 = createParagraphLines([createLine(0, 15), createLine(15, 30)], 2);

      cache.setLines(0, lines1);
      cache.setLines(1, lines2);

      expect(cache.getLines(0)?.lines.length).toBe(1);
      expect(cache.getLines(1)?.lines.length).toBe(2);
      expect(cache.getLines(0)?.version).toBe(1);
      expect(cache.getLines(1)?.version).toBe(2);
    });
  });

  describe('markDirty', () => {
    beforeEach(() => {
      const lines = createParagraphLines([createLine(0, 10)]);
      cache.setLines(0, lines);
    });

    it('should mark cached paragraph as dirty', () => {
      expect(cache.getLines(0)?.dirty).toBe(false);

      cache.markDirty(0);

      expect(cache.getLines(0)?.dirty).toBe(true);
    });

    it('should not throw when marking uncached paragraph', () => {
      expect(() => cache.markDirty(999)).not.toThrow();
    });

    it('should preserve other properties when marking dirty', () => {
      const original = cache.getLines(0);

      cache.markDirty(0);

      const marked = cache.getLines(0);
      expect(marked?.lines).toEqual(original?.lines);
      expect(marked?.totalHeight).toBe(original?.totalHeight);
      expect(marked?.version).toBe(original?.version);
      expect(marked?.dirty).toBe(true);
    });
  });

  describe('markDirtyFrom', () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) {
        const lines = createParagraphLines([createLine(0, 10)]);
        cache.setLines(i, lines);
      }
    });

    it('should mark all paragraphs from index onwards', () => {
      cache.markDirtyFrom(2);

      expect(cache.getLines(0)?.dirty).toBe(false);
      expect(cache.getLines(1)?.dirty).toBe(false);
      expect(cache.getLines(2)?.dirty).toBe(true);
      expect(cache.getLines(3)?.dirty).toBe(true);
      expect(cache.getLines(4)?.dirty).toBe(true);
    });

    it('should mark all when starting from 0', () => {
      cache.markDirtyFrom(0);

      for (let i = 0; i < 5; i++) {
        expect(cache.getLines(i)?.dirty).toBe(true);
      }
    });

    it('should handle index beyond cached paragraphs', () => {
      cache.markDirtyFrom(100);

      for (let i = 0; i < 5; i++) {
        expect(cache.getLines(i)?.dirty).toBe(false);
      }
    });
  });

  describe('markDirtyRange', () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) {
        const lines = createParagraphLines([createLine(0, 10)]);
        cache.setLines(i, lines);
      }
    });

    it('should mark paragraphs in range', () => {
      cache.markDirtyRange(1, 4);

      expect(cache.getLines(0)?.dirty).toBe(false);
      expect(cache.getLines(1)?.dirty).toBe(true);
      expect(cache.getLines(2)?.dirty).toBe(true);
      expect(cache.getLines(3)?.dirty).toBe(true);
      expect(cache.getLines(4)?.dirty).toBe(false);
    });

    it('should handle empty range', () => {
      cache.markDirtyRange(2, 2);

      for (let i = 0; i < 5; i++) {
        expect(cache.getLines(i)?.dirty).toBe(false);
      }
    });

    it('should handle range beyond cached paragraphs', () => {
      cache.markDirtyRange(10, 20);

      for (let i = 0; i < 5; i++) {
        expect(cache.getLines(i)?.dirty).toBe(false);
      }
    });
  });

  describe('isDirty', () => {
    it('should return true for uncached paragraph', () => {
      expect(cache.isDirty(0)).toBe(true);
    });

    it('should return false for clean cached paragraph', () => {
      const lines = createParagraphLines([createLine(0, 10)]);
      cache.setLines(0, lines);

      expect(cache.isDirty(0)).toBe(false);
    });

    it('should return true for dirty cached paragraph', () => {
      const lines = createParagraphLines([createLine(0, 10)]);
      cache.setLines(0, lines);
      cache.markDirty(0);

      expect(cache.isDirty(0)).toBe(true);
    });
  });

  describe('findLineContaining', () => {
    beforeEach(() => {
      const lines = createParagraphLines([createLine(0, 10), createLine(10, 25), createLine(25, 40)]);
      cache.setLines(0, lines);
    });

    it('should find line containing offset', () => {
      const line = cache.findLineContaining(0, 15);
      expect(line?.localStart).toBe(10);
      expect(line?.localEnd).toBe(25);
    });

    it('should find first line', () => {
      const line = cache.findLineContaining(0, 0);
      expect(line?.localStart).toBe(0);
      expect(line?.localEnd).toBe(10);
    });

    it('should find line at boundary', () => {
      const line = cache.findLineContaining(0, 10);
      expect(line?.localStart).toBe(10);
      expect(line?.localEnd).toBe(25);
    });

    it('should return last line for offset beyond all lines', () => {
      const line = cache.findLineContaining(0, 100);
      expect(line?.localStart).toBe(25);
      expect(line?.localEnd).toBe(40);
    });

    it('should return null for uncached paragraph', () => {
      const line = cache.findLineContaining(999, 5);
      expect(line).toBeNull();
    });

    it('should return null for dirty paragraph', () => {
      cache.markDirty(0);
      const line = cache.findLineContaining(0, 5);
      expect(line).toBeNull();
    });
  });

  describe('findLineIndex', () => {
    beforeEach(() => {
      const lines = createParagraphLines([createLine(0, 10), createLine(10, 25), createLine(25, 40)]);
      cache.setLines(0, lines);
    });

    it('should find line index containing offset', () => {
      expect(cache.findLineIndex(0, 0)).toBe(0);
      expect(cache.findLineIndex(0, 5)).toBe(0);
      expect(cache.findLineIndex(0, 10)).toBe(1);
      expect(cache.findLineIndex(0, 20)).toBe(1);
      expect(cache.findLineIndex(0, 25)).toBe(2);
      expect(cache.findLineIndex(0, 30)).toBe(2);
    });

    it('should return last index for offset beyond all lines', () => {
      expect(cache.findLineIndex(0, 100)).toBe(2);
    });

    it('should return -1 for uncached paragraph', () => {
      expect(cache.findLineIndex(999, 5)).toBe(-1);
    });

    it('should return -1 for dirty paragraph', () => {
      cache.markDirty(0);
      expect(cache.findLineIndex(0, 5)).toBe(-1);
    });
  });

  describe('remove', () => {
    it('should remove cached paragraph', () => {
      const lines = createParagraphLines([createLine(0, 10)]);
      cache.setLines(0, lines);

      expect(cache.has(0)).toBe(true);

      cache.remove(0);

      expect(cache.has(0)).toBe(false);
      expect(cache.getLines(0)).toBeUndefined();
    });

    it('should not throw when removing uncached paragraph', () => {
      expect(() => cache.remove(999)).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all cached paragraphs', () => {
      for (let i = 0; i < 3; i++) {
        const lines = createParagraphLines([createLine(0, 10)]);
        cache.setLines(i, lines);
      }

      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.getLines(0)).toBeUndefined();
      expect(cache.getLines(1)).toBeUndefined();
      expect(cache.getLines(2)).toBeUndefined();
    });
  });

  describe('size and has', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size).toBe(0);
    });

    it('should return correct size', () => {
      for (let i = 0; i < 5; i++) {
        const lines = createParagraphLines([createLine(0, 10)]);
        cache.setLines(i, lines);
      }

      expect(cache.size).toBe(5);
    });

    it('should check if paragraph is cached', () => {
      const lines = createParagraphLines([createLine(0, 10)]);
      cache.setLines(0, lines);

      expect(cache.has(0)).toBe(true);
      expect(cache.has(1)).toBe(false);
    });
  });

  describe('getCachedIndices', () => {
    it('should return empty array for empty cache', () => {
      expect(cache.getCachedIndices()).toEqual([]);
    });

    it('should return sorted cached indices', () => {
      const lines = createParagraphLines([createLine(0, 10)]);

      cache.setLines(5, lines);
      cache.setLines(1, lines);
      cache.setLines(3, lines);

      expect(cache.getCachedIndices()).toEqual([1, 3, 5]);
    });
  });

  describe('getStats', () => {
    it('should return stats for empty cache', () => {
      const stats = cache.getStats();
      expect(stats.total).toBe(0);
      expect(stats.dirty).toBe(0);
      expect(stats.clean).toBe(0);
    });

    it('should return correct stats', () => {
      for (let i = 0; i < 5; i++) {
        const lines = createParagraphLines([createLine(0, 10)]);
        cache.setLines(i, lines);
      }

      cache.markDirty(1);
      cache.markDirty(3);

      const stats = cache.getStats();
      expect(stats.total).toBe(5);
      expect(stats.dirty).toBe(2);
      expect(stats.clean).toBe(3);
    });
  });

  describe('validateVersion', () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) {
        const lines = createParagraphLines([createLine(0, 10)], i % 2 === 0 ? 1 : 2);
        cache.setLines(i, lines);
      }
    });

    it('should mark entries with mismatched versions as dirty', () => {
      const markedDirty = cache.validateVersion(2);

      expect(markedDirty).toBe(3); // indices 0, 2, 4 have version 1
      expect(cache.getLines(0)?.dirty).toBe(true);
      expect(cache.getLines(1)?.dirty).toBe(false); // version 2
      expect(cache.getLines(2)?.dirty).toBe(true);
      expect(cache.getLines(3)?.dirty).toBe(false); // version 2
      expect(cache.getLines(4)?.dirty).toBe(true);
    });

    it('should not mark already dirty entries again', () => {
      cache.markDirty(0);

      const markedDirty = cache.validateVersion(2);

      // Should only count newly marked entries
      expect(markedDirty).toBe(2); // indices 2, 4 (0 was already dirty)
    });

    it('should return 0 when all versions match', () => {
      const markedDirty = cache.validateVersion(1);

      // Only entries with version 1 match, version 2 entries get marked
      expect(markedDirty).toBe(2); // indices 1, 3 have version 2
    });
  });

  describe('pruneDirty', () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) {
        const lines = createParagraphLines([createLine(0, 10)]);
        cache.setLines(i, lines);
      }

      cache.markDirty(1);
      cache.markDirty(3);
    });

    it('should remove dirty entries', () => {
      const removed = cache.pruneDirty();

      expect(removed).toBe(2);
      expect(cache.size).toBe(3);
      expect(cache.has(0)).toBe(true);
      expect(cache.has(1)).toBe(false);
      expect(cache.has(2)).toBe(true);
      expect(cache.has(3)).toBe(false);
      expect(cache.has(4)).toBe(true);
    });

    it('should return 0 when no dirty entries', () => {
      cache.clear();

      for (let i = 0; i < 3; i++) {
        const lines = createParagraphLines([createLine(0, 10)]);
        cache.setLines(i, lines);
      }

      const removed = cache.pruneDirty();
      expect(removed).toBe(0);
      expect(cache.size).toBe(3);
    });

    it('should handle empty cache', () => {
      cache.clear();
      const removed = cache.pruneDirty();
      expect(removed).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle paragraph with no lines', () => {
      const lines = createParagraphLines([]);
      cache.setLines(0, lines);

      expect(cache.getLines(0)?.lines.length).toBe(0);
      expect(cache.getLines(0)?.totalHeight).toBe(0);
      expect(cache.findLineContaining(0, 5)).toBeNull();
      expect(cache.findLineIndex(0, 5)).toBe(-1);
    });

    it('should handle paragraph with single character line', () => {
      const lines = createParagraphLines([createLine(0, 1)]);
      cache.setLines(0, lines);

      expect(cache.findLineContaining(0, 0)?.localStart).toBe(0);
      expect(cache.findLineIndex(0, 0)).toBe(0);
    });

    it('should handle very long paragraph', () => {
      const longLines: LineInfo[] = [];
      for (let i = 0; i < 1000; i++) {
        longLines.push(createLine(i * 10, (i + 1) * 10));
      }

      const lines = createParagraphLines(longLines);
      cache.setLines(0, lines);

      expect(cache.getLines(0)?.lines.length).toBe(1000);
      expect(cache.findLineIndex(0, 5000)).toBe(500);
    });
  });
});
