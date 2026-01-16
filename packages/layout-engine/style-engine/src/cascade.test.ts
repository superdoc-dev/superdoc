import { describe, expect, it } from 'vitest';
import {
  combineProperties,
  combineRunProperties,
  applyInlineOverrides,
  isValidFontSize,
  resolveFontSizeWithFallback,
  orderDefaultsAndNormal,
  createFirstLineIndentHandler,
  createHangingIndentHandler,
  combineIndentProperties,
  DEFAULT_FONT_SIZE_HALF_POINTS,
  INLINE_OVERRIDE_PROPERTIES,
} from './cascade.js';

describe('cascade - combineProperties', () => {
  it('returns empty object when propertiesArray is empty', () => {
    const result = combineProperties([]);
    expect(result).toEqual({});
  });

  it('returns empty object when propertiesArray is null/undefined', () => {
    expect(combineProperties(null as never)).toEqual({});
    expect(combineProperties(undefined as never)).toEqual({});
  });

  it('deep merges simple properties from multiple objects', () => {
    const result = combineProperties([
      { fontSize: 22, bold: true },
      { fontSize: 24, italic: true },
    ]);
    expect(result).toEqual({ fontSize: 24, bold: true, italic: true });
  });

  it('deep merges nested objects by default', () => {
    const result = combineProperties([
      { spacing: { before: 100, after: 200 } },
      { spacing: { before: 150, line: 276 } },
    ]);
    expect(result).toEqual({
      spacing: { before: 150, after: 200, line: 276 },
    });
  });

  it('fully overrides properties in fullOverrideProps list', () => {
    const result = combineProperties([{ color: { val: 'FF0000', theme: 'accent1' } }, { color: { val: '00FF00' } }], {
      fullOverrideProps: ['color'],
    });
    expect(result).toEqual({ color: { val: '00FF00' } });
  });

  it('applies special handlers when provided', () => {
    const customHandler = () => 'custom-value';
    const result = combineProperties([{ prop: 'original' }, { prop: 'new' }], {
      specialHandling: { prop: customHandler },
    });
    expect(result.prop).toBe('custom-value');
  });

  it('handles empty arrays in properties', () => {
    const result = combineProperties([{ tabs: [{ pos: 100 }] }, { tabs: [] }]);
    expect(result.tabs).toEqual([]);
  });

  it('handles null values in property chain', () => {
    const result = combineProperties([{ fontSize: 22 }, null as never, { fontSize: 24 }]);
    expect(result.fontSize).toBe(24);
  });

  it('handles undefined values in property chain', () => {
    const result = combineProperties([{ fontSize: 22 }, undefined as never, { fontSize: 24 }]);
    expect(result.fontSize).toBe(24);
  });

  it('preserves primitive values from later objects', () => {
    const result = combineProperties([
      { bold: true, fontSize: 20, text: 'hello' },
      { bold: false, fontSize: 24 },
    ]);
    expect(result).toEqual({ bold: false, fontSize: 24, text: 'hello' });
  });

  it('merges multiple nested levels deeply', () => {
    const result = combineProperties([{ a: { b: { c: 1, d: 2 } } }, { a: { b: { c: 3, e: 4 } } }]);
    expect(result).toEqual({
      a: { b: { c: 3, d: 2, e: 4 } },
    });
  });

  it('respects fullOverrideProps even for nested objects', () => {
    const result = combineProperties(
      [{ fontFamily: { ascii: 'Calibri', hAnsi: 'Calibri' } }, { fontFamily: { ascii: 'Arial' } }],
      { fullOverrideProps: ['fontFamily'] },
    );
    expect(result.fontFamily).toEqual({ ascii: 'Arial' });
  });

  it('combines multiple sources in correct order (later wins)', () => {
    const result = combineProperties([
      { fontSize: 20, bold: true },
      { fontSize: 22, italic: true },
      { fontSize: 24, strike: true },
    ]);
    expect(result).toEqual({ fontSize: 24, bold: true, italic: true, strike: true });
  });

  it('handles special handler receiving both target and source', () => {
    const handlerSpy = (target: Record<string, unknown>, source: Record<string, unknown>) => {
      // First merge has empty target, so target.prop is undefined
      // This correctly tests the handler signature
      const targetVal = target.prop ?? 'empty';
      return `${targetVal}-${source.prop}`;
    };
    const result = combineProperties([{ prop: 'base' }, { prop: 'override' }], {
      specialHandling: { prop: handlerSpy },
    });
    expect(result.prop).toBe('empty-base-override'); // Handler is called twice: first with empty target
  });

  it('does not mutate original objects', () => {
    const obj1 = { fontSize: 22, bold: true };
    const obj2 = { fontSize: 24 };
    combineProperties([obj1, obj2]);
    expect(obj1).toEqual({ fontSize: 22, bold: true });
    expect(obj2).toEqual({ fontSize: 24 });
  });

  it('handles arrays as simple overrides (not deep merge)', () => {
    const result = combineProperties([{ items: [1, 2, 3] }, { items: [4, 5] }]);
    expect(result.items).toEqual([4, 5]);
  });
});

