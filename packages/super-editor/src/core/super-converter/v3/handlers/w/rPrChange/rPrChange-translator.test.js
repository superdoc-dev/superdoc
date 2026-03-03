import { describe, it, expect } from 'vitest';
import { translator } from './rPrChange-translator.js';
import { NodeTranslator } from '@translator';

describe('w:rPrChange translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:rPrChange');
    expect(translator.sdNodeOrKeyName).toBe('rPrChange');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes tracking attributes and nested run properties', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '20', 'w:author': 'Bob', 'w:date': '2024-02-01T00:00:00Z' },
            elements: [
              {
                name: 'w:rPr',
                elements: [{ name: 'w:b' }, { name: 'w:i' }],
              },
            ],
          },
        ],
      });

      expect(result).toEqual({
        id: 20,
        author: 'Bob',
        date: '2024-02-01T00:00:00Z',
        runProperties: {
          bold: true,
          italic: true,
        },
      });
    });

    it('encodes with only tracking attributes when no nested rPr', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '5', 'w:author': 'Carol' },
            elements: [],
          },
        ],
      });

      expect(result).toEqual({ id: 5, author: 'Carol' });
    });

    it('returns undefined for empty input', () => {
      const result = translator.encode({
        nodes: [{ attributes: {}, elements: [] }],
      });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes tracking attributes and nested run properties', () => {
      const result = translator.decode({
        node: {
          attrs: {
            rPrChange: {
              id: 20,
              author: 'Bob',
              date: '2024-02-01T00:00:00Z',
              runProperties: {
                bold: true,
                italic: true,
              },
            },
          },
        },
      });

      expect(result.name).toBe('w:rPrChange');
      expect(result.attributes).toEqual({
        'w:id': '20',
        'w:author': 'Bob',
        'w:date': '2024-02-01T00:00:00Z',
      });
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].name).toBe('w:rPr');
      expect(result.elements[0].elements).toEqual(
        expect.arrayContaining([
          { name: 'w:b', attributes: {} },
          { name: 'w:i', attributes: {} },
        ]),
      );
    });

    it('returns undefined if rPrChange is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = {
      id: 20,
      author: 'Bob',
      date: '2024-02-01T00:00:00Z',
      runProperties: {
        bold: true,
        italic: true,
      },
    };

    const decoded = translator.decode({ node: { attrs: { rPrChange: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
