import { describe, it, expect } from 'vitest';
import { translator } from './multiLevelType-translator.js';

describe('w:multiLevelType translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': 'multilevel' } }] });
      expect(result).toBe('multilevel');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:multiLevelType element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { multiLevelType: 'multilevel' } } });
      expect(result).toEqual({ 'w:val': 'multilevel' });
    });

    it('returns undefined if multiLevelType property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:multiLevelType');
    expect(translator.sdNodeOrKeyName).toBe('multiLevelType');
  });
});
