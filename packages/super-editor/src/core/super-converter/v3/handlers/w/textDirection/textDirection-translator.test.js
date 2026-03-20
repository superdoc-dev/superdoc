import { describe, it, expect } from 'vitest';
import { translator } from './textDirection-translator.js';

describe('w:textDirection translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'lr' } }] });
      expect(result).toBe('lr');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:textDirection element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { textDirection: 'lr' } } });
      expect(result).toEqual({ 'w:val': 'lr' });
    });

    it('returns undefined if textDirection property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:textDirection');
    expect(translator.sdNodeOrKeyName).toBe('textDirection');
  });
});
