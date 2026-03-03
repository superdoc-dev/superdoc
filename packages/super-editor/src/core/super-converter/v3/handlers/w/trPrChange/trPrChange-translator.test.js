import { describe, it, expect } from 'vitest';
import { translator } from './trPrChange-translator.js';
import { NodeTranslator } from '@translator';

describe('w:trPrChange translator', () => {
  it('has correct metadata', () => {
    expect(translator.xmlName).toBe('w:trPrChange');
    expect(translator.sdNodeOrKeyName).toBe('trPrChange');
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('encodes tracking attributes and nested table row properties', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '30', 'w:author': 'Carol', 'w:date': '2024-03-01T00:00:00Z' },
            elements: [
              {
                name: 'w:trPr',
                elements: [
                  { name: 'w:cantSplit' },
                  { name: 'w:trHeight', attributes: { 'w:val': '240', 'w:hRule': 'atLeast' } },
                ],
              },
            ],
          },
        ],
      });

      expect(result).toEqual({
        id: 30,
        author: 'Carol',
        date: '2024-03-01T00:00:00Z',
        tableRowProperties: {
          cantSplit: true,
          rowHeight: { value: 240, rule: 'atLeast' },
        },
      });
    });

    it('encodes with only tracking attributes when no nested trPr', () => {
      const result = translator.encode({
        nodes: [
          {
            attributes: { 'w:id': '15', 'w:author': 'Dave' },
            elements: [],
          },
        ],
      });

      expect(result).toEqual({ id: 15, author: 'Dave' });
    });

    it('returns undefined for empty input', () => {
      const result = translator.encode({
        nodes: [{ attributes: {}, elements: [] }],
      });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes tracking attributes and nested table row properties', () => {
      const result = translator.decode({
        node: {
          attrs: {
            trPrChange: {
              id: 30,
              author: 'Carol',
              date: '2024-03-01T00:00:00Z',
              tableRowProperties: {
                cantSplit: true,
                rowHeight: { value: 240, rule: 'atLeast' },
              },
            },
          },
        },
      });

      expect(result.name).toBe('w:trPrChange');
      expect(result.attributes).toEqual({
        'w:id': '30',
        'w:author': 'Carol',
        'w:date': '2024-03-01T00:00:00Z',
      });
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].name).toBe('w:trPr');
      expect(result.elements[0].elements).toEqual(
        expect.arrayContaining([
          { name: 'w:cantSplit', attributes: {} },
          { name: 'w:trHeight', attributes: { 'w:val': '240', 'w:hRule': 'atLeast' } },
        ]),
      );
    });

    it('returns undefined if trPrChange is missing', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });

  it('roundtrips through encode → decode', () => {
    const original = {
      id: 30,
      author: 'Carol',
      date: '2024-03-01T00:00:00Z',
      tableRowProperties: {
        cantSplit: true,
        rowHeight: { value: 240, rule: 'atLeast' },
      },
    };

    const decoded = translator.decode({ node: { attrs: { trPrChange: original } } });
    const reEncoded = translator.encode({ nodes: [decoded] });
    expect(reEncoded).toEqual(original);
  });
});
