import { describe, it, expect } from 'vitest';
import { NodeTranslator } from '@translator';
import { translator } from './tblStylePr-translator.js';

describe('w:tblStylePr translator', () => {
  describe('config', () => {
    it('exports a NodeTranslator instance', () => {
      expect(translator).toBeDefined();
      expect(translator).toBeInstanceOf(NodeTranslator);
      expect(translator.xmlName).toBe('w:tblStylePr');
      expect(translator.sdNodeOrKeyName).toBe('tableStyleProperties');
    });
  });

  describe('encode', () => {
    it('encodes nested <w:tblPr> and <w:tcPr> correctly', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblStylePr',
            elements: [
              {
                name: 'w:tblPr',
                elements: [
                  { name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } },
                  { name: 'w:tblW', attributes: { 'w:w': '5000', 'w:type': 'pct' } },
                  { name: 'w:jc', attributes: { 'w:val': 'center' } },
                ],
              },
              {
                name: 'w:tcPr',
                elements: [
                  { name: 'w:tcW', attributes: { 'w:w': '2000', 'w:type': 'dxa' } },
                  { name: 'w:gridSpan', attributes: { 'w:val': '2' } },
                  { name: 'w:noWrap' },
                ],
              },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result).toEqual({
        tableProperties: {
          tableStyleId: 'TableGrid',
          tableWidth: { value: 5000, type: 'pct' },
          justification: 'center',
        },
        tableCellProperties: {
          cellWidth: { value: 2000, type: 'dxa' },
          gridSpan: 2,
          noWrap: true,
        },
      });
    });

    it('returns undefined when no nested properties are encoded', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblStylePr',
            elements: [
              { name: 'w:tblPr', elements: [{ name: 'w:tblW', attributes: {} }] },
              { name: 'w:tcPr', elements: [{ name: 'w:tcW', attributes: {} }] },
            ],
          },
        ],
      };

      expect(translator.encode(params)).toBeUndefined();
    });

    it('encodes when at least one nested property group is present', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblStylePr',
            elements: [
              {
                name: 'w:tblPr',
                elements: [{ name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } }],
              },
            ],
          },
        ],
      };

      expect(translator.encode(params)).toEqual({
        tableProperties: { tableStyleId: 'TableGrid' },
      });
    });
  });

  describe('decode', () => {
    it('decodes a complex tableStyleProperties object correctly', () => {
      const tableStyleProperties = {
        tableProperties: {
          tableStyleId: 'TableGrid',
          tableWidth: { value: 5000, type: 'pct' },
          justification: 'center',
        },
        tableCellProperties: {
          cellWidth: { value: 2000, type: 'dxa' },
          gridSpan: 2,
          noWrap: true,
        },
      };

      const result = translator.decode({ node: { attrs: { tableStyleProperties } } });

      expect(result).toEqual({
        name: 'w:tblStylePr',
        type: 'element',
        attributes: {},
        elements: expect.arrayContaining([
          {
            name: 'w:tblPr',
            type: 'element',
            attributes: {},
            elements: expect.arrayContaining([
              { name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } },
              { name: 'w:tblW', attributes: { 'w:w': '5000', 'w:type': 'pct' } },
              { name: 'w:jc', attributes: { 'w:val': 'center' } },
            ]),
          },
          {
            name: 'w:tcPr',
            type: 'element',
            attributes: {},
            elements: expect.arrayContaining([
              { name: 'w:tcW', attributes: { 'w:w': '2000', 'w:type': 'dxa' } },
              { name: 'w:gridSpan', attributes: { 'w:val': '2' } },
              { name: 'w:noWrap', attributes: { 'w:val': '1' } },
            ]),
          },
        ]),
      });
    });

    it('handles missing tableStyleProperties object', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });

    it('handles empty tableStyleProperties object', () => {
      expect(translator.decode({ node: { attrs: { tableStyleProperties: {} } } })).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('maintains consistency for a complex object', () => {
      const tableStyleProperties = {
        tableProperties: {
          tableStyleId: 'TableGrid',
          tableWidth: { value: 5000, type: 'pct' },
          justification: 'center',
        },
        tableCellProperties: {
          cellWidth: { value: 2000, type: 'dxa' },
          gridSpan: 2,
          noWrap: true,
        },
      };

      const decodedResult = translator.decode({ node: { attrs: { tableStyleProperties } } });
      const encodedResult = translator.encode({ nodes: [decodedResult] });

      expect(encodedResult).toEqual(tableStyleProperties);
    });
  });
});
