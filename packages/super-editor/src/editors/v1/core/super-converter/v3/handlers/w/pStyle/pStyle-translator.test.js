import { describe, it, expect } from 'vitest';
import { translator } from './pStyle-translator.js';

describe('w:pStyle translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'Some value' } }] });
      expect(result).toBe('Some value');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:pStyle element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { styleId: 'Some value' } } });
      expect(result).toEqual({ 'w:val': 'Some value' });
    });

    it('returns undefined if pStyle property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:pStyle');
    expect(translator.sdNodeOrKeyName).toBe('styleId');
  });
});
