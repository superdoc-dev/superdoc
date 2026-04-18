import { describe, it, expect } from 'vitest';
import { translator } from './basedOn-translator.js';

describe('w:basedOn translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'BaseStyle' } }] });
      expect(result).toBe('BaseStyle');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:basedOn element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { basedOn: 'BaseStyle' } } });
      expect(result).toEqual({ 'w:val': 'BaseStyle' });
    });

    it('returns undefined if basedOn property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:basedOn');
    expect(translator.sdNodeOrKeyName).toBe('basedOn');
  });
});
