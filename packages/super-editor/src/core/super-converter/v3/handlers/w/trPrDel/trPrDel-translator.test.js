import { describe, it, expect } from 'vitest';
import { translator } from './trPrDel-translator.js';
import { NodeTranslator } from '@translator';

describe('w:del (trPr) translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:del');
    expect(translator.sdNodeOrKeyName).toBe('del');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes tracking attributes', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:id': '2', 'w:author': 'Alice', 'w:date': '2024-01-01T00:00:00Z' } }],
      });
      expect(result).toEqual({ id: 2, author: 'Alice', date: '2024-01-01T00:00:00Z' });
    });

    it('returns undefined for empty attributes', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes tracking attributes', () => {
      const result = translator.decode({
        node: { attrs: { del: { id: 2, author: 'Alice', date: '2024-01-01T00:00:00Z' } } },
      });
      expect(result.attributes).toEqual({
        'w:id': '2',
        'w:author': 'Alice',
        'w:date': '2024-01-01T00:00:00Z',
      });
    });

    it('returns undefined if del is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = { id: 10, author: 'Carol', date: '2024-06-15T12:00:00Z' };
    const decoded = translator.decode({ node: { attrs: { del: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
