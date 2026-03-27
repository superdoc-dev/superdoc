import { describe, it, expect } from 'vitest';
import { translator } from './lvlStart-translator.js';

describe('w:start translator (lvlStart)', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '3' } }] });
      expect(result).toBe(3);
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:start element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { start: 3 } } });
      expect(result).toEqual({ 'w:val': '3' });
    });

    it('returns undefined if start property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:start');
    expect(translator.sdNodeOrKeyName).toBe('start');
  });
});
