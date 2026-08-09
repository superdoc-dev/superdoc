import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { getMeasuredTextWidth, setCacheSize, clearMeasurementCache } from './measurementCache.js';

describe('measurementCache', () => {
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    // Reset cache state before each test
    clearMeasurementCache();
    setCacheSize(5000);

    // Create a canvas context for measurements
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create 2d context');
    }
    ctx = context;
  });

  describe('getMeasuredTextWidth', () => {
    describe('cache hit/miss scenarios', () => {
      it('should cache measurements and return cached values on subsequent calls', () => {
        const text = 'Hello World';
        const font = '16px Arial';
        const letterSpacing = 0;

        // First call - cache miss
        const width1 = getMeasuredTextWidth(text, font, letterSpacing, ctx);
        expect(width1).toBeGreaterThan(0);

        // Second call - cache hit
        const width2 = getMeasuredTextWidth(text, font, letterSpacing, ctx);
        expect(width2).toBe(width1);
      });

      it('should cache different values for different text', () => {
        const font = '16px Arial';
        const letterSpacing = 0;

        const width1 = getMeasuredTextWidth('Hello', font, letterSpacing, ctx);
        const width2 = getMeasuredTextWidth('World', font, letterSpacing, ctx);

        expect(width1).toBeGreaterThan(0);
        expect(width2).toBeGreaterThan(0);
        expect(width1).not.toBe(width2);
      });

      it('should cache different values for different fonts', () => {
        const text = 'Hello';
        const letterSpacing = 0;

        const width1 = getMeasuredTextWidth(text, '16px Arial', letterSpacing, ctx);
        const width2 = getMeasuredTextWidth(text, 'bold 16px Arial', letterSpacing, ctx);

        expect(width1).toBeGreaterThan(0);
        expect(width2).toBeGreaterThan(0);
        expect(width2).toBeGreaterThan(width1); // Bold should be wider
      });

      it('should cache different values for different letter spacing', () => {
        const text = 'Hello';
        const font = '16px Arial';

        const width1 = getMeasuredTextWidth(text, font, 0, ctx);
        const width2 = getMeasuredTextWidth(text, font, 2, ctx);

        expect(width1).toBeGreaterThan(0);
        expect(width2).toBeGreaterThan(0);
        expect(width2).toBeGreaterThan(width1); // Letter spacing should increase width
      });

      it('scopes identical text/font keys to the measuring context', () => {
        const makeContext = (width: number): CanvasRenderingContext2D =>
          ({
            font: '',
            measureText: () => ({ width }),
          }) as unknown as CanvasRenderingContext2D;

        const first = getMeasuredTextWidth('same text', '16px Arial', 0, makeContext(10));
        const second = getMeasuredTextWidth('same text', '16px Arial', 0, makeContext(20));

        expect(first).toBe(10);
        expect(second).toBe(20);
      });

      it('should update LRU order on cache hit', () => {
        const font = '16px Arial';
        const letterSpacing = 0;

        // Fill cache with entries
        const text1 = 'First';
        const text2 = 'Second';

        getMeasuredTextWidth(text1, font, letterSpacing, ctx);
        getMeasuredTextWidth(text2, font, letterSpacing, ctx);

        // Access first entry again - should move to end of LRU
        const width1 = getMeasuredTextWidth(text1, font, letterSpacing, ctx);

        // Should still be cached
        expect(width1).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('should handle width of 0 as a valid cached value', () => {
        // Some text/font combinations might result in 0 width
        const text = '';
        const font = '16px Arial';
        const letterSpacing = 0;

        const width1 = getMeasuredTextWidth(text, font, letterSpacing, ctx);
        const width2 = getMeasuredTextWidth(text, font, letterSpacing, ctx);

        expect(width1).toBe(0);
        expect(width2).toBe(0); // Should be cached even though it's 0
      });

      it('should truncate excessively long text to 32000 characters', () => {
        const longText = 'a'.repeat(40000);
        const truncatedText = 'a'.repeat(32000);
        const font = '16px Arial';
        const letterSpacing = 0;

        const width1 = getMeasuredTextWidth(longText, font, letterSpacing, ctx);
        const width2 = getMeasuredTextWidth(truncatedText, font, letterSpacing, ctx);

        // Both should produce the same result since longText is truncated
        expect(width1).toBe(width2);
        expect(width1).toBeGreaterThan(0);
      });

      it('should handle invalid font strings gracefully', () => {
        const text = 'Hello';
        const invalidFont = 'not-a-valid-font-string';
        const letterSpacing = 0;

        // Should not throw, should return 0
        const width = getMeasuredTextWidth(text, invalidFont, letterSpacing, ctx);
        expect(width).toBeGreaterThanOrEqual(0);
      });

      it('should include letter spacing in width calculations', () => {
        const text = 'Hello'; // 5 chars = 4 gaps
        const font = '16px Arial';

        const widthNoSpacing = getMeasuredTextWidth(text, font, 0, ctx);
        const widthWithSpacing = getMeasuredTextWidth(text, font, 2, ctx);

        // Should add 4 gaps × 2px = 8px
        expect(widthWithSpacing).toBeCloseTo(widthNoSpacing + 8, 1);
      });

      it('should handle single character with letter spacing', () => {
        const text = 'A';
        const font = '16px Arial';

        const widthNoSpacing = getMeasuredTextWidth(text, font, 0, ctx);
        const widthWithSpacing = getMeasuredTextWidth(text, font, 5, ctx);

        // Single character has 0 gaps, so letter spacing should not affect width
        expect(widthWithSpacing).toBeCloseTo(widthNoSpacing, 1);
      });
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when cache size is exceeded', () => {
      // Set small cache size
      setCacheSize(3);

      const font = '16px Arial';
      const letterSpacing = 0;

      // Add 3 entries
      const width1 = getMeasuredTextWidth('Text1', font, letterSpacing, ctx);
      const width2 = getMeasuredTextWidth('Text2', font, letterSpacing, ctx);
      const width3 = getMeasuredTextWidth('Text3', font, letterSpacing, ctx);

      // Add 4th entry - should evict Text1
      getMeasuredTextWidth('Text4', font, letterSpacing, ctx);

      // Text2 and Text3 should still be cached (same width on re-access)
      expect(getMeasuredTextWidth('Text2', font, letterSpacing, ctx)).toBe(width2);
      expect(getMeasuredTextWidth('Text3', font, letterSpacing, ctx)).toBe(width3);

      // Text1 might have been evicted, but we can't definitively test this without
      // inspecting internal cache state. The important thing is that the cache
      // doesn't grow unbounded.
    });

    it('should handle cache size of 1', () => {
      setCacheSize(1);

      const font = '16px Arial';
      const letterSpacing = 0;

      getMeasuredTextWidth('First', font, letterSpacing, ctx);
      getMeasuredTextWidth('Second', font, letterSpacing, ctx);

      // Should not crash and should still measure correctly
      const width = getMeasuredTextWidth('Third', font, letterSpacing, ctx);
      expect(width).toBeGreaterThan(0);
    });

    it('should evict entries after setCacheSize reduces cache size', () => {
      const font = '16px Arial';
      const letterSpacing = 0;

      // Add 10 entries with large cache
      setCacheSize(10);
      for (let i = 0; i < 10; i++) {
        getMeasuredTextWidth(`Text${i}`, font, letterSpacing, ctx);
      }

      // Reduce cache size - should trigger eviction
      setCacheSize(5);

      // Cache should still function correctly
      const width = getMeasuredTextWidth('NewText', font, letterSpacing, ctx);
      expect(width).toBeGreaterThan(0);
    });
  });

  describe('setCacheSize', () => {
    it('should accept positive finite numbers', () => {
      expect(() => setCacheSize(1000)).not.toThrow();
      expect(() => setCacheSize(1)).not.toThrow();
      expect(() => setCacheSize(100000)).not.toThrow();
    });

    it('should reject zero', () => {
      // Set to a known good size first
      setCacheSize(100);

      // Try to set to 0
      setCacheSize(0);

      // Should still work (size wasn't changed)
      const width = getMeasuredTextWidth('Test', '16px Arial', 0, ctx);
      expect(width).toBeGreaterThan(0);
    });

    it('should reject negative numbers', () => {
      setCacheSize(100);
      setCacheSize(-1);
      setCacheSize(-1000);

      // Should still work
      const width = getMeasuredTextWidth('Test', '16px Arial', 0, ctx);
      expect(width).toBeGreaterThan(0);
    });

    it('should reject non-finite numbers', () => {
      setCacheSize(100);

      setCacheSize(Infinity);
      setCacheSize(-Infinity);
      setCacheSize(NaN);

      // Should still work
      const width = getMeasuredTextWidth('Test', '16px Arial', 0, ctx);
      expect(width).toBeGreaterThan(0);
    });
  });

  describe('clearMeasurementCache', () => {
    it('should clear all cached entries', () => {
      const text = 'Cached Text';
      const font = '16px Arial';
      const letterSpacing = 0;

      // Cache a measurement
      const width1 = getMeasuredTextWidth(text, font, letterSpacing, ctx);

      // Clear cache
      clearMeasurementCache();

      // Next call should recalculate (we can't directly test if it's recalculated,
      // but we can verify it still works)
      const width2 = getMeasuredTextWidth(text, font, letterSpacing, ctx);

      // Should produce the same result
      expect(width2).toBeCloseTo(width1, 5);
    });

    it('should allow cache to work normally after clearing', () => {
      clearMeasurementCache();

      const text = 'Test';
      const font = '16px Arial';
      const letterSpacing = 0;

      const width1 = getMeasuredTextWidth(text, font, letterSpacing, ctx);
      const width2 = getMeasuredTextWidth(text, font, letterSpacing, ctx);

      expect(width1).toBeGreaterThan(0);
      expect(width2).toBe(width1);
    });

    it('should clear cache completely even with many entries', () => {
      const font = '16px Arial';
      const letterSpacing = 0;

      // Add many entries
      for (let i = 0; i < 1000; i++) {
        getMeasuredTextWidth(`Text${i}`, font, letterSpacing, ctx);
      }

      // Clear should work quickly
      expect(() => clearMeasurementCache()).not.toThrow();

      // Cache should still work
      const width = getMeasuredTextWidth('New', font, letterSpacing, ctx);
      expect(width).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should return 0 when measurement throws an error', () => {
      // Create a mock context that throws
      const errorCtx = {
        get font(): string {
          return '';
        },
        set font(value: string) {
          throw new Error('Font setting failed');
        },
        measureText: () => {
          throw new Error('Measurement failed');
        },
      } as unknown as CanvasRenderingContext2D;

      const width = getMeasuredTextWidth('Test', '16px Arial', 0, errorCtx);
      expect(width).toBe(0);
    });

    it('should handle errors gracefully and continue working with valid context', () => {
      const errorCtx = {
        get font(): string {
          return '';
        },
        set font(value: string) {
          throw new Error('Font setting failed');
        },
        measureText: () => {
          throw new Error('Measurement failed');
        },
      } as unknown as CanvasRenderingContext2D;

      // Fail with error context
      const width1 = getMeasuredTextWidth('Test', '16px Arial', 0, errorCtx);
      expect(width1).toBe(0);

      // Should still work with valid context
      const width2 = getMeasuredTextWidth('Test', '16px Arial', 0, ctx);
      expect(width2).toBeGreaterThan(0);
    });
  });
});
