import { describe, it, expect } from 'vitest';
import { translator } from './tblHeader-translator.js';

describe('w:tblHeader translator', () => {
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
    it('creates a w:tblHeader element if repeatHeader is true', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { repeatHeader: true } } });
      expect(result).toEqual({});
    });

    it('returns undefined if repeatHeader is false or missing', () => {
      expect(translator.decode({ node: { attrs: { repeatHeader: false } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblHeader');
    expect(translator.sdNodeOrKeyName).toBe('repeatHeader');
  });
});
