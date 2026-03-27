import { describe, it, expect } from 'vitest';
import { translator } from './hideMark-translator.js';

describe('w:hideMark translator', () => {
  describe('encode', () => {
    it('extracts and parses the w:val attribute as a boolean', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '1' } }] });
      expect(result).toBe(true);
    });

    it('returns true if w:val is missing', () => {
      expect(translator.encode({ nodes: [{ attributes: {} }] })).toBe(true);
    });
  });

  describe('decode', () => {
    it('returns undefined if hideMark property is missing', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('returns undefined if hideMark property is not a boolean', () => {
      expect(translator.decode({ node: { attrs: { hideMark: null } } })).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:hideMark');
    expect(translator.sdNodeOrKeyName).toBe('hideMark');
  });
});
