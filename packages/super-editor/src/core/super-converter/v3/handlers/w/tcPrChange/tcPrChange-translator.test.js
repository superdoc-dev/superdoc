import { describe, it, expect } from 'vitest';
import { translator } from './tcPrChange-translator.js';
import { NodeTranslator } from '@translator';

describe('w:tcPrChange translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:tcPrChange');
    expect(translator.sdNodeOrKeyName).toBe('tcPrChange');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes tracking attributes and nested table cell properties', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '40', 'w:author': 'Eve', 'w:date': '2024-04-01T00:00:00Z' },
            elements: [
              {
                name: 'w:tcPr',
                elements: [
                  { name: 'w:vAlign', attributes: { 'w:val': 'center' } },
                  { name: 'w:gridSpan', attributes: { 'w:val': '2' } },
                ],
              },
            ],
          },
        ],
      });

      expect(result).toEqual({
        id: 40,
        author: 'Eve',
        date: '2024-04-01T00:00:00Z',
        tableCellProperties: {
          vAlign: 'center',
          gridSpan: 2,
        },
      });
    });

    it('encodes with only tracking attributes when no nested tcPr', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '25', 'w:author': 'Frank' },
            elements: [],
          },
        ],
      });

      expect(result).toEqual({ id: 25, author: 'Frank' });
    });

    it('returns undefined for empty input', () => {
      const result = translator.encode({
        nodes: [{ attributes: {}, elements: [] }],
      });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes tracking attributes and nested table cell properties', () => {
      const result = translator.decode({
        node: {
          attrs: {
            tcPrChange: {
              id: 40,
              author: 'Eve',
              date: '2024-04-01T00:00:00Z',
              tableCellProperties: {
                vAlign: 'center',
                gridSpan: 2,
              },
            },
          },
        },
      });

      expect(result.name).toBe('w:tcPrChange');
      expect(result.attributes).toEqual({
        'w:id': '40',
        'w:author': 'Eve',
        'w:date': '2024-04-01T00:00:00Z',
      });
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].name).toBe('w:tcPr');
      expect(result.elements[0].elements).toEqual(
        expect.arrayContaining([
          { name: 'w:vAlign', attributes: { 'w:val': 'center' } },
          { name: 'w:gridSpan', attributes: { 'w:val': '2' } },
        ]),
      );
    });

    it('returns undefined if tcPrChange is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = {
      id: 40,
      author: 'Eve',
      date: '2024-04-01T00:00:00Z',
      tableCellProperties: {
        vAlign: 'center',
        gridSpan: 2,
      },
    };

    const decoded = translator.decode({ node: { attrs: { tcPrChange: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
