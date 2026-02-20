import { describe, it, expect } from 'vitest';
import { sanitizeIndent } from './index.js';

/**
 * Unit tests for sanitizeIndent function.
 *
 * The sanitizeIndent function validates and sanitizes paragraph indent values,
 * preserving negative values (which represent text extending into page margins
 * per OOXML specification) while filtering out invalid values like NaN, Infinity,
 * and undefined.
 */
describe('sanitizeIndent', () => {
  describe('valid values', () => {
    it('preserves negative values', () => {
      expect(sanitizeIndent(-48)).toBe(-48);
      expect(sanitizeIndent(-100)).toBe(-100);
      expect(sanitizeIndent(-1)).toBe(-1);
    });

    it('preserves positive values', () => {
      expect(sanitizeIndent(100)).toBe(100);
      expect(sanitizeIndent(48)).toBe(48);
      expect(sanitizeIndent(1)).toBe(1);
    });

    it('preserves zero as a valid value', () => {
      expect(sanitizeIndent(0)).toBe(0);
    });

    it('preserves decimal values', () => {
      expect(sanitizeIndent(12.5)).toBe(12.5);
      expect(sanitizeIndent(-12.5)).toBe(-12.5);
      expect(sanitizeIndent(0.1)).toBe(0.1);
    });
  });

  describe('invalid values', () => {
    it('returns 0 for undefined', () => {
      expect(sanitizeIndent(undefined)).toBe(0);
    });

    it('returns 0 for NaN', () => {
      expect(sanitizeIndent(NaN)).toBe(0);
    });

    it('returns 0 for positive Infinity', () => {
      expect(sanitizeIndent(Infinity)).toBe(0);
    });

    it('returns 0 for negative Infinity', () => {
      expect(sanitizeIndent(-Infinity)).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles very large negative values', () => {
      const largeNegative = -999999;
      expect(sanitizeIndent(largeNegative)).toBe(largeNegative);
    });

    it('handles very large positive values', () => {
      const largePositive = 999999;
      expect(sanitizeIndent(largePositive)).toBe(largePositive);
    });

    it('handles values close to zero', () => {
      expect(sanitizeIndent(0.0001)).toBe(0.0001);
      expect(sanitizeIndent(-0.0001)).toBe(-0.0001);
    });

    it('handles Number.MIN_VALUE', () => {
      expect(sanitizeIndent(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
    });

    it('handles Number.MAX_VALUE', () => {
      expect(sanitizeIndent(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
    });

    it('handles Number.EPSILON', () => {
      expect(sanitizeIndent(Number.EPSILON)).toBe(Number.EPSILON);
    });
  });

  describe('type safety', () => {
    it('returns 0 when called with null cast to undefined', () => {
      expect(sanitizeIndent(null as unknown as undefined)).toBe(0);
    });

    it('returns 0 when value is string cast to number', () => {
      expect(sanitizeIndent('100' as unknown as number)).toBe(0);
    });

    it('returns 0 when value is object cast to number', () => {
      expect(sanitizeIndent({} as unknown as number)).toBe(0);
    });
  });

  describe('comparison with sanitizePositive behavior', () => {
    it('differs from sanitizePositive for negative values', () => {
      // sanitizeIndent preserves negatives, sanitizePositive would clamp to 0
      const negativeValue = -48;
      expect(sanitizeIndent(negativeValue)).toBe(negativeValue);
      // Note: We don't test sanitizePositive directly as it's not exported,
      // but this documents the intentional difference in behavior
    });

    it('matches sanitizePositive for positive values', () => {
      // Both should preserve positive values
      const positiveValue = 48;
      expect(sanitizeIndent(positiveValue)).toBe(positiveValue);
    });

    it('matches sanitizePositive for invalid values', () => {
      // Both should return 0 for undefined
      expect(sanitizeIndent(undefined)).toBe(0);
      expect(sanitizeIndent(NaN)).toBe(0);
      expect(sanitizeIndent(Infinity)).toBe(0);
    });
  });
});
