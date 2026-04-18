import { describe, it, expect } from 'vitest';
import { translator } from './textAlignment-translator.js';

describe('w:textAlignment translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'top' } }] });
      expect(result).toBe('top');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:textAlignment element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { textAlignment: 'top' } } });
      expect(result).toEqual({ 'w:val': 'top' });
    });

    it('returns undefined if textAlignment property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:textAlignment');
    expect(translator.sdNodeOrKeyName).toBe('textAlignment');
  });
});
