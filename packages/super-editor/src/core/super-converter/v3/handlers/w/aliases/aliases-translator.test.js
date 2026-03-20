import { describe, it, expect } from 'vitest';
import { translator } from './aliases-translator.js';

describe('w:aliases translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'Alias1,Alias2' } }] });
      expect(result).toBe('Alias1,Alias2');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:aliases element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { aliases: 'Alias1,Alias2' } } });
      expect(result).toEqual({ 'w:val': 'Alias1,Alias2' });
    });

    it('returns undefined if aliases property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:aliases');
    expect(translator.sdNodeOrKeyName).toBe('aliases');
  });
});
