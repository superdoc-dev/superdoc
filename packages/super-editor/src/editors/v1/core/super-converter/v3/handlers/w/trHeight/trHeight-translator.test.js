import { describe, it, expect } from 'vitest';
import { translator } from './trHeight-translator.js';

describe('w:trHeight translator', () => {
  describe('encode', () => {
    it('encodes w:val and w:hRule into an object', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '240', 'w:hRule': 'atLeast' } }] });
      expect(result).toEqual({ value: 240, rule: 'atLeast' });
    });

    it('handles only w:val', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '240' } }] });
      expect(result).toEqual({ value: 240 });
    });

    it('handles only w:hRule', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:hRule': 'exact' } }] });
      expect(result).toEqual({ rule: 'exact' });
    });

    it('returns undefined for empty attributes', () => {
      expect(translator.encode({ nodes: [{ attributes: {} }] })).toBeUndefined();
    });

    it('parses w:val as integer', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '300' } }] });
      expect(result.value).toBe(300);
    });
  });

  describe('decode', () => {
    it('decodes a rowHeight object into w:val and w:hRule attributes', () => {
      const { attributes: result } = translator.decode({
        node: { attrs: { rowHeight: { value: 280, rule: 'auto' } } },
      });
      expect(result).toEqual({ 'w:val': '280', 'w:hRule': 'auto' });
    });

    it('handles only value', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { rowHeight: { value: 280 } } } });
      expect(result).toEqual({ 'w:val': '280' });
    });

    it('handles only rule', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { rowHeight: { rule: 'auto' } } } });
      expect(result).toEqual({ 'w:hRule': 'auto' });
    });

    it('returns undefined if rowHeight is empty object', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('ignores non-numeric or NaN values for value', () => {
      expect(translator.decode({ node: { attrs: { rowHeight: { value: 'abc' } } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: { rowHeight: { value: NaN } } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: { rowHeight: { value: null, rule: 'auto' } } } }).attributes).toEqual({
        'w:hRule': 'auto',
      });
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:trHeight');
    expect(translator.sdNodeOrKeyName).toBe('rowHeight');
  });
});
