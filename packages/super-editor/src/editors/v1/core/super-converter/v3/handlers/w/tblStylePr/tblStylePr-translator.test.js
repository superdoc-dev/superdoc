import { describe, it, expect } from 'vitest';
import { translator } from './tblStylePr-translator.js';
import { NodeTranslator } from '@translator';

describe('w:tblStylePr translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tblStylePr');
      expect(translator.sdNodeOrKeyName).toBe('tableStyleProperties');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode nested table style properties correctly', () => {
      const xmlNode = {
        name: 'w:tblStylePr',
        attributes: { 'w:type': 'wholeTable' },
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:keepNext' }, { name: 'w:pStyle', attributes: { 'w:val': 'Heading1' } }],
          },
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
          { name: 'w:tblPr', elements: [{ name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } }] },
          {
            name: 'w:trPr',
            elements: [
              { name: 'w:tblHeader' },
              { name: 'w:trHeight', attributes: { 'w:val': '240', 'w:hRule': 'atLeast' } },
            ],
          },
          { name: 'w:tcPr', elements: [{ name: 'w:vAlign', attributes: { 'w:val': 'center' } }] },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        paragraphProperties: { keepNext: true, styleId: 'Heading1' },
        runProperties: { bold: true },
        tableProperties: { tableStyleId: 'TableGrid' },
        tableRowProperties: {
          cantSplit: false,
          hidden: false,
          repeatHeader: true,
          rowHeight: { value: 240, rule: 'atLeast' },
        },
        tableCellProperties: { vAlign: 'center' },
        type: 'wholeTable',
      });
    });

    it('should return undefined if no child properties are present', () => {
      const xmlNode = { name: 'w:tblStylePr', elements: [] };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('should decode a tableStyleProperties object correctly', () => {
      const superDocNode = {
        attrs: {
          tableStyleProperties: {
            type: 'wholeTable',
            paragraphProperties: { keepNext: true, styleId: 'Heading1' },
            runProperties: { bold: true },
            tableProperties: { tableStyleId: 'TableGrid' },
            tableRowProperties: { repeatHeader: true, rowHeight: { value: 240, rule: 'atLeast' } },
            tableCellProperties: { vAlign: 'center' },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:tblStylePr');
      expect(result.attributes).toEqual({ 'w:type': 'wholeTable' });
      expect(result.elements).toEqual(
        expect.arrayContaining([
          {
            name: 'w:pPr',
            type: 'element',
            attributes: {},
            elements: [
              { name: 'w:keepNext', attributes: {} },
              { name: 'w:pStyle', attributes: { 'w:val': 'Heading1' } },
            ],
          },
          {
            name: 'w:rPr',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:b', attributes: {} }],
          },
          {
            name: 'w:tblPr',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } }],
          },
          {
            name: 'w:trPr',
            type: 'element',
            attributes: {},
            elements: [
              { name: 'w:tblHeader', attributes: {} },
              { name: 'w:trHeight', attributes: { 'w:val': '240', 'w:hRule': 'atLeast' } },
            ],
          },
          {
            name: 'w:tcPr',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:vAlign', attributes: { 'w:val': 'center' } }],
          },
        ]),
      );
    });

    it('should return undefined if no tableStyleProperties are present', () => {
      const result = translator.decode({ node: { attrs: {} } });
      expect(result).toBeUndefined();
    });
  });
});
