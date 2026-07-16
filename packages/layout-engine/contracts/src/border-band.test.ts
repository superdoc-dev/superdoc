import { describe, expect, it } from 'vitest';
import { getBorderBandProfile, getBorderBandWidthPx, isNativeCssDoubleStyle } from './border-band.js';

/**
 * Band compositions below are MEASURED from Word renders (300dpi PDF pixel-run
 * profiling of single-cell probe tables, styles x sz {4,12,24}), recorded in the
 * SD-3308 compound-borders plan. At CSS scale: w = authored width px,
 * 0.75pt = 1px, 1.5pt = 2px. Segments alternate rule,gap,...,rule outer face first.
 */
describe('getBorderBandProfile', () => {
  it('returns null for non-compound styles', () => {
    expect(getBorderBandProfile({ style: 'single', width: 2 })).toBeNull();
    expect(getBorderBandProfile({ style: 'thick', width: 2 })).toBeNull();
    expect(getBorderBandProfile({ style: 'dotted', width: 2 })).toBeNull();
    expect(getBorderBandProfile({ style: 'dashSmallGap', width: 2 })).toBeNull();
    expect(getBorderBandProfile({ style: 'none', width: 2 })).toBeNull();
    expect(getBorderBandProfile(undefined)).toBeNull();
    expect(getBorderBandProfile(null)).toBeNull();
    expect(getBorderBandProfile({ none: true })).toBeNull();
  });

  it('double: rule + gap + rule, all at the authored width', () => {
    expect(getBorderBandProfile({ style: 'double', width: 2 })).toEqual({
      segments: [2, 2, 2],
      band: 6,
    });
  });

  it('triple: three rules and two gaps, all at the authored width (Word sz12 = r6+g6+r6+g6+r6 @300dpi)', () => {
    expect(getBorderBandProfile({ style: 'triple', width: 2 })).toEqual({
      segments: [2, 2, 2, 2, 2],
      band: 10,
    });
  });

  it('thinThickSmallGap: scaled outer rule, fixed 0.75pt gap and inner rule', () => {
    expect(getBorderBandProfile({ style: 'thinThickSmallGap', width: 4 })).toEqual({
      segments: [4, 1, 1],
      band: 6,
    });
  });

  it('thickThinSmallGap mirrors thinThickSmallGap', () => {
    expect(getBorderBandProfile({ style: 'thickThinSmallGap', width: 4 })).toEqual({
      segments: [1, 1, 4],
      band: 6,
    });
  });

  it('thinThickMediumGap: scaled outer rule, half-width gap and inner rule', () => {
    expect(getBorderBandProfile({ style: 'thinThickMediumGap', width: 4 })).toEqual({
      segments: [4, 2, 2],
      band: 8,
    });
  });

  it('thickThinMediumGap mirrors thinThickMediumGap', () => {
    expect(getBorderBandProfile({ style: 'thickThinMediumGap', width: 4 })).toEqual({
      segments: [2, 2, 4],
      band: 8,
    });
  });

  it('thinThickLargeGap: fixed 1.5pt outer rule, scaled gap, fixed 0.75pt inner rule', () => {
    expect(getBorderBandProfile({ style: 'thinThickLargeGap', width: 4 })).toEqual({
      segments: [2, 4, 1],
      band: 7,
    });
  });

  it('thickThinLargeGap mirrors thinThickLargeGap', () => {
    expect(getBorderBandProfile({ style: 'thickThinLargeGap', width: 4 })).toEqual({
      segments: [1, 4, 2],
      band: 7,
    });
  });

  it('thinThickThinSmallGap: fixed thin rules and gaps around a scaled center rule', () => {
    expect(getBorderBandProfile({ style: 'thinThickThinSmallGap', width: 4 })).toEqual({
      segments: [1, 1, 4, 1, 1],
      band: 8,
    });
  });

  it('thinThickThinMediumGap: half-width thin rules and gaps around a scaled center rule', () => {
    expect(getBorderBandProfile({ style: 'thinThickThinMediumGap', width: 4 })).toEqual({
      segments: [2, 2, 4, 2, 2],
      band: 12,
    });
  });

  it('thinThickThinLargeGap: fixed thin rules, scaled gaps, fixed 1.5pt center rule', () => {
    expect(getBorderBandProfile({ style: 'thinThickThinLargeGap', width: 4 })).toEqual({
      segments: [1, 4, 2, 4, 1],
      band: 12,
    });
  });

  it('clamps every rule and gap to at least 1px', () => {
    // w/2 = 0.5 would vanish; Word still paints a visible hairline (measured r1 at sz4).
    expect(getBorderBandProfile({ style: 'thinThickThinMediumGap', width: 1 })).toEqual({
      segments: [1, 1, 1, 1, 1],
      band: 5,
    });
    expect(getBorderBandProfile({ style: 'double', width: 0.5 })).toEqual({
      segments: [1, 1, 1],
      band: 3,
    });
  });

  it('accepts the size alias used by raw table border values', () => {
    const raw = { style: 'triple', size: 2 } as unknown as Parameters<typeof getBorderBandProfile>[0];
    expect(getBorderBandProfile(raw)?.band).toBe(10);
  });
});

describe('getBorderBandWidthPx with compound profiles', () => {
  it('keeps the existing double behavior (band = 3x width, min 3)', () => {
    expect(getBorderBandWidthPx({ style: 'double', width: 2 })).toBe(6);
    expect(getBorderBandWidthPx({ style: 'double', width: 0.5 })).toBe(3);
  });

  it('keeps non-compound behavior unchanged', () => {
    expect(getBorderBandWidthPx({ style: 'single', width: 2 })).toBe(2);
    // SD-3028: `thick` paints at the authored width (no 2x); Word renders ST_Border
    // thick at the w:sz width (150dpi st-thick probe).
    expect(getBorderBandWidthPx({ style: 'thick', width: 2 })).toBe(2);
    expect(getBorderBandWidthPx({ style: 'thick', width: 0.5 })).toBe(1); // 1px visibility floor
    expect(getBorderBandWidthPx({ style: 'none', width: 2 })).toBe(0);
    expect(getBorderBandWidthPx(null)).toBe(0);
  });

  it('returns the profile band total for compound styles', () => {
    expect(getBorderBandWidthPx({ style: 'triple', width: 2 })).toBe(10);
    expect(getBorderBandWidthPx({ style: 'thinThickSmallGap', width: 4 })).toBe(6);
    expect(getBorderBandWidthPx({ style: 'thinThickThinLargeGap', width: 4 })).toBe(12);
  });
});

describe('isNativeCssDoubleStyle (SD-3028)', () => {
  it('is true only for double (the one band style CSS renders natively as two equal rules)', () => {
    expect(isNativeCssDoubleStyle('double')).toBe(true);
  });

  it('is false for the multi-rule overlay styles and non-band styles', () => {
    for (const s of ['triple', 'thinThickSmallGap', 'thinThickThinLargeGap', 'single', 'dashed', 'none', undefined]) {
      expect(isNativeCssDoubleStyle(s)).toBe(false);
    }
  });
});
