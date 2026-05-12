import { describe, expect, it } from 'vitest';
import { OOXML_PCT_DIVISOR, resolveTableWidthAttr } from '../tables.js';

describe('OOXML_PCT_DIVISOR', () => {
  it('equals 5000 (1/50th of a percent)', () => {
    expect(OOXML_PCT_DIVISOR).toBe(5000);
  });
});

describe('resolveTableWidthAttr', () => {
  it('reads the width field with its type', () => {
    expect(resolveTableWidthAttr({ width: 600, type: 'px' })).toEqual({ width: 600, type: 'px' });
  });

  it('reads the value field when width is not present', () => {
    expect(resolveTableWidthAttr({ value: 2500, type: 'pct' })).toEqual({ width: 2500, type: 'pct' });
  });

  it('prefers width over value when both are present', () => {
    expect(resolveTableWidthAttr({ width: 100, value: 200, type: 'px' })).toEqual({ width: 100, type: 'px' });
  });

  it('preserves type for dxa', () => {
    expect(resolveTableWidthAttr({ width: 1440, type: 'dxa' })).toEqual({ width: 1440, type: 'dxa' });
  });

  it('returns width with undefined type when type is omitted', () => {
    const result = resolveTableWidthAttr({ width: 300 });
    expect(result).toEqual({ width: 300, type: undefined });
  });

  it('rejects null', () => {
    expect(resolveTableWidthAttr(null)).toBeNull();
  });

  it('rejects undefined', () => {
    expect(resolveTableWidthAttr(undefined)).toBeNull();
  });

  it('rejects primitives', () => {
    expect(resolveTableWidthAttr(600)).toBeNull();
    expect(resolveTableWidthAttr('600')).toBeNull();
    expect(resolveTableWidthAttr(true)).toBeNull();
  });

  it('rejects objects with no width or value', () => {
    expect(resolveTableWidthAttr({ type: 'px' })).toBeNull();
    expect(resolveTableWidthAttr({})).toBeNull();
  });

  it('rejects non-numeric width', () => {
    expect(resolveTableWidthAttr({ width: '600' as unknown as number, type: 'px' })).toBeNull();
    expect(resolveTableWidthAttr({ value: null as unknown as number, type: 'pct' })).toBeNull();
  });

  it('rejects NaN', () => {
    expect(resolveTableWidthAttr({ width: NaN, type: 'pct' })).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(resolveTableWidthAttr({ width: Infinity, type: 'pct' })).toBeNull();
    expect(resolveTableWidthAttr({ width: -Infinity, type: 'pct' })).toBeNull();
  });

  it('rejects zero', () => {
    expect(resolveTableWidthAttr({ width: 0, type: 'pct' })).toBeNull();
    expect(resolveTableWidthAttr({ value: 0, type: 'pct' })).toBeNull();
  });

  it('rejects negative widths', () => {
    expect(resolveTableWidthAttr({ width: -100, type: 'px' })).toBeNull();
    expect(resolveTableWidthAttr({ value: -2500, type: 'pct' })).toBeNull();
  });
});
