import { describe, it, expect } from 'vitest';
import { translator } from './numStyleLink-translator.js';

describe('w:numStyleLink translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'ListStyle' } }] });
      expect(result).toBe('ListStyle');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:numStyleLink element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { numStyleLink: 'ListStyle' } } });
      expect(result).toEqual({ 'w:val': 'ListStyle' });
    });

    it('returns undefined if numStyleLink property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:numStyleLink');
    expect(translator.sdNodeOrKeyName).toBe('numStyleLink');
  });
});
