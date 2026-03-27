// @ts-check
import { describe, it, expect } from 'vitest';
import { translator } from './tcPr-translator.js';
import { NodeTranslator } from '@translator';

describe('w:tcPr translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tcPr');
      expect(translator.sdNodeOrKeyName).toBe('tableCellProperties');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('encodes a complex <w:tcPr> element correctly', () => {
      const params = {
        nodes: [
          {
            name: 'w:tcPr',
            elements: [
              {
                name: 'w:cnfStyle',
                attributes: { 'w:firstRow': '1', 'w:lastRow': '0', 'w:firstColumn': 'true', 'w:lastColumn': 'false' },
              },
              { name: 'w:tcW', attributes: { 'w:w': '2000', 'w:type': 'dxa' } },
              { name: 'w:gridSpan', attributes: { 'w:val': '2' } },
              { name: 'w:vMerge', attributes: { 'w:val': 'restart' } },
              { name: 'w:tcBorders', elements: [{ name: 'w:top', attributes: { 'w:val': 'single', 'w:sz': '4' } }] },
              { name: 'w:shd', attributes: { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': 'ABCDEF' } },
              { name: 'w:noWrap' },
              { name: 'w:tcMar', elements: [{ name: 'w:top', attributes: { 'w:w': '100' } }] },
              { name: 'w:textDirection', attributes: { 'w:val': 'btLr' } },
              { name: 'w:tcFitText' },
              { name: 'w:vAlign', attributes: { 'w:val': 'center' } },
              { name: 'w:hideMark' },
              { name: 'w:headers', elements: [{ name: 'w:header', attributes: { 'w:val': 'h1' } }] },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result).toEqual({
        cnfStyle: { firstRow: true, lastRow: false, firstColumn: true, lastColumn: false },
        cellWidth: { value: 2000, type: 'dxa' },
        gridSpan: 2,
        vMerge: 'restart',
        borders: { top: { val: 'single', size: 4 } },
        shading: { val: 'clear', color: 'auto', fill: 'ABCDEF' },
        noWrap: true,
        cellMargins: { marginTop: { value: 100 } },
        textDirection: 'btLr',
        tcFitText: true,
        vAlign: 'center',
        hideMark: true,
        headers: [{ header: 'h1' }],
      });
    });

    it('handles missing and empty elements gracefully', () => {
      const params = {
        nodes: [
          {
            name: 'w:tcPr',
            elements: [
              { name: 'w:cnfStyle', attributes: {} },
              { name: 'w:tcW', attributes: {} },
              { name: 'w:gridSpan', attributes: {} },
              { name: 'w:tcBorders', elements: [] },
              { name: 'w:shd', attributes: {} },
              { name: 'w:tcMar', elements: [] },
              { name: 'w:textDirection', attributes: {} },
              { name: 'w:vAlign', attributes: {} },
              { name: 'w:headers', elements: [] },
            ],
          },
        ],
      };

      const attributes = translator.encode(params);

      expect(attributes.cnfStyle).toBeUndefined();
      expect(attributes.cellWidth).toBeUndefined();
      expect(attributes.gridSpan).toBeUndefined();
      expect(attributes.borders).toBeUndefined();
      expect(attributes.shading).toBeUndefined();
      expect(attributes.noWrap).toBeUndefined();
      expect(attributes.cellMargins).toBeUndefined();
      expect(attributes.textDirection).toBeUndefined();
      expect(attributes.tcFitText).toBeUndefined();
      expect(attributes.vAlign).toBeUndefined();
      expect(attributes.hideMark).toBeUndefined();
      expect(attributes.headers).toEqual([]);
    });
  });

  describe('decode', () => {
    it('decodes a complex tableCellProperties object correctly', () => {
      const tableCellProperties = {
        cnfStyle: { firstRow: true, lastRow: false, firstColumn: true, lastColumn: false },
        cellWidth: { value: 2000, type: 'dxa' },
        gridSpan: 2,
        vMerge: 'restart',
        borders: { top: { val: 'single', size: 4 } },
        shading: { val: 'clear', color: 'auto', fill: 'ABCDEF' },
        noWrap: true,
        cellMargins: { marginTop: { value: 100 } },
        textDirection: 'btLr',
        tcFitText: true,
        vAlign: 'center',
        hideMark: true,
        headers: [{ header: 'h1' }],
      };
      const params = {
        node: {
          attrs: {
            tableCellProperties,
          },
        },
      };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tcPr');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          {
            name: 'w:cnfStyle',
            attributes: { 'w:firstRow': '1', 'w:lastRow': '0', 'w:firstColumn': '1', 'w:lastColumn': '0' },
          },
          { name: 'w:tcW', attributes: { 'w:w': '2000', 'w:type': 'dxa' } },
          { name: 'w:gridSpan', attributes: { 'w:val': '2' } },
          { name: 'w:vMerge', attributes: { 'w:val': 'restart' } },
          {
            name: 'w:tcBorders',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:top', attributes: { 'w:val': 'single', 'w:sz': '4' } }],
          },
          { name: 'w:shd', attributes: { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': 'ABCDEF' } },
          { name: 'w:noWrap', attributes: { 'w:val': '1' } },
          {
            name: 'w:tcMar',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:top', attributes: { 'w:w': '100' } }],
          },
          { name: 'w:textDirection', attributes: { 'w:val': 'btLr' } },
          { name: 'w:tcFitText', attributes: { 'w:val': '1' } },
          { name: 'w:vAlign', attributes: { 'w:val': 'center' } },
          { name: 'w:hideMark', attributes: { 'w:val': '1' } },
          { name: 'w:headers', attributes: {}, elements: [{ name: 'w:header', attributes: { 'w:val': 'h1' } }] },
        ]),
      );
      expect(result.elements.length).toBe(13);
    });

    it('handles missing tableCellProperties object', () => {
      const params = { node: { attrs: {} } };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });

    it('handles empty tableCellProperties object', () => {
      const params = { node: { attrs: { tableCellProperties: {} } } };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('maintains consistency for a complex object', () => {
      const tableCellProperties = {
        cnfStyle: { firstRow: true, lastColumn: false, evenHBand: true },
        cellWidth: { value: 2000, type: 'dxa' },
        gridSpan: 2,
        vMerge: 'restart',
        borders: { top: { val: 'single', size: 4, color: '#000000', shadow: false, frame: false } },
        shading: { val: 'clear', color: 'auto', fill: 'ABCDEF' },
        noWrap: true,
        cellMargins: { marginTop: { value: 100 } },
        textDirection: 'btLr',
        tcFitText: true,
        vAlign: 'center',
        hideMark: true,
        headers: [{ header: 'h1' }],
      };

      const decodedResult = translator.decode({ node: { attrs: { tableCellProperties } } });
      const encodeParams = { nodes: [decodedResult] };
      const encodedResult = translator.encode(encodeParams);

      expect(encodedResult).toEqual(tableCellProperties);
    });
  });
});
