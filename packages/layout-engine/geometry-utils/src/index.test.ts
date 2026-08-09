import { describe, expect, it } from 'bun:test';
import {
  applyMatrix,
  calculateRotatedBounds,
  composeTransforms,
  emuToPx,
  normalizeRotation,
  pxToEmu,
} from './index.js';

describe('unit conversions', () => {
  it('converts EMUs to px', () => {
    expect(emuToPx(914400)).toBe(96);
  });

  it('converts px to EMUs', () => {
    expect(pxToEmu(96)).toBe(914400);
  });
});

describe('calculateRotatedBounds', () => {
  it('returns original size with zero rotation', () => {
    const bounds = calculateRotatedBounds({ width: 120, height: 80, rotation: 0 });
    expect(bounds.width).toBeCloseTo(120);
    expect(bounds.height).toBeCloseTo(80);
  });

  it('handles 90 degree rotation', () => {
    const bounds = calculateRotatedBounds({ width: 100, height: 40, rotation: 90 });
    expect(bounds.width).toBeCloseTo(40);
    expect(bounds.height).toBeCloseTo(100);
  });

  it('handles arbitrary rotation', () => {
    const bounds = calculateRotatedBounds({ width: 100, height: 50, rotation: 45 });
    expect(bounds.width).toBeCloseTo(106.07, 2);
    expect(bounds.height).toBeCloseTo(106.07, 2);
  });
});

describe('matrix helpers', () => {
  it('composes transforms in order', () => {
    const matrix = composeTransforms([{ translateX: 10 }, { scaleX: 2, scaleY: 2 }]);
    const point = applyMatrix({ x: 1, y: 0 }, matrix);
    expect(point.x).toBeCloseTo(22);
    expect(point.y).toBeCloseTo(0);
  });
});

describe('normalizeRotation', () => {
  it('wraps degrees into 0-360 range', () => {
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
  });
});
