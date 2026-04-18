import { describe, it, expect } from 'vitest';
import { translator as marginEndTranslator } from './marginEnd-translator.js';

describe('w:end margin translator (marginEnd)', () => {
  describe('encode', () => {
    it('extracts w:w and w:type attributes into an object', () => {
      const result = marginEndTranslator.encode({ nodes: [{ attributes: { 'w:w': '120', 'w:type': 'dxa' } }] });
      expect(result).toEqual({ value: 120, type: 'dxa' });
    });

    it('handles missing w:type', () => {
      const result = marginEndTranslator.encode({ nodes: [{ attributes: { 'w:w': '120' } }] });
      expect(result).toEqual({ value: 120 });
    });

    it('parses w:w as integer', () => {
      const result = marginEndTranslator.encode({ nodes: [{ attributes: { 'w:w': '150.7' } }] });
      expect(result.value).toBe(150);
    });

    it('returns undefined if w:w is missing', () => {
      const result = marginEndTranslator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:end element with w:w and w:type attributes', () => {
      const { attributes: result } = marginEndTranslator.decode({
        node: { attrs: { marginEnd: { value: 140, type: 'pct' } } },
      });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = marginEndTranslator.decode({ node: { attrs: { marginEnd: { value: 140 } } } });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if marginEnd property is missing', () => {
      expect(marginEndTranslator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if marginEnd.value is missing or not a number', () => {
      expect(marginEndTranslator.decode({ node: { attrs: { marginEnd: { type: 'dxa' } } } })).toBeUndefined();
      expect(marginEndTranslator.decode({ node: { attrs: { marginEnd: { value: null } } } })).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(marginEndTranslator.xmlName).toBe('w:end');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(marginEndTranslator.sdNodeOrKeyName).toBe('marginEnd');
    });
  });
});
