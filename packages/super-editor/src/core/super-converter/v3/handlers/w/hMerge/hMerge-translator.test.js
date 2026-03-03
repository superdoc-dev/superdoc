import { describe, it, expect } from 'vitest';
import { translator } from './hMerge-translator.js';

describe('w:hMerge translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'restart' } }] });
      expect(result).toBe('restart');
    });

    it('returns "continue" if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBe('continue');
    });
  });

  describe('decode', () => {
    it('creates a w:hMerge element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { hMerge: 'restart' } } });
      expect(result).toEqual({ 'w:val': 'restart' });
    });

    it('returns undefined if hMerge property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:hMerge');
    expect(translator.sdNodeOrKeyName).toBe('hMerge');
  });

  it('roundtrips through encode → decode', () => {
    const encoded = translator.encode({ nodes: [{ attributes: { 'w:val': 'restart' } }] });
    const decoded = translator.decode({ node: { attrs: { hMerge: encoded } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toBe('restart');
  });
});
