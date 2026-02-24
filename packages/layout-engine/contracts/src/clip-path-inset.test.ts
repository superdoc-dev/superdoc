import { describe, expect, it } from 'vitest';
import { parseInsetClipPathForScale, formatInsetClipPathTransform } from './clip-path-inset.js';

describe('parseInsetClipPathForScale', () => {
  it('returns scale and translate for valid inset(top right bottom left)', () => {
    const result = parseInsetClipPathForScale('inset(10% 20% 30% 40%)');
    expect(result).not.toBeNull();
    // visibleW = 100 - 40 - 20 = 40, visibleH = 100 - 10 - 30 = 60
    // scaleX = 100/40 = 2.5, scaleY = 100/60 = 5/3
    // translateX = -40*2.5 = -100, translateY = -10*(5/3) = -50/3
    expect(result!.scaleX).toBeCloseTo(2.5);
    expect(result!.scaleY).toBeCloseTo(100 / 60);
    expect(result!.translateX).toBeCloseTo(-100);
    expect(result!.translateY).toBeCloseTo(-50 / 3);
  });

  it('returns scale 1 and translate 0 when no inset (full image visible)', () => {
    const result = parseInsetClipPathForScale('inset(0% 0% 0% 0%)');
    expect(result).not.toBeNull();
    expect(result!.scaleX).toBe(1);
    expect(result!.scaleY).toBe(1);
    expect(result!.translateX).toBeCloseTo(0, 10);
    expect(result!.translateY).toBeCloseTo(0, 10);
  });

  it('trims whitespace around clipPath', () => {
    const result = parseInsetClipPathForScale('  inset(5% 10% 15% 20%)  ');
    expect(result).not.toBeNull();
    expect(result!.scaleX).toBeCloseTo(100 / (100 - 20 - 10));
    expect(result!.scaleY).toBeCloseTo(100 / (100 - 5 - 15));
  });

  it('returns null for non-inset clipPath', () => {
    expect(parseInsetClipPathForScale('circle(50%)')).toBeNull();
    expect(parseInsetClipPathForScale('polygon(0 0, 100% 0, 100% 100%)')).toBeNull();
    expect(parseInsetClipPathForScale('')).toBeNull();
  });

  it('returns null for malformed inset', () => {
    expect(parseInsetClipPathForScale('inset(10 20 30 40)')).toBeNull(); // no %
    expect(parseInsetClipPathForScale('inset(10% 20% 30%)')).toBeNull(); // only 3 values
    expect(parseInsetClipPathForScale('inset()')).toBeNull();
    expect(parseInsetClipPathForScale('inset(1..2% 0% 0% 0%)')).toBeNull(); // malformed number token
  });

  it('returns null when visible area has zero or negative size', () => {
    // left + right >= 100 => visibleW <= 0
    expect(parseInsetClipPathForScale('inset(0% 50% 0% 50%)')).toBeNull();
    // top + bottom >= 100 => visibleH <= 0
    expect(parseInsetClipPathForScale('inset(50% 0% 50% 0%)')).toBeNull();
  });

  it('handles decimal percentages', () => {
    const result = parseInsetClipPathForScale('inset(12.5% 25.5% 12.5% 24.5%)');
    expect(result).not.toBeNull();
    const visibleW = 100 - 24.5 - 25.5;
    const visibleH = 100 - 12.5 - 12.5;
    expect(result!.scaleX).toBeCloseTo(100 / visibleW);
    expect(result!.scaleY).toBeCloseTo(100 / visibleH);
  });
});

describe('formatInsetClipPathTransform', () => {
  it('returns CSS transform string for valid inset', () => {
    const result = formatInsetClipPathTransform('inset(10% 20% 30% 40%)');
    expect(result).toBeDefined();
    expect(result).toContain('transform-origin: 0 0');
    expect(result).toContain('transform: translate(');
    expect(result).toContain('%) scale(');
    expect(result).toMatch(/translate\([-\d.]+%,\s*[-\d.]+%\)/);
    expect(result).toMatch(/scale\([-\d.]+,\s*[-\d.]+\)/);
  });

  it('returns undefined for invalid clipPath', () => {
    expect(formatInsetClipPathTransform('circle(50%)')).toBeUndefined();
    expect(formatInsetClipPathTransform('')).toBeUndefined();
    expect(formatInsetClipPathTransform('inset(1..2% 0% 0% 0%)')).toBeUndefined();
  });

  it('output can be applied as inline style', () => {
    const result = formatInsetClipPathTransform('inset(0% 0% 0% 0%)');
    expect(result).toBe('transform-origin: 0 0; transform: translate(0%, 0%) scale(1, 1);');
  });
});
