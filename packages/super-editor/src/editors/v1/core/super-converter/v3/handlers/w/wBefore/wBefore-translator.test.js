import { describe, it, expect } from 'vitest';
import { translator } from './wBefore-translator.js';

describe('w:wBefore translator', () => {
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

    it('returns undefined if w:w is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:type': 'dxa' } }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:wBefore element with w:w and w:type attributes', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { wBefore: { value: 140, type: 'pct' } } } });
      expect(result).toEqual({ 'w:w': '140', 'w:type': 'pct' });
    });

    it('handles missing type property', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { wBefore: { value: 140 } } } });
      expect(result).toEqual({ 'w:w': '140' });
    });

    it('returns undefined if wBefore property is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if wBefore.value is missing or not a number', () => {
      expect(translator.decode({ node: { attrs: { wBefore: { type: 'dxa' } } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: { wBefore: { value: null } } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:wBefore');
    expect(translator.sdNodeOrKeyName).toBe('wBefore');
  });
});
