import { describe, it, expect } from 'vitest';
import { translator } from './pPrChange-translator.js';
import { NodeTranslator } from '@translator';

describe('w:pPrChange translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:pPrChange');
    expect(translator.sdNodeOrKeyName).toBe('pPrChange');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes tracking attributes and nested paragraph properties', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '10', 'w:author': 'Alice', 'w:date': '2024-01-01T00:00:00Z' },
            elements: [
              {
                name: 'w:pPr',
                elements: [{ name: 'w:keepNext' }, { name: 'w:jc', attributes: { 'w:val': 'center' } }],
              },
            ],
          },
        ],
      });

      expect(result).toEqual({
        id: 10,
        author: 'Alice',
        date: '2024-01-01T00:00:00Z',
        paragraphProperties: {
          keepNext: true,
          justification: 'center',
        },
      });
    });

    it('encodes with only tracking attributes when no nested pPr', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '5', 'w:author': 'Bob' },
            elements: [],
          },
        ],
      });

      expect(result).toEqual({ id: 5, author: 'Bob' });
    });

    it('returns undefined for empty input', () => {
      const result = translator.encode({
        nodes: [{ attributes: {}, elements: [] }],
      });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes tracking attributes and nested paragraph properties', () => {
      const result = translator.decode({
        node: {
          attrs: {
            pPrChange: {
              id: 10,
              author: 'Alice',
              date: '2024-01-01T00:00:00Z',
              paragraphProperties: {
                keepNext: true,
                justification: 'center',
              },
            },
          },
        },
      });

      expect(result.name).toBe('w:pPrChange');
      expect(result.attributes).toEqual({
        'w:id': '10',
        'w:author': 'Alice',
        'w:date': '2024-01-01T00:00:00Z',
      });
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].name).toBe('w:pPr');
      expect(result.elements[0].elements).toEqual(
        expect.arrayContaining([
          { name: 'w:keepNext', attributes: {} },
          { name: 'w:jc', attributes: { 'w:val': 'center' } },
        ]),
      );
    });

    it('returns undefined if pPrChange is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = {
      id: 10,
      author: 'Alice',
      date: '2024-01-01T00:00:00Z',
      paragraphProperties: {
        keepNext: true,
        justification: 'center',
      },
    };

    const decoded = translator.decode({ node: { attrs: { pPrChange: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
