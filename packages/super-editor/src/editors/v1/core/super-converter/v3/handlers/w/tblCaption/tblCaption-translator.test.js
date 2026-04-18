import { describe, it, expect } from 'vitest';
import { translator } from './tblCaption-translator.js';

describe('w:tblCaption translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'Table Caption' } }] });
      expect(result).toBe('Table Caption');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:tblCaption element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { caption: 'Another Caption' } } });
      expect(result).toEqual({ 'w:val': 'Another Caption' });
    });

    it('returns undefined if caption property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblCaption');
    expect(translator.sdNodeOrKeyName).toBe('caption');
  });
});
