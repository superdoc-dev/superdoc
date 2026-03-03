import { describe, it, expect } from 'vitest';
import { translator } from './styles-translator.js';
import { NodeTranslator } from '@translator';

describe('w:styles translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:styles');
      expect(translator.sdNodeOrKeyName).toBe('styles');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode docDefaults, latentStyles, and styles correctly', () => {
      const xmlNode = {
        name: 'w:styles',
        elements: [
          {
            name: 'w:latentStyles',
            attributes: {
              'w:defLockedState': '1',
              'w:defUIPriority': '99',
              'w:defSemiHidden': '0',
              'w:defUnhideWhenUsed': '1',
              'w:defQFormat': '1',
            },
            elements: [
              {
                name: 'w:lsdException',
                attributes: {
                  'w:name': 'NoList',
                  'w:locked': '1',
                  'w:qFormat': '1',
                  'w:semiHidden': '0',
                  'w:unhideWhenUsed': '1',
                  'w:uiPriority': '99',
                },
              },
            ],
          },
          {
            name: 'w:docDefaults',
            elements: [
              {
                name: 'w:rPrDefault',
                elements: [{ name: 'w:rPr', elements: [{ name: 'w:b' }] }],
              },
              {
                name: 'w:pPrDefault',
                elements: [{ name: 'w:pPr', elements: [{ name: 'w:keepNext' }] }],
              },
            ],
          },
          {
            name: 'w:style',
            attributes: { 'w:type': 'paragraph', 'w:styleId': 'Heading1' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Heading 1' } }],
          },
          {
            name: 'w:style',
            attributes: { 'w:type': 'character', 'w:styleId': 'Emphasis' },
            elements: [{ name: 'w:rPr', elements: [{ name: 'w:b' }] }],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        docDefaults: {
          runProperties: { bold: true },
          paragraphProperties: { keepNext: true },
        },
        latentStyles: {
          lsdExceptions: [
            {
              name: 'NoList',
              locked: true,
              qFormat: true,
              semiHidden: false,
              unhideWhenUsed: true,
              uiPriority: 99,
            },
          ],
          defLockedState: true,
          defUIPriority: 99,
          defSemiHidden: false,
          defUnhideWhenUsed: true,
          defQFormat: true,
        },
        styles: [
          {
            type: 'paragraph',
            styleId: 'Heading1',
            name: 'Heading 1',
          },
          {
            type: 'character',
            styleId: 'Emphasis',
            runProperties: { bold: true },
          },
        ],
      });
    });

    it('preserves document order for styles', () => {
      const xmlNode = {
        name: 'w:styles',
        elements: [
          {
            name: 'w:style',
            attributes: { 'w:styleId': 'B' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Beta' } }],
          },
          {
            name: 'w:style',
            attributes: { 'w:styleId': 'A' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Alpha' } }],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result.styles).toEqual([
        { styleId: 'B', name: 'Beta' },
        { styleId: 'A', name: 'Alpha' },
      ]);
    });

    it('preserves duplicate styleIds in the array', () => {
      const xmlNode = {
        name: 'w:styles',
        elements: [
          {
            name: 'w:style',
            attributes: { 'w:styleId': 'Dup' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'First' } }],
          },
          {
            name: 'w:style',
            attributes: { 'w:styleId': 'Dup' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Second' } }],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result.styles).toEqual([
        { styleId: 'Dup', name: 'First' },
        { styleId: 'Dup', name: 'Second' },
      ]);
    });

    it('should return an empty object when no elements are present', () => {
      const xmlNode = { name: 'w:styles', elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({});
    });

    it('should encode mc:Ignorable root attribute', () => {
      const xmlNode = {
        name: 'w:styles',
        attributes: { 'mc:Ignorable': 'w14 w15' },
        elements: [
          {
            name: 'w:style',
            attributes: { 'w:styleId': 'Normal' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Normal' } }],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });
      expect(result.Ignorable).toBe('w14 w15');
    });

    it('should roundtrip mc:Ignorable through encode → decode', () => {
      const xmlNode = {
        name: 'w:styles',
        attributes: { 'mc:Ignorable': 'w14 w15' },
        elements: [
          {
            name: 'w:style',
            attributes: { 'w:styleId': 'Normal' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Normal' } }],
          },
        ],
      };

      const encoded = translator.encode({ nodes: [xmlNode] });
      const decoded = translator.decode({ node: { attrs: { styles: encoded } } });

      expect(decoded.attributes['mc:Ignorable']).toBe('w14 w15');
    });
  });

  describe('decode', () => {
    it('should decode styles into w:styles elements', () => {
      const superDocNode = {
        attrs: {
          styles: {
            docDefaults: {
              runProperties: { bold: true },
              paragraphProperties: { keepNext: true },
            },
            latentStyles: {
              lsdExceptions: [
                {
                  name: 'NoList',
                  locked: true,
                  qFormat: true,
                  semiHidden: false,
                  unhideWhenUsed: true,
                  uiPriority: 99,
                },
              ],
              defLockedState: true,
              defUIPriority: 99,
              defSemiHidden: false,
              defUnhideWhenUsed: true,
              defQFormat: true,
            },
            styles: [
              {
                type: 'paragraph',
                styleId: 'Heading1',
                name: 'Heading 1',
              },
              {
                type: 'character',
                styleId: 'Emphasis',
                runProperties: { bold: true },
              },
            ],
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:styles');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          {
            name: 'w:docDefaults',
            type: 'element',
            attributes: {},
            elements: expect.arrayContaining([
              {
                name: 'w:rPrDefault',
                type: 'element',
                elements: [
                  { name: 'w:rPr', type: 'element', attributes: {}, elements: [{ name: 'w:b', attributes: {} }] },
                ],
              },
              {
                name: 'w:pPrDefault',
                type: 'element',
                elements: [
                  {
                    name: 'w:pPr',
                    type: 'element',
                    attributes: {},
                    elements: [{ name: 'w:keepNext', attributes: {} }],
                  },
                ],
              },
            ]),
          },
          {
            name: 'w:latentStyles',
            attributes: {
              'w:defLockedState': '1',
              'w:defUIPriority': '99',
              'w:defSemiHidden': '0',
              'w:defUnhideWhenUsed': '1',
              'w:defQFormat': '1',
            },
            elements: [
              {
                name: 'w:lsdException',
                attributes: {
                  'w:name': 'NoList',
                  'w:locked': '1',
                  'w:qFormat': '1',
                  'w:semiHidden': '0',
                  'w:unhideWhenUsed': '1',
                  'w:uiPriority': '99',
                },
              },
            ],
          },
          {
            name: 'w:style',
            type: 'element',
            attributes: { 'w:type': 'paragraph', 'w:styleId': 'Heading1' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Heading 1' } }],
          },
          {
            name: 'w:style',
            type: 'element',
            attributes: { 'w:type': 'character', 'w:styleId': 'Emphasis' },
            elements: [{ name: 'w:rPr', type: 'element', attributes: {}, elements: [{ name: 'w:b', attributes: {} }] }],
          },
        ]),
      );
    });

    it('should return undefined if no styles are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
