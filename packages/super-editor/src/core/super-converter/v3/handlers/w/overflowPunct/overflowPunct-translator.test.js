import { describe, it, expect } from 'vitest';
import { translator } from './overflowPunct-translator.js';

describe('w:overflowPunct translator', () => {
  describe('encode', () => {
    it('returns true for "1", "true", or missing w:val', () => {
      expect(translator.encode({ nodes: [{ attributes: { 'w:val': '1' } }] })).toBe(true);
      expect(translator.encode({ nodes: [{ attributes: { 'w:val': 'true' } }] })).toBe(true);
      expect(translator.encode({ nodes: [{ attributes: {} }] })).toBe(true); // defaults to '1'
    });

    it('returns false for other values', () => {
      expect(translator.encode({ nodes: [{ attributes: { 'w:val': '0' } }] })).toBe(false);
      expect(translator.encode({ nodes: [{ attributes: { 'w:val': 'false' } }] })).toBe(false);
      expect(translator.encode({ nodes: [{ attributes: { 'w:val': 'any other string' } }] })).toBe(false);
    });
  });

  describe('decode', () => {
    it('creates a w:overflowPunct element if overflowPunct is true', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { overflowPunct: true } } });
      expect(result).toEqual({});
    });

    it('returns val=0 if overflowPunct is false and undefined if missing', () => {
      expect(translator.decode({ node: { attrs: { overflowPunct: false } } })).toEqual({
        attributes: { 'w:val': '0' },
      });
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:overflowPunct');
    expect(translator.sdNodeOrKeyName).toBe('overflowPunct');
  });
});
