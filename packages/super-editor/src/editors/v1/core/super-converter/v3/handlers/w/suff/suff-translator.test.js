import { describe, it, expect } from 'vitest';
import { translator } from './suff-translator.js';

describe('w:suff translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'tab' } }] });
      expect(result).toBe('tab');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:suff element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { suff: 'tab' } } });
      expect(result).toEqual({ 'w:val': 'tab' });
    });

    it('returns undefined if suff property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:suff');
    expect(translator.sdNodeOrKeyName).toBe('suff');
  });
});
