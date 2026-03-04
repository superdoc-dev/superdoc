import { describe, it, expect } from 'vitest';
import { resolveThemeColorValue, applyThemeTint, applyThemeShade, parseThemePercentage } from './theme-color.js';

const palette = {
  accent1: '#4F81BD',
  dk1: '#000000',
  lt1: '#FFFFFF',
  hyperlink: '#0000FF',
};

describe('resolveThemeColorValue', () => {
  it('resolves a known theme key to its base color', () => {
    expect(resolveThemeColorValue('accent1', undefined, undefined, palette)).toBe('#4F81BD');
  });

  it('returns undefined for an unknown theme key', () => {
    expect(resolveThemeColorValue('missing', undefined, undefined, palette)).toBeUndefined();
  });

  it('returns undefined for an empty theme key', () => {
    expect(resolveThemeColorValue('', undefined, undefined, palette)).toBeUndefined();
    expect(resolveThemeColorValue('  ', undefined, undefined, palette)).toBeUndefined();
  });

  it('applies tint to the base color', () => {
    // accent1 (#4F81BD) with tint '99' (0x99/255 ≈ 0.6)
    const result = resolveThemeColorValue('accent1', '99', undefined, palette);
    expect(result).toBe('#B9CDE5');
  });

  it('applies shade to the base color', () => {
    // accent1 (#4F81BD) with shade '33' (0x33/255 ≈ 0.2)
    const result = resolveThemeColorValue('accent1', undefined, '33', palette);
    expect(result).toBe('#101A26');
  });

  it('applies both tint and shade', () => {
    const result = resolveThemeColorValue('accent1', '80', 'BF', palette);
    expect(result).toBeDefined();
    // Tint applied first, then shade — result should be between base and modified
    expect(result!.startsWith('#')).toBe(true);
    expect(result!.length).toBe(7);
  });
});

describe('applyThemeTint', () => {
  it('tints pure black toward white', () => {
    // ratio 0.5: black (0,0,0) → (128,128,128) approx
    expect(applyThemeTint('#000000', 0.5)).toBe('#808080');
  });

  it('does nothing at ratio 0', () => {
    expect(applyThemeTint('#4F81BD', 0)).toBe('#4F81BD');
  });

  it('produces pure white at ratio 1', () => {
    expect(applyThemeTint('#000000', 1)).toBe('#FFFFFF');
  });

  it('handles already-white gracefully', () => {
    expect(applyThemeTint('#FFFFFF', 0.5)).toBe('#FFFFFF');
  });
});

describe('applyThemeShade', () => {
  it('shades pure white toward black', () => {
    // ratio 0.5: white (255,255,255) → (128,128,128)
    expect(applyThemeShade('#FFFFFF', 0.5)).toBe('#808080');
  });

  it('produces pure black at ratio 0', () => {
    expect(applyThemeShade('#FFFFFF', 0)).toBe('#000000');
  });

  it('does nothing at ratio 1', () => {
    expect(applyThemeShade('#4F81BD', 1)).toBe('#4F81BD');
  });
});

describe('parseThemePercentage', () => {
  it('parses FF as 1', () => {
    expect(parseThemePercentage('FF')).toBeCloseTo(1, 2);
  });

  it('parses 00 as 0', () => {
    expect(parseThemePercentage('00')).toBe(0);
  });

  it('parses 80 as ~0.502', () => {
    expect(parseThemePercentage('80')).toBeCloseTo(128 / 255, 3);
  });

  it('returns undefined for non-string', () => {
    expect(parseThemePercentage(undefined)).toBeUndefined();
    expect(parseThemePercentage(null)).toBeUndefined();
    expect(parseThemePercentage(42)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseThemePercentage('')).toBeUndefined();
    expect(parseThemePercentage('  ')).toBeUndefined();
  });
});
