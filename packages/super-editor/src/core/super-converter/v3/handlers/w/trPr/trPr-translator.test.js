// @ts-check
import { describe, it, expect } from 'vitest';
import { translator } from './trPr-translator.js';
import { NodeTranslator } from '@translator';

describe('w:trPr translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:trPr');
      expect(translator.sdNodeOrKeyName).toBe('tableRowProperties');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('encodes a complex <w:trPr> element correctly', () => {
      const params = {
        nodes: [
          {
            name: 'w:trPr',
            elements: [
              { name: 'w:cantSplit' },
              {
                name: 'w:cnfStyle',
                attributes: { 'w:firstRow': '1', 'w:lastRow': '0', 'w:firstColumn': 'true', 'w:lastColumn': 'false' },
              },
              { name: 'w:divId', attributes: { 'w:val': '12345' } },
              { name: 'w:gridAfter', attributes: { 'w:val': '2' } },
              { name: 'w:gridBefore', attributes: { 'w:val': '1' } },
              { name: 'w:hidden' },
              { name: 'w:jc', attributes: { 'w:val': 'center' } },
              { name: 'w:tblCellSpacing', attributes: { 'w:w': '10', 'w:type': 'dxa' } },
              { name: 'w:tblHeader' },
              { name: 'w:trHeight', attributes: { 'w:val': '100', 'w:hRule': 'auto' } },
              { name: 'w:wAfter', attributes: { 'w:w': '50', 'w:type': 'pct' } },
              { name: 'w:wBefore', attributes: { 'w:w': '30', 'w:type': 'auto' } },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result).toEqual({
        cantSplit: true,
        cnfStyle: {
          firstRow: true,
          lastRow: false,
          firstColumn: true,
          lastColumn: false,
        },
        divId: '12345',
        gridAfter: 2,
        gridBefore: 1,
        hidden: true,
        justification: 'center',
        tableCellSpacing: { value: 10, type: 'dxa' },
        repeatHeader: true,
        rowHeight: { value: 100, rule: 'auto' },
        wAfter: { value: 50, type: 'pct' },
        wBefore: { value: 30, type: 'auto' },
      });
    });

    it('handles missing and empty elements gracefully', () => {
      const params = {
        nodes: [
          {
            name: 'w:trPr',
            elements: [
              { name: 'w:cnfStyle', attributes: {} },
              { name: 'w:divId', attributes: {} },
              { name: 'w:gridAfter', attributes: {} },
              { name: 'w:gridBefore', attributes: {} },
              { name: 'w:jc', attributes: {} },
              { name: 'w:tblCellSpacing', attributes: {} },
              { name: 'w:trHeight', attributes: {} },
              { name: 'w:wAfter', attributes: {} },
              { name: 'w:wBefore', attributes: {} },
            ],
          },
        ],
      };

      const attributes = translator.encode(params);

      expect(attributes.cantSplit).toBe(false);
      expect(attributes.cnfStyle).toBeUndefined({});
      expect(attributes.divId).toBeUndefined();
      expect(attributes.gridAfter).toBeUndefined();
      expect(attributes.gridBefore).toBeUndefined();
      expect(attributes.hidden).toBe(false);
      expect(attributes.justification).toBeUndefined();
      expect(attributes.tblCellSpacing).toBeUndefined();
      expect(attributes.repeatHeader).toBe(false);
      expect(attributes.rowHeight).toBeUndefined();
      expect(attributes.wAfter).toBeUndefined();
      expect(attributes.wBefore).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('decodes a complex tableRowProperties object correctly', () => {
      const params = {
        node: {
          attrs: {
            tableRowProperties: {
              cantSplit: true,
              cnfStyle: {
                firstRow: true,
                lastRow: false,
                firstColumn: true,
                lastColumn: false,
              },
              divId: '12345',
              gridAfter: 2,
              gridBefore: 1,
              hidden: true,
              justification: 'center',
              tableCellSpacing: { value: 13, type: 'dxa' },
              repeatHeader: true,
              rowHeight: { value: 100, rule: 'auto' },
              wAfter: { value: 50, type: 'pct' },
              wBefore: { value: 30, type: 'auto' },
            },
          },
        },
      };

      const result = translator.decode(params);

      expect(result.name).toBe('w:trPr');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          { name: 'w:cantSplit', attributes: {} },
          {
            name: 'w:cnfStyle',
            attributes: { 'w:firstRow': '1', 'w:lastRow': '0', 'w:firstColumn': '1', 'w:lastColumn': '0' },
          },
          { name: 'w:divId', attributes: { 'w:val': '12345' } },
          { name: 'w:gridAfter', attributes: { 'w:val': '2' } },
          { name: 'w:gridBefore', attributes: { 'w:val': '1' } },
          { name: 'w:hidden', attributes: {} },
          { name: 'w:jc', attributes: { 'w:val': 'center' } },
          { name: 'w:tblCellSpacing', attributes: { 'w:w': '13', 'w:type': 'dxa' } },
          { name: 'w:tblHeader', attributes: {} },
          { name: 'w:trHeight', attributes: { 'w:val': '100', 'w:hRule': 'auto' } },
          { name: 'w:wAfter', attributes: { 'w:w': '50', 'w:type': 'pct' } },
          { name: 'w:wBefore', attributes: { 'w:w': '30', 'w:type': 'auto' } },
        ]),
      );
      expect(result.elements.length).toBe(12);
    });

    it('handles missing and falsy properties gracefully', () => {
      const params = {
        node: {
          attrs: {
            tableRowProperties: {
              cantSplit: false,
              repeatHeader: false,
              // other properties are undefined
            },
          },
        },
      };

      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });

    it('handles empty tableRowProperties object', () => {
      const params = {
        node: {
          attrs: {
            tableRowProperties: {},
          },
        },
      };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });

    it('handles missing tableRowProperties object', () => {
      const params = {
        node: {
          attrs: {},
        },
      };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });

    it('handles NaN values for numeric properties', () => {
      const params = {
        node: {
          attrs: {
            tableRowProperties: {
              rowHeight: {},
              wAfter: {},
              wBefore: {},
              tblCellSpacing: {},
            },
          },
        },
      };
      const result = translator.decode(params);
      expect(result).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('maintains consistency for a complex object', () => {
      const tableRowProperties = {
        cantSplit: true,
        cnfStyle: { firstRow: true, lastColumn: false, evenHBand: true },
        divId: '123',
        gridAfter: 1,
        gridBefore: 0,
        hidden: true,
        justification: 'center',
        tableCellSpacing: { value: 10, type: 'dxa' },
        repeatHeader: true,
        rowHeight: { value: 100, rule: 'auto' },
        wAfter: { value: 5, type: 'pct' },
        wBefore: { value: 5, type: 'auto' },
      };

      const decodedResult = translator.decode({ node: { attrs: { tableRowProperties } } });
      const encodeParams = { nodes: [decodedResult] };
      const encodedResult = translator.encode(encodeParams);

      expect(encodedResult).toEqual(tableRowProperties);
    });
  });
});
