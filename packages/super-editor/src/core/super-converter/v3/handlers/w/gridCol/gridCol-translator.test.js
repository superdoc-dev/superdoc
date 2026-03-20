import { describe, it, expect } from 'vitest';
import { translator } from './gridCol-translator.js';

describe('w:gridCol translator', () => {
  describe('encode', () => {
    it('extracts and parses the w:w attribute as an integer', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:w': '1234' } }] });
      expect(result).toBe(1234);
    });

    it('parses a float string as an integer', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:w': '567.89' } }] });
      expect(result).toBe(567);
    });

    it('returns undefined if w:w is not a valid integer string', () => {
      const result = translator.encode({ nodes: [{ attributes: { 'w:w': 'abc' } }] });
      expect(result).toBeUndefined();
    });

    it('returns undefined if w:w is missing', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('creates a w:gridCol element with the value converted to a string in w:w', () => {
      const result = translator.decode({ node: { attrs: { col: 4321 } } });
      expect(result).toEqual({ name: 'w:gridCol', attributes: { 'w:w': '4321' } });
    });

    it('handles the value 0', () => {
      const result = translator.decode({ node: { attrs: { col: 0 } } });
      expect(result).toEqual({ name: 'w:gridCol', attributes: { 'w:w': '0' } });
    });

    it('returns undefined if col property is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });

    it('returns undefined if col property is not a number', () => {
      expect(translator.decode({ node: { attrs: { col: null } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: { col: 'hello' } } })).toBeUndefined();
      expect(translator.decode({ node: { attrs: { col: undefined } } })).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('has correct xmlName', () => {
      expect(translator.xmlName).toBe('w:gridCol');
    });

    it('has correct sdNodeOrKeyName', () => {
      expect(translator.sdNodeOrKeyName).toBe('col');
    });
  });

  describe('round-trip consistency', () => {
    it('maintains consistency for an integer value', () => {
      const initialValue = 9876;

      // Decode
      const decodedResult = translator.decode({ node: { attrs: { col: initialValue } } });
      expect(decodedResult).toEqual({ name: 'w:gridCol', attributes: { 'w:w': '9876' } });

      // Encode
      const encodedResult = translator.encode({ nodes: [{ attributes: decodedResult.attributes }] });
      expect(encodedResult).toBe(initialValue);
    });
  });
});
