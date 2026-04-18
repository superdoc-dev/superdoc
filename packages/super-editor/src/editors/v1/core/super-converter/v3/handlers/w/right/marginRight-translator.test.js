import { describe, it, expect } from 'vitest';
import { translator as marginRightTranslator } from './marginRight-translator.js';

describe('w:right margin translator (marginRight)', () => {
  describe('encode', () => {
    it('extracts w:w and w:type attributes into an object', () => {
      const result = marginRightTranslator.encode({ nodes: [{ attributes: { 'w:w': '120', 'w:type': 'dxa' } }] });
      expect(result).toEqual({ value: 120, type: 'dxa' });
    });

    it('handles missing w:type', () => {
      const result = marginRightTranslator.encode({ nodes: [{ attributes: { 'w:w': '120' } }] });
      expect(result).toEqual({ value: 120 });
    });

    it('parses w:w as integer', () => {
      const result = marginRightTranslator.encode({ nodes: [{ attributes: { 'w:w': '150.7' } }] });
      expect(result.value).toBe(150);
    });

    it('returns undefined if w:w is missing', () => {
      const result = marginRightTranslator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:right element with w:w and w:type attributes', () => {
      const { attributes: result } = marginRightTranslator.decode({
        node: { attrs: { marginRight: { value: 140, type: 'pct' } } },
      });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = marginRightTranslator.decode({ node: { attrs: { marginRight: { value: 140 } } } });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if marginRight property is missing', () => {
      expect(marginRightTranslator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if marginRight.value is missing or not a number', () => {
      expect(marginRightTranslator.decode({ node: { attrs: { marginRight: { type: 'dxa' } } } })).toBeUndefined();
      expect(marginRightTranslator.decode({ node: { attrs: { marginRight: { value: null } } } })).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(marginRightTranslator.xmlName).toBe('w:right');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(marginRightTranslator.sdNodeOrKeyName).toBe('marginRight');
    });
  });
});
