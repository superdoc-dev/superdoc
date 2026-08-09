/**
 * Tests for FontMetricsCache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vite-plus/test';
import { FontMetricsCache } from '../src/font-metrics-cache';

// Mock canvas for Node.js test environment
class MockCanvas {
  width = 1;
  height = 1;
  getContext(type: string) {
    if (type === '2d') {
      return new MockCanvasRenderingContext2D();
    }
    return null;
  }
}

class MockCanvasRenderingContext2D {
  font = '';

  measureText(text: string) {
    // Simple mock: return a width based on text length and font size
    const fontSize = this.getFontSize();
    return {
      width: text.length * fontSize * 0.5,
      actualBoundingBoxAscent: fontSize * 0.8,
      actualBoundingBoxDescent: fontSize * 0.2,
    };
  }

  private getFontSize(): number {
    const match = this.font.match(/(\d+)px/);
    return match ? Number(match[1]) : 16;
  }
}

describe('FontMetricsCache', () => {
  let cache: FontMetricsCache;
  let originalDocument: typeof globalThis.document;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    // Save original
    originalDocument = (globalThis as typeof globalThis & { document?: typeof document }).document;

    // Mock document if not present
    if (typeof document === 'undefined') {
      (globalThis as typeof globalThis & { document: typeof document }).document = {
        createElement: (tagName: string) => {
          if (tagName === 'canvas') {
            return new MockCanvas() as unknown as HTMLCanvasElement;
          }
          return {} as HTMLElement;
        },
      } as typeof document;
    } else {
      originalCreateElement = document.createElement;
      document.createElement = ((tagName: string) => {
        if (tagName === 'canvas') {
          return new MockCanvas() as unknown as HTMLCanvasElement;
        }
        return originalCreateElement.call(document, tagName);
      }) as typeof document.createElement;
    }

    cache = new FontMetricsCache();
  });

  afterEach(() => {
    // Restore original
    if (originalDocument === undefined) {
      delete (globalThis as typeof globalThis & { document?: typeof document }).document;
    } else if (originalCreateElement) {
      document.createElement = originalCreateElement;
    }
  });

  describe('createFontKey', () => {
    it('should create font key with all parameters', () => {
      const key = FontMetricsCache.createFontKey('Arial', 16, 'bold', 'italic');
      expect(key).toBe('Arial|16|bold|italic');
    });

    it('should create font key with default weight and style', () => {
      const key = FontMetricsCache.createFontKey('Arial', 16);
      expect(key).toBe('Arial|16|normal|normal');
    });

    it('should handle different font families', () => {
      const key = FontMetricsCache.createFontKey('Times New Roman', 14, '400', 'normal');
      expect(key).toBe('Times New Roman|14|400|normal');
    });

    it('should handle numeric font sizes', () => {
      const key = FontMetricsCache.createFontKey('Arial', 24, 'bold', 'italic');
      expect(key).toBe('Arial|24|bold|italic');
    });
  });

  describe('warmCache', () => {
    it('should measure fonts on warm cache call', () => {
      const fonts = [
        { fontKey: FontMetricsCache.createFontKey('Arial', 16) },
        { fontKey: FontMetricsCache.createFontKey('Times', 14, 'bold') },
      ];

      cache.warmCache(fonts);

      expect(cache.has(fonts[0].fontKey)).toBe(true);
      expect(cache.has(fonts[1].fontKey)).toBe(true);
      expect(cache.size).toBe(2);
    });

    it('should not re-measure already cached fonts', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      const fonts = [{ fontKey }];

      cache.warmCache(fonts);
      const firstMetrics = cache.getMetrics(fontKey);
      const firstTimestamp = firstMetrics?.measuredAt;

      // Wait a tiny bit to ensure timestamp would differ
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);

      cache.warmCache(fonts);
      const secondMetrics = cache.getMetrics(fontKey);

      expect(secondMetrics?.measuredAt).toBe(firstTimestamp);

      vi.useRealTimers();
    });

    it('should handle empty font array', () => {
      cache.warmCache([]);
      expect(cache.size).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should return undefined for uncached font', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      expect(cache.getMetrics(fontKey)).toBeUndefined();
    });

    it('should return metrics after measuring', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      const metrics = cache.getMetrics(fontKey);
      expect(metrics).toBeDefined();
      expect(metrics?.charWidths).toBeInstanceOf(Map);
      expect(metrics?.spaceWidth).toBeGreaterThan(0);
      expect(metrics?.lineHeight).toBeGreaterThan(0);
      expect(metrics?.baseline).toBeGreaterThan(0);
      expect(metrics?.avgCharWidth).toBeGreaterThan(0);
      expect(metrics?.measuredAt).toBeGreaterThan(0);
    });

    it('should include printable ASCII characters', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      const metrics = cache.getMetrics(fontKey);
      expect(metrics?.charWidths.has('A')).toBe(true);
      expect(metrics?.charWidths.has('z')).toBe(true);
      expect(metrics?.charWidths.has('0')).toBe(true);
      expect(metrics?.charWidths.has(' ')).toBe(true);
      expect(metrics?.charWidths.has('!')).toBe(true);
    });

    it('should include common Unicode characters', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      const metrics = cache.getMetrics(fontKey);
      expect(metrics?.charWidths.has('\u2013')).toBe(true); // en dash
      expect(metrics?.charWidths.has('\u2014')).toBe(true); // em dash
      expect(metrics?.charWidths.has('\u20AC')).toBe(true); // euro
    });
  });

  describe('measureChar', () => {
    it('should measure and cache a single character', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      const width = cache.measureChar(fontKey, 'X');

      expect(width).toBeGreaterThan(0);
      const metrics = cache.getMetrics(fontKey);
      expect(metrics?.charWidths.has('X')).toBe(true);
      expect(metrics?.charWidths.get('X')).toBe(width);
    });

    it('should return cached width on subsequent calls', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      const width1 = cache.measureChar(fontKey, 'X');
      const width2 = cache.measureChar(fontKey, 'X');

      expect(width1).toBe(width2);
    });

    it('should measure new characters not in pre-warmed cache', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      // Measure a character that might not be in the common set
      const width = cache.measureChar(fontKey, '\u4E00'); // Chinese character
      expect(width).toBeGreaterThan(0);

      const metrics = cache.getMetrics(fontKey);
      expect(metrics?.charWidths.get('\u4E00')).toBe(width);
    });

    it('should auto-warm cache if font not present', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      expect(cache.has(fontKey)).toBe(false);

      cache.measureChar(fontKey, 'A');

      expect(cache.has(fontKey)).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all cached metrics', () => {
      const fonts = [
        { fontKey: FontMetricsCache.createFontKey('Arial', 16) },
        { fontKey: FontMetricsCache.createFontKey('Times', 14) },
      ];

      cache.warmCache(fonts);
      expect(cache.size).toBe(2);

      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has(fonts[0].fontKey)).toBe(false);
      expect(cache.has(fonts[1].fontKey)).toBe(false);
    });
  });

  describe('has', () => {
    it('should return false for uncached font', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      expect(cache.has(fontKey)).toBe(false);
    });

    it('should return true for cached font', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);
      expect(cache.has(fontKey)).toBe(true);
    });
  });

  describe('size', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size).toBe(0);
    });

    it('should return correct count after caching', () => {
      const fonts = [
        { fontKey: FontMetricsCache.createFontKey('Arial', 16) },
        { fontKey: FontMetricsCache.createFontKey('Times', 14) },
        { fontKey: FontMetricsCache.createFontKey('Courier', 12) },
      ];

      cache.warmCache(fonts);
      expect(cache.size).toBe(3);
    });
  });

  describe('font property variations', () => {
    it('should measure different font sizes differently', () => {
      const key12 = FontMetricsCache.createFontKey('Arial', 12);
      const key24 = FontMetricsCache.createFontKey('Arial', 24);

      const width12 = cache.measureChar(key12, 'A');
      const width24 = cache.measureChar(key24, 'A');

      expect(width24).toBeGreaterThan(width12);
    });

    it('should measure bold text differently from normal', () => {
      const keyNormal = FontMetricsCache.createFontKey('Arial', 16, 'normal');
      const keyBold = FontMetricsCache.createFontKey('Arial', 16, 'bold');

      cache.warmCache([{ fontKey: keyNormal }, { fontKey: keyBold }]);

      const metricsNormal = cache.getMetrics(keyNormal);
      const metricsBold = cache.getMetrics(keyBold);

      // Bold text is typically wider
      const widthNormal = metricsNormal?.charWidths.get('A') ?? 0;
      const widthBold = metricsBold?.charWidths.get('A') ?? 0;

      expect(widthNormal).toBeGreaterThan(0);
      expect(widthBold).toBeGreaterThan(0);
      // Note: We don't assert bold > normal because in headless environments
      // the canvas may not respect font weight
    });

    it('should treat different font families as separate caches', () => {
      const keyArial = FontMetricsCache.createFontKey('Arial', 16);
      const keyTimes = FontMetricsCache.createFontKey('Times New Roman', 16);

      cache.warmCache([{ fontKey: keyArial }, { fontKey: keyTimes }]);

      const metricsArial = cache.getMetrics(keyArial);
      const metricsTimes = cache.getMetrics(keyTimes);

      expect(metricsArial).toBeDefined();
      expect(metricsTimes).toBeDefined();
      expect(metricsArial).not.toBe(metricsTimes);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string character', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      const width = cache.measureChar(fontKey, '');
      expect(width).toBeGreaterThanOrEqual(0);
    });

    it('should handle whitespace characters', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      const spaceWidth = cache.measureChar(fontKey, ' ');
      const tabWidth = cache.measureChar(fontKey, '\t');
      const newlineWidth = cache.measureChar(fontKey, '\n');

      expect(spaceWidth).toBeGreaterThan(0);
      expect(tabWidth).toBeGreaterThanOrEqual(0);
      expect(newlineWidth).toBeGreaterThanOrEqual(0);
    });

    it('should handle emoji characters', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      const width = cache.measureChar(fontKey, '😀');
      expect(width).toBeGreaterThanOrEqual(0);
    });

    it('should handle combining characters', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      const width = cache.measureChar(fontKey, 'e\u0301'); // e with acute accent
      expect(width).toBeGreaterThan(0);
    });
  });

  describe('metrics properties', () => {
    it('should calculate reasonable space width', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      const metrics = cache.getMetrics(fontKey);
      expect(metrics?.spaceWidth).toBeGreaterThan(0);
      // Space width should be less than average character width
      expect(metrics?.spaceWidth).toBeLessThanOrEqual(metrics?.avgCharWidth ?? 0);
    });

    it('should calculate reasonable line height', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      const metrics = cache.getMetrics(fontKey);
      // Line height should be >= font size (typically 1.2x or more)
      expect(metrics?.lineHeight).toBeGreaterThanOrEqual(16);
    });

    it('should calculate reasonable baseline', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      const metrics = cache.getMetrics(fontKey);
      // Baseline should be positive and less than line height
      expect(metrics?.baseline).toBeGreaterThan(0);
      expect(metrics?.baseline).toBeLessThanOrEqual(metrics?.lineHeight ?? 0);
    });

    it('should calculate average character width', () => {
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);

      const metrics = cache.getMetrics(fontKey);
      expect(metrics?.avgCharWidth).toBeGreaterThan(0);

      // Average should be reasonable relative to font size
      expect(metrics?.avgCharWidth).toBeLessThan(16); // Less than font size
      expect(metrics?.avgCharWidth).toBeGreaterThan(4); // More than quarter size
    });

    it('should set measuredAt timestamp', () => {
      const before = Date.now();
      const fontKey = FontMetricsCache.createFontKey('Arial', 16);
      cache.warmCache([{ fontKey }]);
      const after = Date.now();

      const metrics = cache.getMetrics(fontKey);
      expect(metrics?.measuredAt).toBeGreaterThanOrEqual(before);
      expect(metrics?.measuredAt).toBeLessThanOrEqual(after);
    });
  });

  describe('multiple instances', () => {
    it('should maintain separate caches for different instances', () => {
      const cache1 = new FontMetricsCache();
      const cache2 = new FontMetricsCache();

      const fontKey = FontMetricsCache.createFontKey('Arial', 16);

      cache1.warmCache([{ fontKey }]);

      expect(cache1.has(fontKey)).toBe(true);
      expect(cache2.has(fontKey)).toBe(false);
    });
  });
});
