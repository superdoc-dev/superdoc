import { describe, it, expect } from 'vitest';
import { translator } from './rsid-translator.js';

describe('w:rsid translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '42' } }] });
      expect(result).toBe(42);
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:rsid element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { rsid: 42 } } });
      expect(result).toEqual({ 'w:val': '42' });
    });

    it('returns undefined if rsid property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:rsid');
    expect(translator.sdNodeOrKeyName).toBe('rsid');
  });
});
