vi.mock('../../../../exporter.js', () => {
  const processOutputMarks = vi.fn((marks) => marks || []);
  const generateRunProps = vi.fn((processedMarks) => ({
    name: 'w:rPr',
    elements: [],
  }));
  return { processOutputMarks, generateRunProps };
});

import { describe, it, expect } from 'vitest';
import { translator } from './pPrChange-translator.js';
import { NodeTranslator } from '@translator';

describe('w:pPrChange translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:pPrChange');
      expect(translator.sdNodeOrKeyName).toBe('change');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode a w:pPrChange element with attributes and nested w:pPr', () => {
      const xmlNode = {
        name: 'w:pPrChange',
        attributes: {
          'w:id': '0',
          'w:author': 'Luccas Correa',
          'w:date': '2026-04-02T11:25:00Z',
        },
        elements: [
          {
            name: 'w:pPr',
            elements: [
              { name: 'w:pStyle', attributes: { 'w:val': 'ListParagraph' } },
              {
                name: 'w:numPr',
                elements: [{ name: 'w:numId', attributes: { 'w:val': '1' } }],
              },
              { name: 'w:ind', attributes: { 'w:hanging': '360' } },
            ],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        id: '0',
        author: 'Luccas Correa',
        date: '2026-04-02T11:25:00Z',
        paragraphProperties: {
          styleId: 'ListParagraph',
          numberingProperties: { numId: 1 },
          indent: { hanging: 360 },
        },
      });
    });

    it('should encode a w:pPrChange with an empty w:pPr as an empty paragraphProperties object', () => {
      const xmlNode = {
        name: 'w:pPrChange',
        attributes: {
          'w:id': '5',
          'w:author': 'Test Author',
          'w:date': '2026-01-01T00:00:00Z',
        },
        elements: [
          {
            name: 'w:pPr',
            elements: [],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        id: '5',
        author: 'Test Author',
        date: '2026-01-01T00:00:00Z',
        paragraphProperties: {},
      });
    });

    it('should encode nested sectPr from the changed paragraph properties', () => {
      const sectPr = {
        name: 'w:sectPr',
        elements: [{ name: 'w:type', attributes: { 'w:val': 'nextPage' } }],
      };
      const xmlNode = {
        name: 'w:pPrChange',
        attributes: {
          'w:id': '6',
          'w:author': 'Section Author',
          'w:date': '2026-01-02T00:00:00Z',
        },
        elements: [
          {
            name: 'w:pPr',
            elements: [sectPr],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        id: '6',
        author: 'Section Author',
        date: '2026-01-02T00:00:00Z',
        paragraphProperties: {
          sectPr,
        },
      });
    });

    it('should encode a w:pPrChange with only attributes and no children', () => {
      const xmlNode = {
        name: 'w:pPrChange',
        attributes: {
          'w:id': '3',
          'w:author': 'Author',
          'w:date': '2026-01-01T00:00:00Z',
        },
        elements: [],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        id: '3',
        author: 'Author',
        date: '2026-01-01T00:00:00Z',
      });
    });

    it('should return undefined if no attributes or children are present', () => {
      const xmlNode = {
        name: 'w:pPrChange',
        attributes: {},
        elements: [],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('should decode a change object with attributes and nested paragraphProperties', () => {
      const superDocNode = {
        attrs: {
          change: {
            id: '0',
            author: 'Luccas Correa',
            date: '2026-04-02T11:25:00Z',
            paragraphProperties: {
              styleId: 'ListParagraph',
              numberingProperties: { numId: 1 },
              indent: { hanging: 360 },
            },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:pPrChange');
      expect(result.attributes).toEqual({
        'w:id': '0',
        'w:author': 'Luccas Correa',
        'w:date': '2026-04-02T11:25:00Z',
      });
      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'w:pPr',
            elements: expect.arrayContaining([
              { name: 'w:pStyle', attributes: { 'w:val': 'ListParagraph' } },
              expect.objectContaining({
                name: 'w:numPr',
                elements: [{ name: 'w:numId', attributes: { 'w:val': '1' } }],
              }),
              { name: 'w:ind', attributes: { 'w:hanging': '360' } },
            ]),
          }),
        ]),
      );
    });

    it('should decode a change object with only attributes', () => {
      const superDocNode = {
        attrs: {
          change: {
            id: '5',
            author: 'Test Author',
            date: '2026-01-01T00:00:00Z',
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:pPrChange',
        type: 'element',
        attributes: {
          'w:id': '5',
          'w:author': 'Test Author',
          'w:date': '2026-01-01T00:00:00Z',
        },
        elements: [],
      });
    });

    it('should return undefined if change is empty', () => {
      const superDocNode = {
        attrs: {
          change: {},
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });

    it('should decode a change with an explicit empty paragraphProperties object', () => {
      const superDocNode = {
        attrs: {
          change: {
            id: '8',
            author: 'Empty Paragraph Props',
            date: '2026-01-03T00:00:00Z',
            paragraphProperties: {},
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:pPrChange',
        type: 'element',
        attributes: {
          'w:id': '8',
          'w:author': 'Empty Paragraph Props',
          'w:date': '2026-01-03T00:00:00Z',
        },
        elements: [
          {
            name: 'w:pPr',
            type: 'element',
            attributes: {},
            elements: [],
          },
        ],
      });
    });

    it('should decode a change with sectPr-only paragraph properties', () => {
      const sectPr = {
        name: 'w:sectPr',
        elements: [{ name: 'w:type', attributes: { 'w:val': 'nextPage' } }],
      };
      const superDocNode = {
        attrs: {
          change: {
            id: '7',
            author: 'Section Author',
            date: '2026-01-02T00:00:00Z',
            paragraphProperties: {
              sectPr,
            },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:pPrChange',
        type: 'element',
        attributes: {
          'w:id': '7',
          'w:author': 'Section Author',
          'w:date': '2026-01-02T00:00:00Z',
        },
        elements: [
          {
            name: 'w:pPr',
            type: 'element',
            attributes: {},
            elements: [sectPr],
          },
        ],
      });
    });

    it('should return undefined if change is missing', () => {
      const superDocNode = {
        attrs: {},
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('maintains consistency for a pPrChange with nested properties', () => {
      const initialChange = {
        id: '0',
        author: 'Luccas Correa',
        date: '2026-04-02T11:25:00Z',
        paragraphProperties: {
          styleId: 'ListParagraph',
          numberingProperties: { numId: 1 },
          indent: { hanging: 360 },
        },
      };

      const decoded = translator.decode({ node: { attrs: { change: initialChange } } });
      const encoded = translator.encode({ nodes: [decoded] });

      expect(encoded).toEqual(initialChange);
    });

    it('maintains consistency for a pPrChange with justification', () => {
      const initialChange = {
        id: '2',
        author: 'Another Author',
        date: '2026-03-15T10:00:00Z',
        paragraphProperties: {
          justification: 'center',
          spacing: { before: 200, after: 100 },
        },
      };

      const decoded = translator.decode({ node: { attrs: { change: initialChange } } });
      const encoded = translator.encode({ nodes: [decoded] });

      expect(encoded).toEqual(initialChange);
    });

    it('preserves an empty w:pPr when starting from XML', () => {
      const initialXml = {
        name: 'w:pPrChange',
        type: 'element',
        attributes: {
          'w:id': '10',
          'w:author': 'Empty pPr Round Trip',
          'w:date': '2026-01-05T00:00:00Z',
        },
        elements: [
          {
            name: 'w:pPr',
            type: 'element',
            attributes: {},
            elements: [],
          },
        ],
      };

      const encoded = translator.encode({ nodes: [initialXml] });
      const decoded = translator.decode({ node: { attrs: { change: encoded } } });

      expect(decoded).toEqual(initialXml);
    });

    it('maintains consistency for a pPrChange with sectPr-only paragraph properties', () => {
      const initialChange = {
        id: '9',
        author: 'Section Round Trip',
        date: '2026-01-04T00:00:00Z',
        paragraphProperties: {
          sectPr: {
            name: 'w:sectPr',
            elements: [{ name: 'w:type', attributes: { 'w:val': 'nextPage' } }],
          },
        },
      };

      const decoded = translator.decode({ node: { attrs: { change: initialChange } } });
      const encoded = translator.encode({ nodes: [decoded] });

      expect(encoded).toEqual(initialChange);
    });

    it('maintains consistency for a pPrChange with sectPr alongside other properties', () => {
      const initialChange = {
        id: '12',
        author: 'Mixed Round Trip',
        date: '2026-01-07T00:00:00Z',
        paragraphProperties: {
          justification: 'center',
          indent: { hanging: 360 },
          sectPr: {
            name: 'w:sectPr',
            elements: [{ name: 'w:type', attributes: { 'w:val': 'nextPage' } }],
          },
        },
      };

      const decoded = translator.decode({ node: { attrs: { change: initialChange } } });
      const encoded = translator.encode({ nodes: [decoded] });

      expect(encoded).toEqual(initialChange);
    });
  });
});