describe('cascade - combineRunProperties', () => {
  it('applies full override for fontFamily', () => {
    const result = combineRunProperties([
      { fontFamily: { ascii: 'Calibri', hAnsi: 'Calibri' } },
      { fontFamily: { ascii: 'Arial' } },
    ]);
    expect(result.fontFamily).toEqual({ ascii: 'Arial' });
  });

  it('applies full override for color', () => {
    const result = combineRunProperties([{ color: { val: 'FF0000', theme: 'accent1' } }, { color: { val: '00FF00' } }]);
    expect(result.color).toEqual({ val: '00FF00' });
  });

  it('deep merges other properties not in fullOverrideProps', () => {
    const result = combineRunProperties([
      { fontSize: 22, bold: true },
      { fontSize: 24, italic: true },
    ]);
    expect(result).toEqual({ fontSize: 24, bold: true, italic: true });
  });

  it('combines fontFamily and other properties correctly', () => {
    const result = combineRunProperties([
      { fontFamily: { ascii: 'Calibri' }, fontSize: 22 },
      { fontFamily: { ascii: 'Arial' }, bold: true },
    ]);
    expect(result).toEqual({
      fontFamily: { ascii: 'Arial' },
      fontSize: 22,
      bold: true,
    });
  });
});

describe('cascade - applyInlineOverrides', () => {
  it('applies inline overrides for INLINE_OVERRIDE_PROPERTIES', () => {
    const finalProps = { fontSize: 22, bold: true, color: 'FF0000' };
    const inlineProps = { fontSize: 24, italic: true };
    const result = applyInlineOverrides(finalProps, inlineProps);
    expect(result.fontSize).toBe(24);
    expect(result.bold).toBe(true);
    expect(result.italic).toBe(true);
  });

  it('returns finalProps unchanged when inlineProps is null', () => {
    const finalProps = { fontSize: 22, bold: true };
    const result = applyInlineOverrides(finalProps, null);
    expect(result).toBe(finalProps);
    expect(result).toEqual({ fontSize: 22, bold: true });
  });

  it('returns finalProps unchanged when inlineProps is undefined', () => {
    const finalProps = { fontSize: 22, bold: true };
    const result = applyInlineOverrides(finalProps, undefined);
    expect(result).toBe(finalProps);
  });

  it('only overrides properties in overrideKeys list', () => {
    const finalProps = { fontSize: 22, bold: true, color: 'FF0000' };
    const inlineProps = { fontSize: 24, bold: false, color: '00FF00' };
    const result = applyInlineOverrides(finalProps, inlineProps);
    // fontSize, bold are in INLINE_OVERRIDE_PROPERTIES, color is not
    expect(result.fontSize).toBe(24);
    expect(result.bold).toBe(false);
    expect(result.color).toBe('FF0000'); // Not overridden
  });

  it('respects custom overrideKeys parameter', () => {
    const finalProps = { fontSize: 22, bold: true, color: 'FF0000' };
    const inlineProps = { fontSize: 24, bold: false, color: '00FF00' };
    const result = applyInlineOverrides(finalProps, inlineProps, ['color']);
    expect(result.fontSize).toBe(22); // Not in custom override list
    expect(result.bold).toBe(true); // Not in custom override list
    expect(result.color).toBe('00FF00'); // In custom override list
  });

  it('does not override when inline property is null', () => {
    const finalProps = { fontSize: 22, bold: true };
    const inlineProps = { fontSize: null, italic: true };
    const result = applyInlineOverrides(finalProps, inlineProps);
    expect(result.fontSize).toBe(22); // Not overridden (null check)
    expect(result.bold).toBe(true);
  });

  it('does not override when inline property is undefined', () => {
    const finalProps = { fontSize: 22, bold: true };
    const inlineProps = { fontSize: undefined, italic: true };
    const result = applyInlineOverrides(finalProps, inlineProps);
    expect(result.fontSize).toBe(22); // Not overridden (undefined check)
  });

  it('overrides with falsy values (false, 0, empty string)', () => {
    const finalProps = { bold: true, fontSize: 22, letterSpacing: 10 };
    const inlineProps = { bold: false, fontSize: 0, letterSpacing: 0 };
    const result = applyInlineOverrides(finalProps, inlineProps);
    expect(result.bold).toBe(false); // Falsy but valid
    expect(result.fontSize).toBe(0); // Zero is valid
    expect(result.letterSpacing).toBe(0);
  });

  it('mutates and returns the same finalProps object', () => {
    const finalProps = { fontSize: 22 };
    const inlineProps = { fontSize: 24 };
    const result = applyInlineOverrides(finalProps, inlineProps);
    expect(result).toBe(finalProps); // Same object reference
    expect(finalProps.fontSize).toBe(24); // Mutated
  });

  it('applies all INLINE_OVERRIDE_PROPERTIES correctly', () => {
    const finalProps = {};
    const inlineProps = {
      fontSize: 24,
      bold: true,
      italic: true,
      strike: true,
      underline: { type: 'single' },
      letterSpacing: 20,
    };
    const result = applyInlineOverrides(finalProps, inlineProps);
    expect(result).toEqual(inlineProps);
  });
});

