import { describe, it, expect } from 'vitest';
import { translator } from './next-translator.js';

describe('w:next translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'NextStyle' } }] });
      expect(result).toBe('NextStyle');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:next element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { next: 'NextStyle' } } });
      expect(result).toEqual({ 'w:val': 'NextStyle' });
    });

    it('returns undefined if next property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:next');
    expect(translator.sdNodeOrKeyName).toBe('next');
  });
});
