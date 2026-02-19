import { describe, it, expect } from 'vitest';
import { translator } from './vMerge-translator.js';

describe('w:vMerge translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'div123' } }] });
      expect(result).toBe('div123');
    });

    it('returns "continue" if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBe('continue');
    });
  });

  describe('decode', () => {
    it('creates a w:vMerge element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { vMerge: 'div123' } } });
      expect(result).toEqual({ 'w:val': 'div123' });
    });

    it('returns undefined if vMerge property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:vMerge');
    expect(translator.sdNodeOrKeyName).toBe('vMerge');
  });
});
