import { describe, it, expect } from 'vitest';
import { translator } from './gridSpan-translator.js';

describe('w:gridSpan translator', () => {
  describe('encode', () => {
    it('extracts and parses the w:val attribute as an integer', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '3' } }] });
      expect(result).toBe(3);
    });

    it('returns undefined if w:val is not a valid integer string', () => {
      expect(translator.encode({ nodes: [{ attributes: { 'w:val': 'abc' } }] })).toBeUndefined();
    });

    it('parses float string as integer', () => {
      expect(translator.encode({ nodes: [{ attributes: { 'w:val': '1.5' } }] })).toBe(1);
    });

    it('returns undefined if w:val is missing', () => {
      expect(translator.encode({ nodes: [{ attributes: {} }] })).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:gridSpan element with the value converted to a string in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { gridSpan: 5 } } });
      expect(result).toEqual({ 'w:val': '5' });
    });

    it('handles value 0', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { gridSpan: 0 } } });
      expect(result).toEqual({ 'w:val': '0' });
    });

    it('returns undefined if gridSpan property is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if gridSpan property is not a number', () => {
      expect(translator.decode({ node: { attrs: { gridSpan: null } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: { gridSpan: 'hello' } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:gridSpan');
    expect(translator.sdNodeOrKeyName).toBe('gridSpan');
  });
});
