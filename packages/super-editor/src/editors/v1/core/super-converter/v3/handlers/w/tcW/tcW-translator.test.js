import { describe, it, expect } from 'vitest';
import { translator as tcWTranslator } from './tcW-translator.js';

describe('w:tcW translator (tcW)', () => {
  describe('encode', () => {
    it('extracts w:w and w:type attributes into an object', () => {
      const result = tcWTranslator.encode({ nodes: [{ attributes: { 'w:w': '120', 'w:type': 'dxa' } }] });
      expect(result).toEqual({ value: 120, type: 'dxa' });
    });

    it('handles missing w:type', () => {
      const result = tcWTranslator.encode({ nodes: [{ attributes: { 'w:w': '120' } }] });
      expect(result).toEqual({ value: 120 });
    });

    it('parses w:w as integer', () => {
      const result = tcWTranslator.encode({ nodes: [{ attributes: { 'w:w': '150.7' } }] });
      expect(result.value).toBe(150);
    });

    it('returns undefined if w:w is missing', () => {
      const result = tcWTranslator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });

    // SD-1633: ECMA-376 percentage string handling for cell widths
    it('converts percentage string "62%" with type="pct" to fiftieths (3100)', () => {
      const result = tcWTranslator.encode({
        nodes: [{ attributes: { 'w:w': '62%', 'w:type': 'pct' } }],
      });
      expect(result).toEqual({ value: 3100, type: 'pct' });
    });

    it('converts percentage string "8%" with type="pct" to fiftieths (400)', () => {
      const result = tcWTranslator.encode({
        nodes: [{ attributes: { 'w:w': '8%', 'w:type': 'pct' } }],
      });
      expect(result).toEqual({ value: 400, type: 'pct' });
    });
  });

  describe('decode', () => {
    it('creates a w:tcW element with w:w and w:type attributes', () => {
      const { attributes: result } = tcWTranslator.decode({
        node: { attrs: { cellWidth: { value: 140, type: 'pct' } } },
      });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = tcWTranslator.decode({
        node: { attrs: { cellWidth: { value: 140 } } },
      });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if cellWidth property is missing', () => {
      expect(tcWTranslator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if cellWidth.value is missing or not a number', () => {
      expect(tcWTranslator.decode({ node: { attrs: { cellWidth: { type: 'dxa' } } } })).toBeUndefined();
      expect(tcWTranslator.decode({ node: { attrs: { cellWidth: { value: null } } } })).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(tcWTranslator.xmlName).toBe('w:tcW');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(tcWTranslator.sdNodeOrKeyName).toBe('cellWidth');
    });
  });
});
