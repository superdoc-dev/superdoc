import { describe, it, expect } from 'vitest';
import { translator } from './vAlign-translator.js';

describe('w:vAlign translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'div123' } }] });
      expect(result).toBe('div123');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:vAlign element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { vAlign: 'div123' } } });
      expect(result).toEqual({ 'w:val': 'div123' });
    });

    it('returns undefined if vAlign property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:vAlign');
    expect(translator.sdNodeOrKeyName).toBe('vAlign');
  });
});