describe('cascade - isValidFontSize', () => {
  it('returns true for positive finite numbers', () => {
    expect(isValidFontSize(1)).toBe(true);
    expect(isValidFontSize(20)).toBe(true);
    expect(isValidFontSize(100.5)).toBe(true);
    expect(isValidFontSize(0.1)).toBe(true);
  });

  it('returns false for zero', () => {
    expect(isValidFontSize(0)).toBe(false);
  });

  it('returns false for negative numbers', () => {
    expect(isValidFontSize(-1)).toBe(false);
    expect(isValidFontSize(-20)).toBe(false);
  });

  it('returns false for NaN', () => {
    expect(isValidFontSize(NaN)).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(isValidFontSize(Infinity)).toBe(false);
    expect(isValidFontSize(-Infinity)).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isValidFontSize('20')).toBe(false);
    expect(isValidFontSize('abc')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidFontSize(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidFontSize(undefined)).toBe(false);
  });

  it('returns false for objects', () => {
    expect(isValidFontSize({})).toBe(false);
    expect(isValidFontSize({ fontSize: 20 })).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isValidFontSize([])).toBe(false);
    expect(isValidFontSize([20])).toBe(false);
  });

  it('returns false for boolean values', () => {
    expect(isValidFontSize(true)).toBe(false);
    expect(isValidFontSize(false)).toBe(false);
  });
});

