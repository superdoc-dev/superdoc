import { describe, it, expect } from 'vitest';
import { translator } from './tblOverlap-translator.js';

describe('w:tblOverlap translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'overlap' } }] });
      expect(result).toBe('overlap');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:tblOverlap element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { overlap: 'never' } } });
      expect(result).toEqual({ 'w:val': 'never' });
    });

    it('returns undefined if overlap property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblOverlap');
    expect(translator.sdNodeOrKeyName).toBe('overlap');
  });
});
