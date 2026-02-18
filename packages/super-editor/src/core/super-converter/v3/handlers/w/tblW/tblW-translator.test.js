import { describe, it, expect } from 'vitest';
import { translator } from './tblW-translator.js';

describe('w:tblW translator', () => {
  describe('encode', () => {
    it('extracts w:w and w:type attributes into an object', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:w': '120', 'w:type': 'dxa' } }] });
      expect(result).toEqual({ value: 120, type: 'dxa' });
    });

    it('handles missing w:type', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:w': '120' } }] });
      expect(result).toEqual({ value: 120 });
    });

    it('parses w:w as integer', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:w': '150' } }] });
      expect(result.value).toBe(150);
    });

    // SD-1633: ECMA-376 percentage string handling
    it('converts percentage string "100%" with type="pct" to fiftieths (5000)', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:w': '100%', 'w:type': 'pct' } }],
      });
      expect(result).toEqual({ value: 5000, type: 'pct' });
    });

    it('converts percentage string "50%" with type="pct" to fiftieths (2500)', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:w': '50%', 'w:type': 'pct' } }],
      });
      expect(result).toEqual({ value: 2500, type: 'pct' });
    });

    it('handles decimal percentage strings like "62.5%"', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:w': '62.5%', 'w:type': 'pct' } }],
      });
      expect(result).toEqual({ value: 3125, type: 'pct' });
    });

    it('does not convert percentage string when type is not "pct"', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:w': '100%', 'w:type': 'dxa' } }],
      });
      // parseInt("100%") = 100, kept as-is for non-pct types
      expect(result).toEqual({ value: 100, type: 'dxa' });
    });

    it('handles numeric fiftieths format (5000 = 100%) unchanged', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:w': '5000', 'w:type': 'pct' } }],
      });
      expect(result).toEqual({ value: 5000, type: 'pct' });
    });

    it('returns undefined if w:w is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:tblW element with w:w and w:type attributes', () => {
      const { attributes: result } = translator.decode({
        node: { attrs: { tableWidth: { value: 140, type: 'pct' } } },
      });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { tableWidth: { value: 140 } } } });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if tableWidth property is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if tableWidth.value is missing or not a number', () => {
      expect(translator.decode({ node: { attrs: { tableWidth: { type: 'dxa' } } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: { tableWidth: { value: null } } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblW');
    expect(translator.sdNodeOrKeyName).toBe('tableWidth');
  });
});