describe('cascade - resolveFontSizeWithFallback', () => {
  it('returns value when valid', () => {
    expect(resolveFontSizeWithFallback(24)).toBe(24);
    expect(resolveFontSizeWithFallback(10.5)).toBe(10.5);
  });

  it('falls back to defaultProps.fontSize when value is invalid', () => {
    expect(resolveFontSizeWithFallback(null, { fontSize: 22 })).toBe(22);
    expect(resolveFontSizeWithFallback(undefined, { fontSize: 22 })).toBe(22);
    expect(resolveFontSizeWithFallback(0, { fontSize: 22 })).toBe(22);
    expect(resolveFontSizeWithFallback(-10, { fontSize: 22 })).toBe(22);
  });

  it('falls back to normalProps.fontSize when value and defaults are invalid', () => {
    expect(resolveFontSizeWithFallback(null, null, { fontSize: 20 })).toBe(20);
    expect(resolveFontSizeWithFallback(null, {}, { fontSize: 20 })).toBe(20);
    expect(resolveFontSizeWithFallback(0, { fontSize: 0 }, { fontSize: 20 })).toBe(20);
  });

  it('falls back to DEFAULT_FONT_SIZE_HALF_POINTS when all sources invalid', () => {
    expect(resolveFontSizeWithFallback(null)).toBe(DEFAULT_FONT_SIZE_HALF_POINTS);
    expect(resolveFontSizeWithFallback(null, null, null)).toBe(DEFAULT_FONT_SIZE_HALF_POINTS);
    expect(resolveFontSizeWithFallback(0, {}, {})).toBe(DEFAULT_FONT_SIZE_HALF_POINTS);
    expect(resolveFontSizeWithFallback(NaN, { fontSize: NaN }, { fontSize: 0 })).toBe(DEFAULT_FONT_SIZE_HALF_POINTS);
  });

  it('prefers value over defaults', () => {
    expect(resolveFontSizeWithFallback(24, { fontSize: 22 }, { fontSize: 20 })).toBe(24);
  });

  it('prefers defaults over Normal', () => {
    expect(resolveFontSizeWithFallback(null, { fontSize: 22 }, { fontSize: 20 })).toBe(22);
  });

  it('prefers Normal over constant', () => {
    expect(resolveFontSizeWithFallback(null, null, { fontSize: 18 })).toBe(18);
  });

  it('handles defaultProps as null/undefined', () => {
    expect(resolveFontSizeWithFallback(null, null, { fontSize: 20 })).toBe(20);
    expect(resolveFontSizeWithFallback(null, undefined, { fontSize: 20 })).toBe(20);
  });

  it('handles normalProps as null/undefined', () => {
    expect(resolveFontSizeWithFallback(null, { fontSize: 22 }, null)).toBe(22);
    expect(resolveFontSizeWithFallback(null, { fontSize: 22 }, undefined)).toBe(22);
  });

  it('handles invalid fontSize in defaultProps', () => {
    expect(resolveFontSizeWithFallback(null, { fontSize: 'invalid' }, { fontSize: 20 })).toBe(20);
    expect(resolveFontSizeWithFallback(null, { fontSize: null }, { fontSize: 20 })).toBe(20);
  });

  it('handles invalid fontSize in normalProps', () => {
    expect(resolveFontSizeWithFallback(null, { fontSize: 22 }, { fontSize: 'invalid' })).toBe(22);
    expect(resolveFontSizeWithFallback(null, null, { fontSize: -5 })).toBe(DEFAULT_FONT_SIZE_HALF_POINTS);
  });

  it('validates that DEFAULT_FONT_SIZE_HALF_POINTS is 20', () => {
    expect(DEFAULT_FONT_SIZE_HALF_POINTS).toBe(20);
  });
});

describe('cascade - orderDefaultsAndNormal', () => {
  const defaultProps = { fontSize: 22, bold: true };
  const normalProps = { fontSize: 20, italic: true };

  it('returns [defaults, Normal] when isNormalDefault is true', () => {
    const [first, second] = orderDefaultsAndNormal(defaultProps, normalProps, true);
    expect(first).toBe(defaultProps);
    expect(second).toBe(normalProps);
  });

  it('returns [Normal, defaults] when isNormalDefault is false', () => {
    const [first, second] = orderDefaultsAndNormal(defaultProps, normalProps, false);
    expect(first).toBe(normalProps);
    expect(second).toBe(defaultProps);
  });

  it('preserves object references without cloning', () => {
    const [first, second] = orderDefaultsAndNormal(defaultProps, normalProps, true);
    expect(first).toBe(defaultProps); // Same reference
    expect(second).toBe(normalProps); // Same reference
  });

  it('handles empty objects', () => {
    const [first, second] = orderDefaultsAndNormal({}, {}, true);
    expect(first).toEqual({});
    expect(second).toEqual({});
  });

  it('affects cascade order when used with combineProperties', () => {
    // When Normal is default (true), Normal should override defaults
    const [first, second] = orderDefaultsAndNormal(defaultProps, normalProps, true);
    const result = combineProperties([first, second]);
    expect(result.fontSize).toBe(20); // normalProps wins

    // When Normal is NOT default (false), defaults should override Normal
    const [first2, second2] = orderDefaultsAndNormal(defaultProps, normalProps, false);
    const result2 = combineProperties([first2, second2]);
    expect(result2.fontSize).toBe(22); // defaultProps wins
  });
});

