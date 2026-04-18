// @ts-check
import { describe, it, expect } from 'vitest';
import { translator } from './tblPr-translator.js';
import { NodeTranslator } from '@translator';

describe('w:tblPr translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tblPr');
      expect(translator.sdNodeOrKeyName).toBe('tableProperties');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('encodes a complex <w:tblPr> element correctly', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblPr',
            elements: [
              { name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } },
              { name: 'w:tblW', attributes: { 'w:w': '5000', 'w:type': 'pct' } },
              { name: 'w:jc', attributes: { 'w:val': 'center' } },
              { name: 'w:tblInd', attributes: { 'w:w': '144', 'w:type': 'dxa' } },
              { name: 'w:tblLook', attributes: { 'w:firstRow': '1', 'w:noHBand': '1' } },
              {
                name: 'w:tblBorders',
                elements: [
                  { name: 'w:top', attributes: { 'w:val': 'single', 'w:sz': '4' } },
                  { name: 'w:left', attributes: { 'w:val': 'double', 'w:sz': '8' } },
                ],
              },
              {
                name: 'w:tblCellMar',
                elements: [{ name: 'w:top', attributes: { 'w:w': '360', 'w:type': 'dxa' } }],
              },
              { name: 'w:bidiVisual' },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result).toEqual({
        tableStyleId: 'TableGrid',
        tableWidth: { value: 5000, type: 'pct' },
        justification: 'center',
        tableIndent: { value: 144, type: 'dxa' },
        tblLook: {
          firstRow: true,
          noHBand: true,
        },
        borders: {
          top: { val: 'single', size: 4 },
          left: { val: 'double', size: 8 },
        },
        cellMargins: {
          marginTop: { value: 360, type: 'dxa' },
        },
        rightToLeft: true,
      });
    });

    it('handles missing and empty elements gracefully', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblPr',
            elements: [
              { name: 'w:tblW', attributes: {} },
              { name: 'w:jc', attributes: {} },
              { name: 'w:tblLook', attributes: {} },
            ],
          },
        ],
      };

      const attributes = translator.encode(params);

      expect(attributes).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes a complex tableProperties object correctly', () => {
      const params = {
        node: {
          attrs: {
            tableProperties: {
              tableStyleId: 'TableGrid',
              tableWidth: { value: 5000, type: 'pct' },
              justification: 'center',
              tableIndent: { value: 144, type: 'dxa' },
              tblLook: { firstRow: true, noHBand: true },
              borders: {
                top: { val: 'single', size: 4 },
                left: { val: 'double', size: 8 },
              },
              cellMargins: {
                marginTop: { value: 360, type: 'dxa' },
              },
              rightToLeft: true,
            },
          },
        },
      };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tblPr');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          { name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } },
          { name: 'w:tblW', attributes: { 'w:w': '5000', 'w:type': 'pct' } },
          { name: 'w:jc', attributes: { 'w:val': 'center' } },
          { name: 'w:tblInd', attributes: { 'w:w': '144', 'w:type': 'dxa' } },
          {
            name: 'w:tblLook',
            attributes: {
              'w:firstRow': '1',
              'w:noHBand': '1',
            },
          },
          {
            name: 'w:tblBorders',
            type: 'element',
            attributes: {},
            elements: [
              {
                name: 'w:top',
                attributes: { 'w:val': 'single', 'w:sz': '4' },
              },
              {
                name: 'w:left',
                attributes: { 'w:val': 'double', 'w:sz': '8' },
              },
            ],
          },
          {
            name: 'w:tblCellMar',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:top', attributes: { 'w:w': '360', 'w:type': 'dxa' } }],
          },
          { name: 'w:bidiVisual', attributes: {} },
        ]),
      );
    });

    it('handles missing tableProperties object', () => {
      const params = { node: { attrs: {} } };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });

    it('handles empty tableProperties object', () => {
      const params = { node: { attrs: { tableProperties: {} } } };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('maintains consistency for a complex object', () => {
      const initialTableProperties = {
        tableStyleId: 'TableGrid',
        tableWidth: { value: 5000, type: 'pct' },
        justification: 'center',
        tableIndent: { value: 144, type: 'dxa' },
        tblLook: { firstRow: true, noHBand: true },
        borders: {
          top: { val: 'single', size: 4, frame: false, shadow: false },
          left: { val: 'double', size: 8, frame: false, shadow: false },
        },
        rightToLeft: true,
      };

      const decodedResult = translator.decode({
        node: { attrs: { tableProperties: initialTableProperties } },
      });
      const encodeParams = { nodes: [decodedResult] };
      const encodedResult = translator.encode(encodeParams);

      const expectedTableProperties = {
        ...initialTableProperties,
        tblLook: {
          firstRow: true,
          noHBand: true,
        },
      };

      // Remove undefined properties from borders for comparison
      const borders = encodedResult.borders;
      if (borders) {
        Object.keys(borders).forEach((borderKey) => {
          Object.keys(borders[borderKey]).forEach((key) => {
            if (borders[borderKey][key] === undefined) {
              delete borders[borderKey][key];
            }
          });
        });
      }

      expect(encodedResult).toEqual(expectedTableProperties);
    });
  });
});
