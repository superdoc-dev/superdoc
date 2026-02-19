import { describe, it, expect } from 'vitest';
import { normalizeMargin } from '../src/incrementalLayout.js';

/**
 * Unit tests for normalizeMargin function.
 *
 * The normalizeMargin function ensures margin values are valid finite numbers,
 * using a fallback value when the input is undefined or non-finite. This prevents
 * NaN values in content size calculations when margin properties are partially defined.
 *
 * Unlike sanitizeIndent, normalizeMargin does NOT reject negative values - it accepts
 * any finite number including negatives, as negative margins are valid in some contexts.
 */
describe('normalizeMargin', () => {
  describe('valid values', () => {
    it('returns value when finite positive number', () => {
      expect(normalizeMargin(96, 72)).toBe(96);
      expect(normalizeMargin(100, 72)).toBe(100);
      expect(normalizeMargin(1, 72)).toBe(1);
    });

    it('preserves zero as valid value', () => {
      expect(normalizeMargin(0, 72)).toBe(0);
    });

    it('preserves negative values as they are finite', () => {
      expect(normalizeMargin(-10, 72)).toBe(-10);
      expect(normalizeMargin(-48, 72)).toBe(-48);
      expect(normalizeMargin(-100, 72)).toBe(-100);
    });

    it('preserves decimal values', () => {
      expect(normalizeMargin(72.5, 72)).toBe(72.5);
      expect(normalizeMargin(0.1, 72)).toBe(0.1);
      expect(normalizeMargin(-12.5, 72)).toBe(-12.5);
    });
  });

  describe('invalid values - returns fallback', () => {
    it('returns fallback for undefined', () => {
      expect(normalizeMargin(undefined, 72)).toBe(72);
      expect(normalizeMargin(undefined, 100)).toBe(100);
      expect(normalizeMargin(undefined, 0)).toBe(0);
    });

    it('returns fallback for NaN', () => {
      expect(normalizeMargin(NaN, 72)).toBe(72);
      expect(normalizeMargin(NaN, 50)).toBe(50);
    });

    it('returns fallback for positive Infinity', () => {
      expect(normalizeMargin(Infinity, 72)).toBe(72);
      expect(normalizeMargin(Infinity, 100)).toBe(100);
    });

    it('returns fallback for negative Infinity', () => {
      expect(normalizeMargin(-Infinity, 72)).toBe(72);
      expect(normalizeMargin(-Infinity, 50)).toBe(50);
    });
  });

  describe('fallback values', () => {
    it('handles different fallback values correctly', () => {
      expect(normalizeMargin(undefined, 0)).toBe(0);
      expect(normalizeMargin(undefined, 36)).toBe(36);
      expect(normalizeMargin(undefined, 144)).toBe(144);
    });

    it('handles negative fallback values', () => {
      expect(normalizeMargin(undefined, -10)).toBe(-10);
      expect(normalizeMargin(NaN, -20)).toBe(-20);
    });

    it('handles decimal fallback values', () => {
      expect(normalizeMargin(undefined, 72.5)).toBe(72.5);
      expect(normalizeMargin(NaN, 36.25)).toBe(36.25);
    });
  });

  describe('edge cases', () => {
    it('handles very large valid values', () => {
      const largeValue = 999999;
      expect(normalizeMargin(largeValue, 72)).toBe(largeValue);
    });

    it('handles very large negative valid values', () => {
      const largeNegative = -999999;
      expect(normalizeMargin(largeNegative, 72)).toBe(largeNegative);
    });

    it('handles values close to zero', () => {
      expect(normalizeMargin(0.0001, 72)).toBe(0.0001);
      expect(normalizeMargin(-0.0001, 72)).toBe(-0.0001);
    });

    it('handles Number.MIN_VALUE', () => {
      expect(normalizeMargin(Number.MIN_VALUE, 72)).toBe(Number.MIN_VALUE);
    });

    it('handles Number.MAX_VALUE', () => {
      expect(normalizeMargin(Number.MAX_VALUE, 72)).toBe(Number.MAX_VALUE);
    });

    it('handles Number.EPSILON', () => {
      expect(normalizeMargin(Number.EPSILON, 72)).toBe(Number.EPSILON);
    });

    it('handles zero fallback', () => {
      expect(normalizeMargin(undefined, 0)).toBe(0);
      expect(normalizeMargin(50, 0)).toBe(50);
    });
  });

  describe('type safety', () => {
    it('returns fallback when value is null cast to undefined', () => {
      expect(normalizeMargin(null as unknown as undefined, 72)).toBe(72);
    });

    it('returns fallback when value is string cast to number', () => {
      expect(normalizeMargin('100' as unknown as number, 72)).toBe(72);
    });

    it('returns fallback when value is object cast to number', () => {
      expect(normalizeMargin({} as unknown as number, 72)).toBe(72);
    });

    it('returns fallback when value is array cast to number', () => {
      expect(normalizeMargin([100] as unknown as number, 72)).toBe(72);
    });
  });

  describe('real-world usage scenarios', () => {
    it('handles typical page margin values', () => {
      // Common margin values in points (1 inch = 72 points)
      expect(normalizeMargin(72, 72)).toBe(72); // 1 inch
      expect(normalizeMargin(36, 72)).toBe(36); // 0.5 inch
      expect(normalizeMargin(108, 72)).toBe(108); // 1.5 inches
    });

    it('handles partial margin object scenarios', () => {
      // When margins object has some undefined values
      const margins = { top: 72, right: undefined, bottom: 72, left: undefined };
      const DEFAULT_MARGIN = 72;

      expect(normalizeMargin(margins.top, DEFAULT_MARGIN)).toBe(72);
      expect(normalizeMargin(margins.right, DEFAULT_MARGIN)).toBe(72);
      expect(normalizeMargin(margins.bottom, DEFAULT_MARGIN)).toBe(72);
      expect(normalizeMargin(margins.left, DEFAULT_MARGIN)).toBe(72);
    });

    it('prevents NaN in content width calculation', () => {
      // This is the primary use case - preventing NaN when calculating content width
      const pageWidth = 612; // 8.5 inches in points
      const leftMargin = normalizeMargin(undefined, 72);
      const rightMargin = normalizeMargin(undefined, 72);
      const contentWidth = pageWidth - (leftMargin + rightMargin);

      expect(contentWidth).toBe(468); // Should be valid number, not NaN
      expect(Number.isFinite(contentWidth)).toBe(true);
    });

    it('handles asymmetric margins', () => {
      // Different margins on different sides
      expect(normalizeMargin(72, 72)).toBe(72); // top
      expect(normalizeMargin(96, 72)).toBe(96); // right
      expect(normalizeMargin(72, 72)).toBe(72); // bottom
      expect(normalizeMargin(144, 72)).toBe(144); // left (wider for binding)
    });
  });

  describe('comparison with sanitizeIndent', () => {
    it('both preserve negative finite values', () => {
      // Both functions accept negative values as they are finite
      expect(normalizeMargin(-10, 72)).toBe(-10);
      // sanitizeIndent would also return -10
    });

    it('both return safe value for undefined', () => {
      // normalizeMargin returns fallback
      expect(normalizeMargin(undefined, 72)).toBe(72);
      // sanitizeIndent would return 0
    });

    it('both reject Infinity', () => {
      // normalizeMargin returns fallback
      expect(normalizeMargin(Infinity, 72)).toBe(72);
      // sanitizeIndent would return 0
    });

    it('both preserve positive finite values', () => {
      expect(normalizeMargin(100, 72)).toBe(100);
      // sanitizeIndent would also return 100
    });
  });
});