describe('cascade - createFirstLineIndentHandler', () => {
  it('returns a function', () => {
    const handler = createFirstLineIndentHandler();
    expect(typeof handler).toBe('function');
  });

  it('removes hanging from target when source has firstLine', () => {
    const handler = createFirstLineIndentHandler();
    const target = { hanging: 360, left: 720 };
    const source = { firstLine: 432 };
    const result = handler(target, source);
    expect(result).toBe(432);
    expect(target.hanging).toBeUndefined();
    expect(target.left).toBe(720); // Preserved
  });

  it('does not remove hanging when source has no firstLine', () => {
    const handler = createFirstLineIndentHandler();
    const target = { hanging: 360 };
    const source = { left: 720 };
    const result = handler(target, source);
    expect(result).toBeUndefined(); // source.firstLine is undefined
    expect(target.hanging).toBe(360); // Preserved
  });

  it('does not fail when target has no hanging', () => {
    const handler = createFirstLineIndentHandler();
    const target = { left: 720 };
    const source = { firstLine: 432 };
    const result = handler(target, source);
    expect(result).toBe(432);
    expect(target.hanging).toBeUndefined();
  });

  it('returns source.firstLine value', () => {
    const handler = createFirstLineIndentHandler();
    const target = {};
    const source = { firstLine: 432 };
    const result = handler(target, source);
    expect(result).toBe(432);
  });

  it('handles null hanging in target', () => {
    const handler = createFirstLineIndentHandler();
    const target = { hanging: null };
    const source = { firstLine: 432 };
    const result = handler(target, source);
    expect(result).toBe(432);
    // Null is falsy, so delete won't happen in this case
  });

  it('handles zero values', () => {
    const handler = createFirstLineIndentHandler();
    const target = { hanging: 360 };
    const source = { firstLine: 0 };
    const result = handler(target, source);
    expect(result).toBe(0);
    // 0 is falsy but the condition checks != null, so firstLine: 0 is valid
    // But the actual implementation checks if (target.hanging != null && source.firstLine != null)
    // Since 0 != null is true, hanging should be deleted
    expect(target.hanging).toBeUndefined();
  });

  it('handles negative firstLine values', () => {
    const handler = createFirstLineIndentHandler();
    const target = { hanging: 360 };
    const source = { firstLine: -200 };
    const result = handler(target, source);
    expect(result).toBe(-200);
    expect(target.hanging).toBeUndefined(); // Negative is truthy
  });

  it('mutates the target object', () => {
    const handler = createFirstLineIndentHandler();
    const target = { hanging: 360, left: 720 };
    const source = { firstLine: 432 };
    handler(target, source);
    expect(target.hanging).toBeUndefined(); // Mutated
  });
});

describe('cascade - createHangingIndentHandler', () => {
  it('returns a function', () => {
    const handler = createHangingIndentHandler();
    expect(typeof handler).toBe('function');
  });

  it('removes firstLine from target when source has hanging', () => {
    const handler = createHangingIndentHandler();
    const target = { firstLine: 432, left: 720 };
    const source = { hanging: 360 };
    const result = handler(target, source);
    expect(result).toBe(360);
    expect(target.firstLine).toBeUndefined();
    expect(target.left).toBe(720); // Preserved
  });

  it('does not remove firstLine when source has no hanging', () => {
    const handler = createHangingIndentHandler();
    const target = { firstLine: 432 };
    const source = { left: 720 };
    const result = handler(target, source);
    expect(result).toBeUndefined(); // source.hanging is undefined
    expect(target.firstLine).toBe(432); // Preserved
  });
});

