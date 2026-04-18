import { describe, it, expect } from 'vitest';
import { translator } from './vertAlign-translator.js';

describe('w:vertAlign translator', () => {
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
    it('creates a w:vertAlign element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { vertAlign: 'top' } } });
      expect(result).toEqual({ 'w:val': 'top' });
    });

    it('returns undefined if vertAlign property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:vertAlign');
    expect(translator.sdNodeOrKeyName).toBe('vertAlign');
  });
});
