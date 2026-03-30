import { describe, it, expect } from 'vitest';
import { translator } from './noWrap-translator.js';

describe('w:noWrap translator', () => {
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
    it('creates a w:noWrap element if noWrap is true', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { noWrap: true } } });
      expect(result).toEqual({ 'w:val': '1' });
    });

    it('returns undefined if noWrap is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:noWrap');
    expect(translator.sdNodeOrKeyName).toBe('noWrap');
  });
});
