import { describe, it, expect } from 'vitest';
import { translator as marginTopTranslator } from './marginTop-translator.js';

describe('w:top margin translator (marginTop)', () => {
  describe('encode', () => {
    it('extracts w:w and w:type attributes into an object', () => {
      const result = marginTopTranslator.encode({ nodes: [{ attributes: { 'w:w': '120', 'w:type': 'dxa' } }] });
      expect(result).toEqual({ value: 120, type: 'dxa' });
    });

    it('handles missing w:type', () => {
      const result = marginTopTranslator.encode({ nodes: [{ attributes: { 'w:w': '120' } }] });
      expect(result).toEqual({ value: 120 });
    });

    it('parses w:w as integer', () => {
      const result = marginTopTranslator.encode({ nodes: [{ attributes: { 'w:w': '150.7' } }] });
      expect(result.value).toBe(150);
    });

    it('returns undefined if w:w is missing', () => {
      const result = marginTopTranslator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:top element with w:w and w:type attributes', () => {
      const { attributes: result } = marginTopTranslator.decode({
        node: { attrs: { marginTop: { value: 140, type: 'pct' } } },
      });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = marginTopTranslator.decode({ node: { attrs: { marginTop: { value: 140 } } } });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if marginTop property is missing', () => {
      expect(marginTopTranslator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if marginTop.value is missing or not a number', () => {
      expect(marginTopTranslator.decode({ node: { attrs: { marginTop: { type: 'dxa' } } } })).toBeUndefined();
      expect(marginTopTranslator.decode({ node: { attrs: { marginTop: { value: null } } } })).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(marginTopTranslator.xmlName).toBe('w:top');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(marginTopTranslator.sdNodeOrKeyName).toBe('marginTop');
    });
  });
});
