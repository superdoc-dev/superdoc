import { describe, it, expect } from 'vitest';
import { translator } from './numbering-translator.js';
import { NodeTranslator } from '@translator';

describe('w:numbering translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:numbering');
      expect(translator.sdNodeOrKeyName).toBe('numbering');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode numbering properties correctly', () => {
      const xmlNode = {
        name: 'w:numbering',
        elements: [
          { name: 'w:nsid', attributes: { 'w:val': '10' } },
          { name: 'w:tmpl', attributes: { 'w:val': '20' } },
          { name: 'w:name', attributes: { 'w:val': 'List Numbering' } },
          { name: 'w:styleLink', attributes: { 'w:val': 'ListStyle' } },
          { name: 'w:numStyleLink', attributes: { 'w:val': 'ListNumStyle' } },
          { name: 'w:multiLevelType', attributes: { 'w:val': 'multilevel' } },
          {
            name: 'w:abstractNum',
            attributes: { 'w:abstractNumId': '1' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Abstract List' } }],
          },
          {
            name: 'w:num',
            attributes: { 'w:numId': '5' },
            elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': '1' } }],
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        nsid: 10,
        tmpl: 20,
        name: 'List Numbering',
        styleLink: 'ListStyle',
        numStyleLink: 'ListNumStyle',
        multiLevelType: 'multilevel',
        abstracts: {
          1: {
            abstractNumId: 1,
            name: 'Abstract List',
          },
        },
        definitions: {
          5: {
            numId: 5,
            abstractNumId: 1,
          },
        },
      });
    });

    it('should return an empty object when no elements are present', () => {
      const xmlNode = { name: 'w:numbering', elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({});
    });
  });

  describe('decode', () => {
    it('should decode numbering into w:numbering elements', () => {
      const superDocNode = {
        attrs: {
          abstractNum: {
            nsid: 10,
            tmpl: 20,
            name: 'List Numbering',
            styleLink: 'ListStyle',
            numStyleLink: 'ListNumStyle',
            multiLevelType: 'multilevel',
            abstracts: {
              1: {
                abstractNumId: 1,
                name: 'Abstract List',
              },
            },
            definitions: {
              5: {
                numId: 5,
                abstractNumId: 1,
              },
            },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:numbering');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          { name: 'w:nsid', attributes: { 'w:val': '10' } },
          { name: 'w:tmpl', attributes: { 'w:val': '20' } },
          { name: 'w:name', attributes: { 'w:val': 'List Numbering' } },
          { name: 'w:styleLink', attributes: { 'w:val': 'ListStyle' } },
          { name: 'w:numStyleLink', attributes: { 'w:val': 'ListNumStyle' } },
          { name: 'w:multiLevelType', attributes: { 'w:val': 'multilevel' } },
          {
            name: 'w:abstractNum',
            type: 'element',
            attributes: { 'w:abstractNumId': '1' },
            elements: [{ name: 'w:name', attributes: { 'w:val': 'Abstract List' } }],
          },
          {
            name: 'w:num',
            type: 'element',
            attributes: { 'w:numId': '5' },
            elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': '1' } }],
          },
        ]),
      );
    });

    it('should return undefined if no abstractNum is present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
