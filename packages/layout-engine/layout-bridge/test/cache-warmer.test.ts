/**
 * Tests for CacheWarmer
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CacheWarmer } from '../src/cache-warmer';
import { FontMetricsCache } from '../src/font-metrics-cache';
import { ParagraphLineCache } from '../src/paragraph-line-cache';

describe('CacheWarmer', () => {
  let warmer: CacheWarmer;
  let fontCache: FontMetricsCache;
  let paraCache: ParagraphLineCache;

  beforeEach(() => {
    fontCache = new FontMetricsCache();
    paraCache = new ParagraphLineCache();
    warmer = new CacheWarmer(fontCache, paraCache);
  });

  describe('warmOnLoad', () => {
    it('should warm font metrics cache', async () => {
      const config = {
        fonts: ['Arial|16|normal|normal'],
        viewportPages: [0, 1, 2],
        prefetchAdjacent: false,
      };

      await warmer.warmOnLoad(config);

      const progress = warmer.getProgress();
      expect(progress.fontsCached).toBe(1);
    });

    it('should track warming progress', async () => {
      const config = {
        fonts: ['Arial|16|normal|normal', 'Times|14|bold|normal'],
        viewportPages: [],
        prefetchAdjacent: false,
      };

      await warmer.warmOnLoad(config);

      const progress = warmer.getProgress();
      expect(progress.fontsCached).toBe(2);
      expect(progress.total).toBe(2);
    });
  });

  describe('getProgress', () => {
    it('should return progress statistics', () => {
      const progress = warmer.getProgress();

      expect(progress).toHaveProperty('fontsCached');
      expect(progress).toHaveProperty('paragraphsCached');
      expect(progress).toHaveProperty('total');
    });
  });

  describe('getCompletionPercentage', () => {
    it('should return 100% when nothing to warm', () => {
      expect(warmer.getCompletionPercentage()).toBe(100);
    });

    it('should calculate percentage correctly', async () => {
      await warmer.warmOnLoad({
        fonts: ['Arial|16|normal|normal', 'Times|14|normal|normal'],
        viewportPages: [],
        prefetchAdjacent: false,
      });

      const percentage = warmer.getCompletionPercentage();
      expect(percentage).toBeGreaterThan(0);
      expect(percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('resetProgress', () => {
    it('should reset progress counters', async () => {
      await warmer.warmOnLoad({
        fonts: ['Arial|16|normal|normal'],
        viewportPages: [],
        prefetchAdjacent: false,
      });

      warmer.resetProgress();

      const progress = warmer.getProgress();
      expect(progress.fontsCached).toBe(0);
      expect(progress.total).toBe(0);
    });
  });
});
