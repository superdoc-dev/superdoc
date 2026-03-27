import { describe, it, expect } from 'vitest';
// The translator is exported as `translator` from the file, but imported as `marginLeftTranslator` in the index.
import { translator as marginLeftTranslator } from './marginLeft-translator.js';

describe('w:left margin translator (marginLeft)', () => {
  describe('encode', () => {
    it('extracts w:w and w:type attributes into an object', () => {
      const result = marginLeftTranslator.encode({ nodes: [{ attributes: { 'w:w': '120', 'w:type': 'dxa' } }] });
      expect(result).toEqual({ value: 120, type: 'dxa' });
    });

    it('handles missing w:type', () => {
      const result = marginLeftTranslator.encode({ nodes: [{ attributes: { 'w:w': '120' } }] });
      expect(result).toEqual({ value: 120 });
    });

    it('parses w:w as integer', () => {
      const result = marginLeftTranslator.encode({ nodes: [{ attributes: { 'w:w': '150.7' } }] });
      expect(result.value).toBe(150);
    });

    it('returns undefined if w:w is missing', () => {
      const result = marginLeftTranslator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:left element with w:w and w:type attributes', () => {
      const { attributes: result } = marginLeftTranslator.decode({
        node: { attrs: { marginLeft: { value: 140, type: 'pct' } } },
      });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = marginLeftTranslator.decode({ node: { attrs: { marginLeft: { value: 140 } } } });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if marginLeft property is missing', () => {
      expect(marginLeftTranslator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if marginLeft.value is missing or not a number', () => {
      expect(marginLeftTranslator.decode({ node: { attrs: { marginLeft: { type: 'dxa' } } } })).toBeUndefined();
      expect(marginLeftTranslator.decode({ node: { attrs: { marginLeft: { value: null } } } })).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(marginLeftTranslator.xmlName).toBe('w:left');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(marginLeftTranslator.sdNodeOrKeyName).toBe('marginLeft');
    });
  });
});
