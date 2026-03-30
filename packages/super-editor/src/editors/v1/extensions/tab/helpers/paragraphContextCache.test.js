// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { getParagraphContext, clearParagraphContext, clearAllParagraphContexts } from './paragraphContextCache.js';

describe('paragraphContextCache', () => {
  describe('getParagraphContext', () => {
    it('should compute and cache context on first access', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = { someHelper: 'value' };
      const revision = 1;
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      const result = getParagraphContext(paragraph, startPos, helpers, revision, computeFn);

      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(computeFn).toHaveBeenCalledWith(paragraph, startPos, helpers);
      expect(result).toEqual({ data: 'computed' });
    });

    it('should return cached context when revision matches', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = { someHelper: 'value' };
      const revision = 1;
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      // First call - computes and caches
      const result1 = getParagraphContext(paragraph, startPos, helpers, revision, computeFn);

      // Second call - should return cached value
      const result2 = getParagraphContext(paragraph, startPos, helpers, revision, computeFn);

      expect(computeFn).toHaveBeenCalledTimes(1); // Only called once
      expect(result1).toEqual(result2);
      expect(result2).toEqual({ data: 'computed' });
    });

    it('should recompute when revision changes', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = { someHelper: 'value' };
      let revision = 1;
      const computeFn = vi.fn((para) => ({ data: `computed-rev-${revision}` }));

      // First call with revision 1
      const result1 = getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      expect(result1).toEqual({ data: 'computed-rev-1' });
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Change revision
      revision = 2;

      // Second call with revision 2 - should recompute
      const result2 = getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      expect(result2).toEqual({ data: 'computed-rev-2' });
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('should cache different contexts for different paragraph nodes', () => {
      const paragraph1 = { type: { name: 'paragraph' }, id: 1 };
      const paragraph2 = { type: { name: 'paragraph' }, id: 2 };
      const startPos = 0;
      const helpers = { someHelper: 'value' };
      const revision = 1;

      const computeFn1 = vi.fn(() => ({ data: 'para1' }));
      const computeFn2 = vi.fn(() => ({ data: 'para2' }));

      const result1 = getParagraphContext(paragraph1, startPos, helpers, revision, computeFn1);
      const result2 = getParagraphContext(paragraph2, startPos, helpers, revision, computeFn2);

      expect(result1).toEqual({ data: 'para1' });
      expect(result2).toEqual({ data: 'para2' });
      expect(computeFn1).toHaveBeenCalledTimes(1);
      expect(computeFn2).toHaveBeenCalledTimes(1);
    });

    it('should handle different startPos and helpers parameters', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const revision = 1;
      const computeFn = vi.fn((para, pos, help) => ({ pos, help }));

      // Cache only depends on paragraph node and revision, not startPos/helpers
      const result1 = getParagraphContext(paragraph, 0, { a: 1 }, revision, computeFn);
      const result2 = getParagraphContext(paragraph, 10, { b: 2 }, revision, computeFn);

      // Should return the same cached result since paragraph and revision are the same
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });

    it('should handle compute function returning different data types', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const revision = 1;

      // Test with object
      const computeObj = vi.fn(() => ({ key: 'value' }));
      const resultObj = getParagraphContext(paragraph, startPos, helpers, revision, computeObj);
      expect(resultObj).toEqual({ key: 'value' });

      // Clear and test with array
      clearParagraphContext(paragraph);
      const computeArr = vi.fn(() => [1, 2, 3]);
      const resultArr = getParagraphContext(paragraph, startPos, helpers, revision, computeArr);
      expect(resultArr).toEqual([1, 2, 3]);

      // Clear and test with primitive
      clearParagraphContext(paragraph);
      const computePrim = vi.fn(() => 'string');
      const resultPrim = getParagraphContext(paragraph, startPos, helpers, revision, computePrim);
      expect(resultPrim).toBe('string');
    });
  });

  describe('clearParagraphContext', () => {
    it('should remove cached context for specific paragraph', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const revision = 1;
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      // Cache the context
      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Clear the cache for this paragraph
      clearParagraphContext(paragraph);

      // Next access should recompute
      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('should not affect other paragraph caches', () => {
      const paragraph1 = { type: { name: 'paragraph' }, id: 1 };
      const paragraph2 = { type: { name: 'paragraph' }, id: 2 };
      const startPos = 0;
      const helpers = {};
      const revision = 1;

      const computeFn1 = vi.fn(() => ({ data: 'para1' }));
      const computeFn2 = vi.fn(() => ({ data: 'para2' }));

      // Cache both
      getParagraphContext(paragraph1, startPos, helpers, revision, computeFn1);
      getParagraphContext(paragraph2, startPos, helpers, revision, computeFn2);

      // Clear only paragraph1
      clearParagraphContext(paragraph1);

      // paragraph2 should still be cached
      getParagraphContext(paragraph2, startPos, helpers, revision, computeFn2);
      expect(computeFn2).toHaveBeenCalledTimes(1);

      // paragraph1 should recompute
      getParagraphContext(paragraph1, startPos, helpers, revision, computeFn1);
      expect(computeFn1).toHaveBeenCalledTimes(2);
    });

    it('should handle clearing non-existent paragraph gracefully', () => {
      const paragraph = { type: { name: 'paragraph' } };

      // Should not throw
      expect(() => clearParagraphContext(paragraph)).not.toThrow();
    });

    it('should handle clearing same paragraph multiple times', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const revision = 1;
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);

      clearParagraphContext(paragraph);
      clearParagraphContext(paragraph);
      clearParagraphContext(paragraph);

      // Should still work normally
      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAllParagraphContexts', () => {
    it('should clear all cached paragraph contexts', () => {
      const paragraph1 = { type: { name: 'paragraph' }, id: 1 };
      const paragraph2 = { type: { name: 'paragraph' }, id: 2 };
      const paragraph3 = { type: { name: 'paragraph' }, id: 3 };
      const startPos = 0;
      const helpers = {};
      const revision = 1;

      const computeFn1 = vi.fn(() => ({ data: 'para1' }));
      const computeFn2 = vi.fn(() => ({ data: 'para2' }));
      const computeFn3 = vi.fn(() => ({ data: 'para3' }));

      // Cache all three
      getParagraphContext(paragraph1, startPos, helpers, revision, computeFn1);
      getParagraphContext(paragraph2, startPos, helpers, revision, computeFn2);
      getParagraphContext(paragraph3, startPos, helpers, revision, computeFn3);

      expect(computeFn1).toHaveBeenCalledTimes(1);
      expect(computeFn2).toHaveBeenCalledTimes(1);
      expect(computeFn3).toHaveBeenCalledTimes(1);

      // Clear all
      clearAllParagraphContexts();

      // All should recompute
      getParagraphContext(paragraph1, startPos, helpers, revision, computeFn1);
      getParagraphContext(paragraph2, startPos, helpers, revision, computeFn2);
      getParagraphContext(paragraph3, startPos, helpers, revision, computeFn3);

      expect(computeFn1).toHaveBeenCalledTimes(2);
      expect(computeFn2).toHaveBeenCalledTimes(2);
      expect(computeFn3).toHaveBeenCalledTimes(2);
    });

    it('should allow cache to work normally after clearing all', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const revision = 1;
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      clearAllParagraphContexts();

      // Should work normally
      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);

      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('should handle clearing empty cache', () => {
      // Should not throw
      expect(() => clearAllParagraphContexts()).not.toThrow();
    });

    it('should handle multiple consecutive clears', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const revision = 1;
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);

      clearAllParagraphContexts();
      clearAllParagraphContexts();
      clearAllParagraphContexts();

      // Should still work
      getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('should create fresh cache after clearing', () => {
      const paragraph1 = { type: { name: 'paragraph' }, id: 1 };
      const paragraph2 = { type: { name: 'paragraph' }, id: 2 };
      const startPos = 0;
      const helpers = {};
      const revision = 1;

      const computeFn1 = vi.fn(() => ({ data: 'para1' }));
      const computeFn2 = vi.fn(() => ({ data: 'para2' }));

      // Cache first paragraph
      getParagraphContext(paragraph1, startPos, helpers, revision, computeFn1);

      // Clear all
      clearAllParagraphContexts();

      // Cache second paragraph in fresh cache
      getParagraphContext(paragraph2, startPos, helpers, revision, computeFn2);

      // First paragraph should not be in cache
      getParagraphContext(paragraph1, startPos, helpers, revision, computeFn1);

      expect(computeFn1).toHaveBeenCalledTimes(2);
      expect(computeFn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache invalidation on document changes', () => {
    it('should invalidate cache when revision increments', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const computeFn = vi.fn((para) => ({ timestamp: Date.now() }));

      // Simulate document changes by incrementing revision
      const result1 = getParagraphContext(paragraph, startPos, helpers, 1, computeFn);
      const result2 = getParagraphContext(paragraph, startPos, helpers, 2, computeFn);
      const result3 = getParagraphContext(paragraph, startPos, helpers, 3, computeFn);

      // Should recompute on each revision change
      expect(computeFn).toHaveBeenCalledTimes(3);
      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
    });

    it('should handle rapid revision changes', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      // Simulate many document changes
      for (let revision = 0; revision < 100; revision++) {
        getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      }

      expect(computeFn).toHaveBeenCalledTimes(100);
    });

    it('should cache within same revision even with multiple accesses', () => {
      const paragraph = { type: { name: 'paragraph' } };
      const startPos = 0;
      const helpers = {};
      const revision = 5;
      const computeFn = vi.fn(() => ({ data: 'computed' }));

      // Multiple accesses with same revision
      for (let i = 0; i < 10; i++) {
        getParagraphContext(paragraph, startPos, helpers, revision, computeFn);
      }

      // Should only compute once
      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });
});
