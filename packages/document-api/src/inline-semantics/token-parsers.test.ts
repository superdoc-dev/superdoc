import { describe, it, expect } from 'bun:test';
import {
  parseStOnOff,
  parseStUnderline,
  parseUnderlineColor,
  parseUnderlineThemeColor,
  parseUnderlineThemeModifier,
} from './token-parsers.js';

const XPATH_B = '/w:document/w:body/w:p/w:r/w:rPr/w:b/@w:val';
const XPATH_U = '/w:document/w:body/w:p/w:r/w:rPr/w:u/@w:val';
const XPATH_U_COLOR = '/w:document/w:body/w:p/w:r/w:rPr/w:u/@w:color';
const XPATH_U_THEME = '/w:document/w:body/w:p/w:r/w:rPr/w:u/@w:themeColor';
const XPATH_U_TINT = '/w:document/w:body/w:p/w:r/w:rPr/w:u/@w:themeTint';
const XPATH_U_SHADE = '/w:document/w:body/w:p/w:r/w:rPr/w:u/@w:themeShade';

// ---------------------------------------------------------------------------
// ST_OnOff (bold/italic/strike)
// ---------------------------------------------------------------------------

describe('parseStOnOff', () => {
  it('bare element (null val) → ON', () => {
    const result = parseStOnOff('bold', null, XPATH_B);
    expect(result).toEqual({ ok: true, value: { direct: 'on' } });
  });

  const onValues = ['true', '1', 'on'] as const;
  it.each(onValues)('w:val="%s" → ON', (val) => {
    expect(parseStOnOff('bold', val, XPATH_B)).toEqual({ ok: true, value: { direct: 'on' } });
  });

  const offValues = ['false', '0', 'off'] as const;
  it.each(offValues)('w:val="%s" → OFF', (val) => {
    expect(parseStOnOff('italic', val, XPATH_B)).toEqual({ ok: true, value: { direct: 'off' } });
  });

  it.each(['True', 'FALSE', 'ON', 'OFF', 'yes', 'no', '', 'garbage'])('w:val="%s" → INVALID', (val) => {
    const result = parseStOnOff('strike', val, XPATH_B);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INLINE_TOKEN');
      expect(result.error.property).toBe('strike');
      expect(result.error.attribute).toBe('val');
      expect(result.error.token).toBe(val);
    }
  });
});

// ---------------------------------------------------------------------------
// ST_Underline (underline w:val)
// ---------------------------------------------------------------------------

describe('parseStUnderline', () => {
  it('bare element (null val) → ON single', () => {
    const result = parseStUnderline(null, XPATH_U);
    expect(result).toEqual({ ok: true, value: { direct: 'on', underlineType: 'single' } });
  });

  it('w:val="none" → OFF', () => {
    const result = parseStUnderline('none', XPATH_U);
    expect(result).toEqual({ ok: true, value: { direct: 'off', underlineType: 'none' } });
  });

  const onTypes = [
    'single',
    'double',
    'thick',
    'dotted',
    'dottedHeavy',
    'dash',
    'dashedHeavy',
    'dashLong',
    'dashLongHeavy',
    'dotDash',
    'dashDotHeavy',
    'dotDotDash',
    'dashDotDotHeavy',
    'wave',
    'wavyHeavy',
    'wavyDouble',
    'words',
  ] as const;

  it.each(onTypes)('w:val="%s" → ON', (val) => {
    const result = parseStUnderline(val, XPATH_U);
    expect(result).toEqual({ ok: true, value: { direct: 'on', underlineType: val } });
  });

  it.each(['Single', 'DOUBLE', 'garbage', '', 'true', 'false'])('w:val="%s" → INVALID', (val) => {
    const result = parseStUnderline(val, XPATH_U);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INLINE_TOKEN');
      expect(result.error.property).toBe('underline');
      expect(result.error.attribute).toBe('val');
      expect(result.error.token).toBe(val);
    }
  });
});

// ---------------------------------------------------------------------------
// Underline color
// ---------------------------------------------------------------------------

describe('parseUnderlineColor', () => {
  it('null → undefined', () => {
    expect(parseUnderlineColor(null, XPATH_U_COLOR)).toEqual({ ok: true, value: undefined });
  });

  it('"auto" → undefined', () => {
    expect(parseUnderlineColor('auto', XPATH_U_COLOR)).toEqual({ ok: true, value: undefined });
  });

  it('"FF0000" → "#ff0000"', () => {
    expect(parseUnderlineColor('FF0000', XPATH_U_COLOR)).toEqual({ ok: true, value: '#ff0000' });
  });

  it('"#FF0000" → "#ff0000"', () => {
    expect(parseUnderlineColor('#FF0000', XPATH_U_COLOR)).toEqual({ ok: true, value: '#ff0000' });
  });

  it('"ZZZZZZ" → INVALID', () => {
    const result = parseUnderlineColor('ZZZZZZ', XPATH_U_COLOR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.attribute).toBe('color');
      expect(result.error.token).toBe('ZZZZZZ');
    }
  });

  it('"F00" (3-digit) → INVALID', () => {
    const result = parseUnderlineColor('F00', XPATH_U_COLOR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.attribute).toBe('color');
    }
  });
});

// ---------------------------------------------------------------------------
// Underline themeColor
// ---------------------------------------------------------------------------

describe('parseUnderlineThemeColor', () => {
  it('null → undefined', () => {
    expect(parseUnderlineThemeColor(null, XPATH_U_THEME)).toEqual({ ok: true, value: undefined });
  });

  const validColors = [
    'dark1',
    'light1',
    'dark2',
    'light2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hyperlink',
    'followedHyperlink',
    'background1',
    'text1',
    'background2',
    'text2',
    'none',
  ] as const;

  it.each(validColors)('"%s" → stored as-is', (val) => {
    expect(parseUnderlineThemeColor(val, XPATH_U_THEME)).toEqual({ ok: true, value: val });
  });

  it('"notAThemeColor" → INVALID', () => {
    const result = parseUnderlineThemeColor('notAThemeColor', XPATH_U_THEME);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.attribute).toBe('themeColor');
  });

  it('"Accent1" (wrong case) → INVALID', () => {
    const result = parseUnderlineThemeColor('Accent1', XPATH_U_THEME);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Underline themeTint / themeShade
// ---------------------------------------------------------------------------

describe('parseUnderlineThemeModifier', () => {
  it('null → undefined', () => {
    expect(parseUnderlineThemeModifier(null, 'themeTint', XPATH_U_TINT)).toEqual({ ok: true, value: undefined });
  });

  it('"80" → "80" (uppercase)', () => {
    expect(parseUnderlineThemeModifier('80', 'themeTint', XPATH_U_TINT)).toEqual({ ok: true, value: '80' });
  });

  it('"0f" → "0F" (uppercase)', () => {
    expect(parseUnderlineThemeModifier('0f', 'themeShade', XPATH_U_SHADE)).toEqual({ ok: true, value: '0F' });
  });

  it('"GG" → INVALID', () => {
    const result = parseUnderlineThemeModifier('GG', 'themeTint', XPATH_U_TINT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.attribute).toBe('themeTint');
  });

  it('"123" (3-digit) → INVALID', () => {
    const result = parseUnderlineThemeModifier('123', 'themeShade', XPATH_U_SHADE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.attribute).toBe('themeShade');
  });
});
