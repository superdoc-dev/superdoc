import { describe, it, expect } from 'vitest';
import { translator } from './bidiVisual-translator.js';

describe('w:bidiVisual translator', () => {
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
    it('creates a bare w:bidiVisual element when rightToLeft is true', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { rightToLeft: true } } });
      expect(result).toEqual({});
    });

    // SD-3142: explicit false (from `<w:bidiVisual w:val="0"/>`) is a real
    // signal per §17.4.1 + §17.17.4 and can override a style-cascade true.
    // Drop it on export and the style cascade wins on the next open.
    it('emits w:val="0" when rightToLeft is explicit false', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { rightToLeft: false } } });
      expect(result).toEqual({ 'w:val': '0' });
    });

    it('returns undefined when rightToLeft is missing (omit the element)', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:bidiVisual');
    expect(translator.sdNodeOrKeyName).toBe('rightToLeft');
  });
});
