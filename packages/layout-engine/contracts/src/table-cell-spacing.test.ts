import { describe, expect, it } from 'vitest';
import { effectiveTableCellSpacing } from './table-cell-spacing.js';

describe('effectiveTableCellSpacing', () => {
  it('returns 0 when spacing is undefined', () => {
    expect(effectiveTableCellSpacing(undefined, false, 0)).toBe(0);
    expect(effectiveTableCellSpacing(undefined, true, 10)).toBe(0);
  });

  it('returns 0 when spacing is <= 0', () => {
    expect(effectiveTableCellSpacing(0, false, 0)).toBe(0);
    expect(effectiveTableCellSpacing(-5, true, 0)).toBe(0);
  });

  it('returns full spacing when not at boundary', () => {
    expect(effectiveTableCellSpacing(20, false, 10)).toBe(20);
    expect(effectiveTableCellSpacing(20, false, 0)).toBe(20);
  });

  it('returns excess over padding when at boundary', () => {
    expect(effectiveTableCellSpacing(20, true, 10)).toBe(10);
    expect(effectiveTableCellSpacing(20, true, 0)).toBe(20);
    expect(effectiveTableCellSpacing(10, true, 10)).toBe(0);
    expect(effectiveTableCellSpacing(5, true, 10)).toBe(0);
  });
});
