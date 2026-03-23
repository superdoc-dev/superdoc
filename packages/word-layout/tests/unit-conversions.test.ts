import { describe, expect, it } from 'bun:test';

import {
  TWIPS_PER_PIXEL,
  halfPointsToPoints,
  pixelsToTwips,
  pointsToHalfPoints,
  pointsToTwips,
  twipsToPixels,
  twipsToPoints,
} from '../src/unit-conversions.js';

describe('unit conversions', () => {
  it('converts between pixels and twips symmetrically', () => {
    const px = 24;
    const twips = pixelsToTwips(px);

    expect(twips).toBe(px * TWIPS_PER_PIXEL);
    expect(twipsToPixels(twips)).toBe(px);
  });

  it('converts between points and twips', () => {
    const points = 12;
    const twips = pointsToTwips(points);

    expect(twips).toBe(240);
    expect(twipsToPoints(twips)).toBe(points);
  });

  it('handles half-point conversions', () => {
    expect(halfPointsToPoints(6)).toBe(3);
    expect(pointsToHalfPoints(3)).toBe(6);
  });
});

describe('unit conversions edge cases', () => {
  describe('pixelsToTwips', () => {
    it('handles null by returning 0', () => {
      expect(pixelsToTwips(null)).toBe(0);
    });

    it('handles undefined by returning 0', () => {
      expect(pixelsToTwips(undefined)).toBe(0);
    });

    it('handles NaN by returning 0', () => {
      expect(pixelsToTwips(NaN)).toBe(0);
    });

    it('handles Infinity by returning 0', () => {
      expect(pixelsToTwips(Infinity)).toBe(0);
    });

    it('handles -Infinity by returning 0', () => {
      expect(pixelsToTwips(-Infinity)).toBe(0);
    });

    it('handles negative numbers correctly', () => {
      const px = -24;
      const twips = pixelsToTwips(px);
      expect(twips).toBe(px * TWIPS_PER_PIXEL);
    });

    it('handles zero correctly', () => {
      expect(pixelsToTwips(0)).toBe(0);
    });

    it('handles very large numbers', () => {
      const px = 1000000;
      const twips = pixelsToTwips(px);
      expect(twips).toBe(px * TWIPS_PER_PIXEL);
    });
  });

  describe('twipsToPixels', () => {
    it('handles null by returning 0', () => {
      expect(twipsToPixels(null)).toBe(0);
    });

    it('handles undefined by returning 0', () => {
      expect(twipsToPixels(undefined)).toBe(0);
    });

    it('handles NaN by returning 0', () => {
      expect(twipsToPixels(NaN)).toBe(0);
    });

    it('handles Infinity by returning 0', () => {
      expect(twipsToPixels(Infinity)).toBe(0);
    });

    it('handles -Infinity by returning 0', () => {
      expect(twipsToPixels(-Infinity)).toBe(0);
    });

    it('handles negative numbers correctly', () => {
      const twips = -360;
      const px = twipsToPixels(twips);
      expect(px).toBe(twips / TWIPS_PER_PIXEL);
    });

    it('handles zero correctly', () => {
      expect(twipsToPixels(0)).toBe(0);
    });
  });

  describe('pointsToTwips', () => {
    it('handles null by returning 0', () => {
      expect(pointsToTwips(null)).toBe(0);
    });

    it('handles undefined by returning 0', () => {
      expect(pointsToTwips(undefined)).toBe(0);
    });

    it('handles NaN by returning 0', () => {
      expect(pointsToTwips(NaN)).toBe(0);
    });

    it('handles Infinity by returning 0', () => {
      expect(pointsToTwips(Infinity)).toBe(0);
    });

    it('handles negative numbers correctly', () => {
      const points = -12;
      const twips = pointsToTwips(points);
      expect(twips).toBe(-240);
    });
  });

  describe('twipsToPoints', () => {
    it('handles null by returning 0', () => {
      expect(twipsToPoints(null)).toBe(0);
    });

    it('handles undefined by returning 0', () => {
      expect(twipsToPoints(undefined)).toBe(0);
    });

    it('handles NaN by returning 0', () => {
      expect(twipsToPoints(NaN)).toBe(0);
    });

    it('handles Infinity by returning 0', () => {
      expect(twipsToPoints(Infinity)).toBe(0);
    });

    it('handles negative numbers correctly', () => {
      const twips = -240;
      const points = twipsToPoints(twips);
      expect(points).toBe(-12);
    });
  });

  describe('halfPointsToPoints', () => {
    it('handles null by returning 0', () => {
      expect(halfPointsToPoints(null)).toBe(0);
    });

    it('handles undefined by returning 0', () => {
      expect(halfPointsToPoints(undefined)).toBe(0);
    });

    it('handles NaN by returning 0', () => {
      expect(halfPointsToPoints(NaN)).toBe(0);
    });

    it('handles Infinity by returning 0', () => {
      expect(halfPointsToPoints(Infinity)).toBe(0);
    });

    it('handles negative numbers correctly', () => {
      expect(halfPointsToPoints(-6)).toBe(-3);
    });

    it('handles zero correctly', () => {
      expect(halfPointsToPoints(0)).toBe(0);
    });

    it('handles odd numbers correctly', () => {
      expect(halfPointsToPoints(5)).toBe(2.5);
    });
  });

  describe('pointsToHalfPoints', () => {
    it('handles null by returning 0', () => {
      expect(pointsToHalfPoints(null)).toBe(0);
    });

    it('handles undefined by returning 0', () => {
      expect(pointsToHalfPoints(undefined)).toBe(0);
    });

    it('handles NaN by returning 0', () => {
      expect(pointsToHalfPoints(NaN)).toBe(0);
    });

    it('handles Infinity by returning 0', () => {
      expect(pointsToHalfPoints(Infinity)).toBe(0);
    });

    it('handles negative numbers correctly', () => {
      expect(pointsToHalfPoints(-3)).toBe(-6);
    });

    it('handles zero correctly', () => {
      expect(pointsToHalfPoints(0)).toBe(0);
    });

    it('handles fractional numbers correctly', () => {
      expect(pointsToHalfPoints(2.5)).toBe(5);
    });
  });
});
