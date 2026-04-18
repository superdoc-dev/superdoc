import { describe, it, expect } from 'vitest';
import { translator } from './textboxTightWrap-translator.js';

describe('w:textboxTightWrap translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'allLines' } }] });
      expect(result).toBe('allLines');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:textboxTightWrap element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { textboxTightWrap: 'allLines' } } });
      expect(result).toEqual({ 'w:val': 'allLines' });
    });

    it('returns undefined if textboxTightWrap property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:textboxTightWrap');
    expect(translator.sdNodeOrKeyName).toBe('textboxTightWrap');
  });
});
