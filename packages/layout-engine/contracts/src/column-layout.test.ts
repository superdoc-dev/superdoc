import { describe, expect, it } from 'vitest';
import type { ColumnLayout } from './index.js';
import { cloneColumnLayout, normalizeColumnLayout, widthsEqual } from './column-layout.js';

describe('widthsEqual', () => {
  it('treats two missing width arrays as equal', () => {
    expect(widthsEqual()).toBe(true);
  });

  it('returns false when only one width array is present', () => {
    expect(widthsEqual([72], undefined)).toBe(false);
    expect(widthsEqual(undefined, [72])).toBe(false);
  });

  it('returns true for identical width arrays', () => {
    expect(widthsEqual([72, 144], [72, 144])).toBe(true);
  });

  it('returns false for arrays with different lengths', () => {
    expect(widthsEqual([72], [72, 144])).toBe(false);
  });

  it('returns false for arrays with different values', () => {
    expect(widthsEqual([72, 144], [72, 145])).toBe(false);
  });
});

describe('cloneColumnLayout', () => {
  it('returns a default single-column layout when input is missing', () => {
    expect(cloneColumnLayout()).toEqual({ count: 1, gap: 0 });
  });

  it('clones count, gap, widths, and equalWidth', () => {
    const original: ColumnLayout = {
      count: 2,
      gap: 18,
      widths: [72, 144],
      equalWidth: false,
    };

    expect(cloneColumnLayout(original)).toEqual(original);
  });

  it('creates a defensive copy of widths', () => {
    const original: ColumnLayout = {
      count: 2,
      gap: 18,
      widths: [72, 144],
      equalWidth: false,
    };

    const cloned = cloneColumnLayout(original);

    expect(cloned).not.toBe(original);
    expect(cloned.widths).not.toBe(original.widths);

    cloned.widths?.push(216);
    expect(original.widths).toEqual([72, 144]);
  });

  it('omits optional fields that were not provided', () => {
    expect(cloneColumnLayout({ count: 2, gap: 18 })).toEqual({
      count: 2,
      gap: 18,
    });
  });
});

describe('normalizeColumnLayout', () => {
  it('returns a default single column when input is missing', () => {
    expect(normalizeColumnLayout(undefined, 480)).toEqual({
      count: 1,
      gap: 0,
      widths: [480],
      width: 480,
    });
  });

  it('computes equal-width columns from count and gap', () => {
    expect(normalizeColumnLayout({ count: 2, gap: 24 }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [300, 300],
      width: 300,
    });
  });

  it('scales explicit widths to the available width', () => {
    expect(normalizeColumnLayout({ count: 2, gap: 24, widths: [100, 200], equalWidth: false }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [200, 400],
      equalWidth: false,
      width: 400,
    });
  });

  it('ignores widths when equalWidth is omitted and divides evenly (SD-2324: omitted = equal mode)', () => {
    // Omitted equalWidth is equal mode in Word; any widths present are not authoritative.
    expect(normalizeColumnLayout({ count: 2, gap: 24, widths: [100, 200] }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [300, 300],
      width: 300,
    });
  });

  it('ignores widths when equalWidth is true and divides evenly (SD-2324)', () => {
    expect(normalizeColumnLayout({ count: 2, gap: 24, widths: [100, 200], equalWidth: true }, 624)).toEqual({
      count: 2,
      gap: 24,
      widths: [300, 300],
      equalWidth: true,
      width: 300,
    });
  });

  it('clamps count to the explicit-widths length when w:num exceeds it (SD-2324 F8)', () => {
    // w:num="4" with only two explicit widths: the surplus columns have no width and must not
    // be synthesized as ~0px slivers (the F8 phantom-column bug). Clamp to the two real columns.
    expect(normalizeColumnLayout({ count: 4, gap: 48, widths: [192, 384], equalWidth: false }, 624)).toEqual({
      count: 2,
      gap: 48,
      widths: [192, 384],
      equalWidth: false,
      width: 384,
    });
  });

  it('falls back to a single column when there is no usable content width', () => {
    expect(normalizeColumnLayout({ count: 3, gap: 24 }, 0, 0.01)).toEqual({
      count: 1,
      gap: 0,
      width: 0,
    });
  });
});
