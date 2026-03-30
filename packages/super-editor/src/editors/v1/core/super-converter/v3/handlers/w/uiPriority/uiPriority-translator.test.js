import { describe, it, expect } from 'vitest';
import { translator } from './uiPriority-translator.js';

describe('w:uiPriority translator', () => {
  describe('encode', () => {
    it('extracts the w:val attribute', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '5' } }] });
      expect(result).toBe(5);
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:uiPriority element with the value in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { uiPriority: 5 } } });
      expect(result).toEqual({ 'w:val': '5' });
    });

    it('returns undefined if uiPriority property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:uiPriority');
    expect(translator.sdNodeOrKeyName).toBe('uiPriority');
  });
});
