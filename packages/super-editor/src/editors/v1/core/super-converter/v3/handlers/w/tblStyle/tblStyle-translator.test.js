import { describe, it, expect } from 'vitest';
import { translator } from './tblStyle-translator.js';

describe('w:tblStyle translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'TableGrid' } }] });
      expect(result).toBe('TableGrid');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:tblStyle element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { tableStyleId: 'TableNormal' } } });
      expect(result).toEqual({ 'w:val': 'TableNormal' });
    });

    it('returns undefined if tableStyleId property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblStyle');
    expect(translator.sdNodeOrKeyName).toBe('tableStyleId');
  });
});
