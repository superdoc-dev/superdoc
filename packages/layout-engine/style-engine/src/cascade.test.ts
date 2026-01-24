import { describe, expect, it } from 'vitest';
import { combineProperties, combineRunProperties, combineIndentProperties } from './cascade.js';

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
