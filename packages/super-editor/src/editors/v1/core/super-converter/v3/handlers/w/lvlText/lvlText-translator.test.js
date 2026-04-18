import { describe, it, expect } from 'vitest';
import { translator } from './lvlText-translator.js';

describe('w:lvlText translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '%1.' } }] });
      expect(result).toBe('%1.');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:lvlText element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { lvlText: '%1.' } } });
      expect(result).toEqual({ 'w:val': '%1.' });
    });

    it('returns undefined if lvlText property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:lvlText');
    expect(translator.sdNodeOrKeyName).toBe('lvlText');
  });
});
