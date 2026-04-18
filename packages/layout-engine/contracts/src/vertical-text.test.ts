import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPT_SUPERSCRIPT_SCALE,
  normalizeBaselineShift,
  hasExplicitBaselineShift,
  isSuperscriptOrSubscript,
  usesDefaultScriptLayout,
  scaleFontSizeForVerticalText,
  resolveBaseFontSizeForVerticalText,
} from './vertical-text.js';

describe('normalizeBaselineShift', () => {
  it('returns undefined for null', () => {
    expect(normalizeBaselineShift(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(normalizeBaselineShift(undefined)).toBeUndefined();
  });

  it('returns undefined for NaN', () => {
    expect(normalizeBaselineShift(NaN)).toBeUndefined();
  });

  it('returns undefined for Infinity', () => {
    expect(normalizeBaselineShift(Infinity)).toBeUndefined();
  });

  it('returns undefined for zero (identity value)', () => {
    expect(normalizeBaselineShift(0)).toBeUndefined();
  });

  it('returns undefined for near-zero values within epsilon', () => {
    expect(normalizeBaselineShift(1e-7)).toBeUndefined();
    expect(normalizeBaselineShift(-1e-7)).toBeUndefined();
  });

  it('returns the value for positive shifts', () => {
    expect(normalizeBaselineShift(3)).toBe(3);
  });

  it('returns the value for negative shifts', () => {
    expect(normalizeBaselineShift(-1.5)).toBe(-1.5);
  });

  it('returns the value for small but non-zero shifts', () => {
    expect(normalizeBaselineShift(0.01)).toBe(0.01);
  });
});

describe('hasExplicitBaselineShift', () => {
  it('returns false for null/undefined/zero', () => {
    expect(hasExplicitBaselineShift(null)).toBe(false);
    expect(hasExplicitBaselineShift(undefined)).toBe(false);
    expect(hasExplicitBaselineShift(0)).toBe(false);
  });

  it('returns true for non-zero finite values', () => {
    expect(hasExplicitBaselineShift(3)).toBe(true);
    expect(hasExplicitBaselineShift(-1.5)).toBe(true);
  });
});

describe('isSuperscriptOrSubscript', () => {
  it('returns true for superscript', () => {
    expect(isSuperscriptOrSubscript('superscript')).toBe(true);
  });

  it('returns true for subscript', () => {
    expect(isSuperscriptOrSubscript('subscript')).toBe(true);
  });

  it('returns false for baseline', () => {
    expect(isSuperscriptOrSubscript('baseline')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isSuperscriptOrSubscript(null)).toBe(false);
    expect(isSuperscriptOrSubscript(undefined)).toBe(false);
  });
});

describe('usesDefaultScriptLayout', () => {
  it('returns true for superscript without explicit shift', () => {
    expect(usesDefaultScriptLayout({ vertAlign: 'superscript' })).toBe(true);
  });

  it('returns true for subscript without explicit shift', () => {
    expect(usesDefaultScriptLayout({ vertAlign: 'subscript' })).toBe(true);
  });

  it('returns false for superscript with explicit shift', () => {
    expect(usesDefaultScriptLayout({ vertAlign: 'superscript', baselineShift: 3 })).toBe(false);
  });

  it('returns true for superscript with zero shift (identity)', () => {
    expect(usesDefaultScriptLayout({ vertAlign: 'superscript', baselineShift: 0 })).toBe(true);
  });

  it('returns false for baseline', () => {
    expect(usesDefaultScriptLayout({ vertAlign: 'baseline' })).toBe(false);
  });

  it('returns false when no vertAlign', () => {
    expect(usesDefaultScriptLayout({})).toBe(false);
    expect(usesDefaultScriptLayout({ baselineShift: 3 })).toBe(false);
  });
});

describe('scaleFontSizeForVerticalText', () => {
  it('scales font size for default superscript', () => {
    expect(scaleFontSizeForVerticalText(16, { vertAlign: 'superscript' })).toBeCloseTo(
      16 * SUBSCRIPT_SUPERSCRIPT_SCALE,
    );
  });

  it('scales font size for default subscript', () => {
    expect(scaleFontSizeForVerticalText(16, { vertAlign: 'subscript' })).toBeCloseTo(16 * SUBSCRIPT_SUPERSCRIPT_SCALE);
  });

  it('does not scale when explicit shift is present', () => {
    expect(scaleFontSizeForVerticalText(16, { vertAlign: 'superscript', baselineShift: 3 })).toBe(16);
  });

  it('scales when shift is zero (identity)', () => {
    expect(scaleFontSizeForVerticalText(16, { vertAlign: 'superscript', baselineShift: 0 })).toBeCloseTo(
      16 * SUBSCRIPT_SUPERSCRIPT_SCALE,
    );
  });

  it('does not scale for baseline', () => {
    expect(scaleFontSizeForVerticalText(16, { vertAlign: 'baseline' })).toBe(16);
  });

  it('does not scale when no vertAlign', () => {
    expect(scaleFontSizeForVerticalText(16, {})).toBe(16);
  });

  it('passes through non-finite values unchanged', () => {
    expect(scaleFontSizeForVerticalText(NaN, { vertAlign: 'superscript' })).toBeNaN();
    expect(scaleFontSizeForVerticalText(Infinity, { vertAlign: 'superscript' })).toBe(Infinity);
  });
});

describe('resolveBaseFontSizeForVerticalText', () => {
  it('un-scales default superscript font size', () => {
    const scaled = 16 * SUBSCRIPT_SUPERSCRIPT_SCALE;
    expect(resolveBaseFontSizeForVerticalText(scaled, { vertAlign: 'superscript' })).toBeCloseTo(16);
  });

  it('un-scales default subscript font size', () => {
    const scaled = 16 * SUBSCRIPT_SUPERSCRIPT_SCALE;
    expect(resolveBaseFontSizeForVerticalText(scaled, { vertAlign: 'subscript' })).toBeCloseTo(16);
  });

  it('returns font size unchanged when explicit shift is present', () => {
    expect(resolveBaseFontSizeForVerticalText(16, { vertAlign: 'superscript', baselineShift: 3 })).toBe(16);
  });

  it('un-scales when shift is zero (identity)', () => {
    const scaled = 16 * SUBSCRIPT_SUPERSCRIPT_SCALE;
    expect(resolveBaseFontSizeForVerticalText(scaled, { vertAlign: 'superscript', baselineShift: 0 })).toBeCloseTo(16);
  });

  it('returns font size unchanged for baseline', () => {
    expect(resolveBaseFontSizeForVerticalText(16, { vertAlign: 'baseline' })).toBe(16);
  });

  it('passes through non-finite values unchanged', () => {
    expect(resolveBaseFontSizeForVerticalText(NaN, { vertAlign: 'superscript' })).toBeNaN();
  });

  it('roundtrips with scaleFontSizeForVerticalText', () => {
    const formatting = { vertAlign: 'superscript' as const };
    const original = 24;
    const scaled = scaleFontSizeForVerticalText(original, formatting);
    expect(resolveBaseFontSizeForVerticalText(scaled, formatting)).toBeCloseTo(original);
  });
});
