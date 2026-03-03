import { describe, it, expect } from 'vitest';
import { translator } from './rsid-translator.js';

describe('w:rsid translator', () => {
  describe('encode', () => {
    it('preserves hex string value as-is', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '0045A23C' } }] });
      expect(result).toBe('0045A23C');
    });

    it('preserves numeric-looking string without coercion', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:val': '42' } }] });
      expect(result).toBe('42');
    });

    it('returns undefined if w:val is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('emits a w:rsid element with the hex string in w:val', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { rsid: '0045A23C' } } });
      expect(result).toEqual({ 'w:val': '0045A23C' });
    });

    it('roundtrips a numeric-looking string', () => {
      const { attributes: result } = translator.decode({ node: { attrs: { rsid: '42' } } });
      expect(result).toEqual({ 'w:val': '42' });
    });

    it('returns undefined if rsid property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:rsid');
    expect(translator.sdNodeOrKeyName).toBe('rsid');
  });
});
