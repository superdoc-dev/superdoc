import { describe, expect, it } from 'bun:test';
import { computeWrapExclusion, scaleWrapPolygon } from '../image-wrap.js';

describe('engines-image-wrap scaleWrapPolygon', () => {
  it('scales OOXML polygon to image rect', () => {
    const polygon = [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 0],
    ];
    const scaled = scaleWrapPolygon(polygon, { x: 10, y: 20, width: 200, height: 100 });
    expect(scaled[0]).toEqual([10, 20]);
    expect(scaled[2]).toEqual([210, 120]);
  });
});

describe('engines-image-wrap computeWrapExclusion', () => {
  it('returns rectangular exclusion for square wrap', () => {
    const exclusion = computeWrapExclusion(
      {
        rect: { x: 20, y: 20, width: 50, height: 50 },
        wrap: { type: 'Square', distLeft: 5, distRight: 5 },
      },
      30,
      12,
    );
    expect(exclusion).toEqual({ left: 15, right: 75 });
  });

  it('returns null when no overlap', () => {
    const exclusion = computeWrapExclusion(
      {
        rect: { x: 20, y: 20, width: 50, height: 50 },
        wrap: { type: 'Square' },
      },
      100,
      12,
    );
    expect(exclusion).toBeNull();
  });
});