describe('cascade - combineIndentProperties', () => {
  it('extracts and combines indent properties from objects', () => {
    const result = combineIndentProperties([{ indent: { left: 720 } }, { indent: { left: 1440, hanging: 360 } }]);
    expect(result).toEqual({
      indent: { left: 1440, hanging: 360 },
    });
  });

  it('handles firstLine/hanging mutual exclusivity', () => {
    const result = combineIndentProperties([{ indent: { left: 720, hanging: 360 } }, { indent: { firstLine: 432 } }]);
    expect(result).toEqual({
      indent: { left: 720, firstLine: 432 },
    });
    // hanging should be removed due to special handler
    expect(result.indent?.hanging).toBeUndefined();
  });

  it('handles hanging/firstLine mutual exclusivity', () => {
    const result = combineIndentProperties([{ indent: { left: 720, firstLine: 432 } }, { indent: { hanging: 360 } }]);
    expect(result).toEqual({
      indent: { left: 720, hanging: 360 },
    });
    // firstLine should be removed due to special handler
    expect(result.indent?.firstLine).toBeUndefined();
  });

  it('handles empty array', () => {
    const result = combineIndentProperties([]);
    expect(result).toEqual({});
  });

  it('handles objects without indent property', () => {
    const result = combineIndentProperties([{ fontSize: 22 }, { bold: true }]);
    expect(result).toEqual({});
  });

  it('ignores non-indent properties', () => {
    const result = combineIndentProperties([
      { indent: { left: 720 }, fontSize: 22, bold: true },
      { indent: { right: 360 }, italic: true },
    ]);
    expect(result).toEqual({
      indent: { left: 720, right: 360 },
    });
  });

  it('handles null indent values', () => {
    const result = combineIndentProperties([{ indent: { left: 720 } }, { indent: null }]);
    expect(result).toEqual({
      indent: { left: 720 },
    });
  });

  it('handles undefined indent values', () => {
    const result = combineIndentProperties([{ indent: { left: 720 } }, { indent: undefined }]);
    expect(result).toEqual({
      indent: { left: 720 },
    });
  });

  it('removes hanging when firstLine is set in later object', () => {
    const result = combineIndentProperties([
      { indent: { left: 720, hanging: 360 } },
      { indent: { left: 1440, firstLine: 432 } },
    ]);
    expect(result.indent?.hanging).toBeUndefined();
    expect(result.indent?.firstLine).toBe(432);
    expect(result.indent?.left).toBe(1440);
  });

  it('preserves hanging when firstLine is not set', () => {
    const result = combineIndentProperties([{ indent: { left: 720, hanging: 360 } }, { indent: { left: 1440 } }]);
    expect(result.indent?.hanging).toBe(360);
    expect(result.indent?.left).toBe(1440);
  });

  it('combines multiple indent sources in correct order', () => {
    const result = combineIndentProperties([
      { indent: { left: 100 } },
      { indent: { right: 200 } },
      { indent: { firstLine: 300 } },
    ]);
    expect(result).toEqual({
      indent: { left: 100, right: 200, firstLine: 300 },
    });
  });

  it('handles objects with indent property set to empty object', () => {
    const result = combineIndentProperties([{ indent: { left: 720 } }, { indent: {} }]);
    expect(result).toEqual({
      indent: { left: 720 },
    });
  });
});

describe('cascade - INLINE_OVERRIDE_PROPERTIES constant', () => {
  it('contains expected properties', () => {
    expect(INLINE_OVERRIDE_PROPERTIES).toContain('fontSize');
    expect(INLINE_OVERRIDE_PROPERTIES).toContain('bold');
    expect(INLINE_OVERRIDE_PROPERTIES).toContain('italic');
    expect(INLINE_OVERRIDE_PROPERTIES).toContain('strike');
    expect(INLINE_OVERRIDE_PROPERTIES).toContain('underline');
    expect(INLINE_OVERRIDE_PROPERTIES).toContain('letterSpacing');
  });

  it('has exactly 6 properties', () => {
    expect(INLINE_OVERRIDE_PROPERTIES).toHaveLength(6);
  });

  it('is a readonly array', () => {
    // TypeScript enforces readonly at compile time, but we can verify it's an array
    expect(Array.isArray(INLINE_OVERRIDE_PROPERTIES)).toBe(true);
  });
});
