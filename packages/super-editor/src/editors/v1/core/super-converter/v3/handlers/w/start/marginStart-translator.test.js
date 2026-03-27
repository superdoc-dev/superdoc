import { describe, it, expect } from 'vitest';
import { translator as marginStartTranslator } from './marginStart-translator.js';

describe('w:start margin translator (marginStart)', () => {
  describe('encode', () => {
    it('extracts w:w and w:type attributes into an object', () => {
      const result = marginStartTranslator.encode({ nodes: [{ attributes: { 'w:w': '120', 'w:type': 'dxa' } }] });
      expect(result).toEqual({ value: 120, type: 'dxa' });
    });

    it('handles missing w:type', () => {
      const result = marginStartTranslator.encode({ nodes: [{ attributes: { 'w:w': '120' } }] });
      expect(result).toEqual({ value: 120 });
    });

    it('parses w:w as integer', () => {
      const result = marginStartTranslator.encode({ nodes: [{ attributes: { 'w:w': '150.7' } }] });
      expect(result.value).toBe(150);
    });

    it('returns undefined if w:w is missing', () => {
      const result = marginStartTranslator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:start element with w:w and w:type attributes', () => {
      const { attributes: result } = marginStartTranslator.decode({
        node: { attrs: { marginStart: { value: 140, type: 'pct' } } },
      });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = marginStartTranslator.decode({ node: { attrs: { marginStart: { value: 140 } } } });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if marginStart property is missing', () => {
      expect(marginStartTranslator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if marginStart.value is missing or not a number', () => {
      expect(marginStartTranslator.decode({ node: { attrs: { marginStart: { type: 'dxa' } } } })).toBeUndefined();
      expect(marginStartTranslator.decode({ node: { attrs: { marginStart: { value: null } } } })).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(marginStartTranslator.xmlName).toBe('w:start');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(marginStartTranslator.sdNodeOrKeyName).toBe('marginStart');
    });
  });
});
