import { describe, it, expect } from 'vitest';
import { translator } from './cellDel-translator.js';
import { NodeTranslator } from '@translator';

describe('w:cellDel translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:cellDel');
    expect(translator.sdNodeOrKeyName).toBe('cellDel');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes tracking attributes', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:id': '4', 'w:author': 'Alice', 'w:date': '2024-01-01T00:00:00Z' } }],
      });
      expect(result).toEqual({ id: 4, author: 'Alice', date: '2024-01-01T00:00:00Z' });
    });

    it('returns undefined for empty attributes', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes tracking attributes', () => {
      const result = translator.decode({
        node: { attrs: { cellDel: { id: 4, author: 'Alice', date: '2024-01-01T00:00:00Z' } } },
      });
      expect(result.attributes).toEqual({
        'w:id': '4',
        'w:author': 'Alice',
        'w:date': '2024-01-01T00:00:00Z',
      });
    });

    it('returns undefined if cellDel is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = { id: 8, author: 'Eve', date: '2024-06-15T12:00:00Z' };
    const decoded = translator.decode({ node: { attrs: { cellDel: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
