import { describe, it, expect } from 'vitest';
import { translator } from './tblLayout-translator.js';

describe('w:tblLayout translator', () => {
  describe('encode', () => {
    it('extracts the w:type attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:type': 'autofit' } }] });
      expect(result).toBe('autofit');
    });

    it('returns undefined if w:type is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:tblLayout element with the value in w:type', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { tableLayout: 'fixed' } } });
      expect(result).toEqual({ 'w:type': 'fixed' });
    });

    it('returns undefined if layout property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tblLayout');
    expect(translator.sdNodeOrKeyName).toBe('tableLayout');
  });
});
