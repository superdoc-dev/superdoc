// @ts-check
import { describe, it, expect } from 'vitest';
import { cloneBorders, mapBorderSizes } from './border-utils.js';

describe('cloneBorders', () => {
  it('returns a shallow clone keyed by all sides when sides is omitted', () => {
    const source = {
      top: { val: 'single', size: 8 },
      bottom: { val: 'single', size: 8 },
    };
    const cloned = cloneBorders(source);
    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.top).not.toBe(source.top);
  });

  it('only includes sides listed in the filter', () => {
    const source = {
      top: { val: 'single', size: 4 },
      bottom: { val: 'single', size: 4 },
      left: { val: 'single', size: 4 },
    };
    const cloned = cloneBorders(source, ['top', 'bottom']);
    expect(Object.keys(cloned).sort()).toEqual(['bottom', 'top']);
  });

  it('skips missing sides without throwing', () => {
    const source = { top: { val: 'single', size: 8 } };
    const cloned = cloneBorders(source, ['top', 'bottom', 'left']);
    expect(cloned).toEqual({ top: { val: 'single', size: 8 } });
  });

  it('skips non-object values', () => {
    const source = { top: { val: 'single', size: 8 }, bottom: null, left: 'oops', right: undefined };
    const cloned = cloneBorders(source);
    expect(Object.keys(cloned)).toEqual(['top']);
  });

  it('returns an empty object for non-object input', () => {
    expect(cloneBorders(null)).toEqual({});
    expect(cloneBorders(undefined)).toEqual({});
    expect(cloneBorders('borders')).toEqual({});
    expect(cloneBorders(42)).toEqual({});
  });

  it('detaches nested border objects from the source (shallow only)', () => {
    const source = { top: { val: 'single', size: 8 } };
    const cloned = cloneBorders(source);
    cloned.top.size = 999;
    expect(source.top.size).toBe(8);
  });
});

describe('mapBorderSizes', () => {
  it('mutates each border size in place via the mapper', () => {
    const borders = { top: { val: 'single', size: 8 }, bottom: { val: 'single', size: 24 } };
    mapBorderSizes(borders, (s) => Number(s) / 6); // simulate eighth-points → px
    expect(borders.top.size).toBeCloseTo(1.333, 3);
    expect(borders.bottom.size).toBe(4);
  });

  it('skips non-finite mapper output', () => {
    const borders = { top: { val: 'single', size: 8 } };
    mapBorderSizes(borders, () => NaN);
    expect(borders.top.size).toBe(8);
  });

  it('skips when mapper returns a non-number', () => {
    const borders = { top: { val: 'single', size: 8 } };
    mapBorderSizes(borders, () => /** @type {*} */ ('huge'));
    expect(borders.top.size).toBe(8);
  });

  it('is a no-op when borders is missing or non-object', () => {
    expect(() => mapBorderSizes(null, (s) => Number(s))).not.toThrow();
    expect(() => mapBorderSizes(undefined, (s) => Number(s))).not.toThrow();
  });

  it('is a no-op when sizeMapper is not a function', () => {
    const borders = { top: { val: 'single', size: 8 } };
    mapBorderSizes(borders, /** @type {*} */ (null));
    expect(borders.top.size).toBe(8);
  });
});
