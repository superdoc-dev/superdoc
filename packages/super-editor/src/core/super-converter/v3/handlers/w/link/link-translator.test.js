import { describe, it, expect } from 'vitest';
import { translator } from './link-translator.js';

describe('w:link translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'LinkedStyle' } }] });
      expect(result).toBe('LinkedStyle');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:link element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { link: 'LinkedStyle' } } });
      expect(result).toEqual({ 'w:val': 'LinkedStyle' });
    });

    it('returns undefined if link property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:link');
    expect(translator.sdNodeOrKeyName).toBe('link');
  });
});
