import { describe, it, expect } from 'vitest';
import { translator } from './cellMerge-translator.js';
import { NodeTranslator } from '@translator';

describe('w:cellMerge translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:cellMerge');
    expect(translator.sdNodeOrKeyName).toBe('cellMerge');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes both vMerge and vMergeOrig attributes', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:vMerge': 'restart', 'w:vMergeOrig': 'continue' } }],
      });
      expect(result).toEqual({ vMerge: 'restart', vMergeOrig: 'continue' });
    });

    it('encodes with only vMerge', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:vMerge': 'restart' } }],
      });
      expect(result).toEqual({ vMerge: 'restart' });
    });

    it('returns undefined for empty attributes', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes cellMerge with both attributes', () => {
      const result = translator.decode({
        node: { attrs: { cellMerge: { vMerge: 'restart', vMergeOrig: 'continue' } } },
      });
      expect(result.attributes).toEqual({
        'w:vMerge': 'restart',
        'w:vMergeOrig': 'continue',
      });
    });

    it('returns undefined if cellMerge is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = { vMerge: 'restart', vMergeOrig: 'continue' };
    const decoded = translator.decode({ node: { attrs: { cellMerge: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
