import { describe, it, expect } from 'vitest';
import { translator } from './lvlJc-translator.js';

describe('w:lvlJc translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'center' } }] });
      expect(result).toBe('center');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:lvlJc element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { lvlJc: 'center' } } });
      expect(result).toEqual({ 'w:val': 'center' });
    });

    it('returns undefined if lvlJc property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:lvlJc');
    expect(translator.sdNodeOrKeyName).toBe('lvlJc');
  });
});
