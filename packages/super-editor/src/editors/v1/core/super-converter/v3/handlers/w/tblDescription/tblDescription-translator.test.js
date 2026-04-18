import { describe, it, expect } from 'vitest';
import { translator } from './tblDescription-translator.js';

describe('w:tblDescription translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'Table Description' } }] });
      expect(result).toBe('Table Description');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:tblDescription element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { description: 'Another Description' } } });
      expect(result).toEqual({ 'w:val': 'Another Description' });
    });

    it('returns undefined if description property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblDescription');
    expect(translator.sdNodeOrKeyName).toBe('description');
  });
});
