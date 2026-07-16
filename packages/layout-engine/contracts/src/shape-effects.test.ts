import { describe, expect, it } from 'vitest';
import { getOuterShadowPaintExtent, getOuterShadowStdDeviation, resolveOuterShadowOffset } from './shape-effects.js';

describe('shape effect geometry helpers', () => {
  const shadow = {
    type: 'outerShadow' as const,
    blurRadius: 6.6667,
    distance: 6.6667,
    direction: 45,
    color: '#a6a6a6',
    opacity: 0.4,
  };

  it('resolves outer shadow offset from direction and distance', () => {
    const offset = resolveOuterShadowOffset(shadow);

    expect(offset.dx).toBeCloseTo(4.714, 3);
    expect(offset.dy).toBeCloseTo(4.714, 3);
  });

  it('uses half the blur radius as the SVG standard deviation', () => {
    expect(getOuterShadowStdDeviation(shadow)).toBeCloseTo(3.333, 3);
  });

  it('resolves the paint extent used by import and paint paths', () => {
    const extent = getOuterShadowPaintExtent(shadow);

    expect(extent.left).toBeCloseTo(5.286, 3);
    expect(extent.top).toBeCloseTo(5.286, 3);
    expect(extent.right).toBeCloseTo(14.714, 3);
    expect(extent.bottom).toBeCloseTo(14.714, 3);
  });
});
