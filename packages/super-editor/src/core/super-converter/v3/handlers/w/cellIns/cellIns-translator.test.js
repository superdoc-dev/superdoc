import { describe, it, expect } from 'vitest';
import { translator } from './cellIns-translator.js';
import { NodeTranslator } from '@translator';

describe('w:cellIns translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:cellIns');
    expect(translator.sdNodeOrKeyName).toBe('cellIns');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes tracking attributes', () => {
      const result = translator.encode({
        nodes: [{ attributes: { 'w:id': '3', 'w:author': 'Alice', 'w:date': '2024-01-01T00:00:00Z' } }],
      });
      expect(result).toEqual({ id: 3, author: 'Alice', date: '2024-01-01T00:00:00Z' });
    });

    it('returns undefined for empty attributes', () => {
      const result = translator.encode({ nodes: [{ attributes: {} }] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes tracking attributes', () => {
      const result = translator.decode({
        node: { attrs: { cellIns: { id: 3, author: 'Alice', date: '2024-01-01T00:00:00Z' } } },
      });
      expect(result.attributes).toEqual({
        'w:id': '3',
        'w:author': 'Alice',
        'w:date': '2024-01-01T00:00:00Z',
      });
    });

    it('returns undefined if cellIns is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = { id: 7, author: 'Dave', date: '2024-06-15T12:00:00Z' };
    const decoded = translator.decode({ node: { attrs: { cellIns: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
