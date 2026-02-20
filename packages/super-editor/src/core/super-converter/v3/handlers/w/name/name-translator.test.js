import { describe, it, expect } from 'vitest';
import { translator } from './name-translator.js';

describe('w:name translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'Name' } }] });
      expect(result).toBe('Name');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:name element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { name: 'Name' } } });
      expect(result).toEqual({ 'w:val': 'Name' });
    });

    it('returns undefined if name property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:name');
    expect(translator.sdNodeOrKeyName).toBe('name');
  });
});
