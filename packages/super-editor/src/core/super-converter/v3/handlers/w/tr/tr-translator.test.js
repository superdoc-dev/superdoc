// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@core/super-converter/helpers.js', () => ({
  twipsToPixels: vi.fn((val) => (val ? parseInt(val, 10) / 20 : 0)),
  pixelsToTwips: vi.fn((val) => (val ? Math.round(val * 20) : 0)),
  eighthPointsToPixels: vi.fn((val) => (val != null ? parseInt(val, 10) / 8 : 0)),
}));

vi.mock('@core/super-converter/v2/exporter/helpers/index.js', () => ({
  translateChildNodes: vi.fn(() => [{ name: 'w:tc', comment: 'mocked cell' }]),
}));

vi.mock('../tc', () => ({
  translator: {
    encode: vi.fn((params) => {
      const tcNode = params.extraParams.node;
      const tcPr = tcNode.elements?.find((el) => el.name === 'w:tcPr');
      const gridSpan = tcPr?.elements?.find((el) => el.name === 'w:gridSpan');
      const colspan = gridSpan?.attributes['w:val'] || '1';
      return {
        type: 'tableCell',
        attrs: {
          from: 'tcTranslator',
          columnIndex: params.extraParams.columnIndex,
          columnWidth: params.extraParams.columnWidth,
          colspan: parseInt(colspan, 10),
        },
      };
    }),
  },
}));

vi.mock('../tblBorders', () => ({
  translator: {
    encode: vi.fn(() => ({})),
  },
}));

vi.mock('../trPr', () => ({
  translator: {
    encode: vi.fn(() => ({ encoded: 'trPr' })),
    decode: vi.fn(() => ({ name: 'w:trPr', comment: 'mocked trPr' })),
  },
}));

import { translator } from './tr-translator.js';
import { NodeTranslator } from '@translator';
import { translator as tcTranslator } from '../tc';
import { translator as tblBordersTranslator } from '../tblBorders';
import { translator as trPrTranslator } from '../trPr';
import { translateChildNodes } from '@core/super-converter/v2/exporter/helpers/index.js';

describe('w:tr translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('config and attributes', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tr');
      expect(translator.sdNodeOrKeyName).toBe('tableRow');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });

    it('creates a simple one-to-one mapping for w:rsidR', () => {
      const handler = translator.attributes.find((a) => a.sdName === 'rsidR');
      expect(handler.xmlName).toBe('w:rsidR');
      expect(handler.encode({ 'w:rsidR': 'foo' })).toBe('foo');
      expect(handler.decode({ rsidR: 'foo' })).toBe('foo');
    });

    it('creates a simple one-to-one mapping for w14:paraId', () => {
      const handler = translator.attributes.find((a) => a.sdName === 'paraId');
      expect(handler.xmlName).toBe('w14:paraId');
      expect(handler.encode({ 'w14:paraId': 'bar' })).toBe('bar');
      expect(handler.decode({ paraId: 'bar' })).toBe('bar');
    });
  });

  describe('encode', () => {
    const mockTable = {
      name: 'w:tbl',
      elements: [
        {
          name: 'w:tblGrid',
          elements: [
            { name: 'w:gridCol', attributes: { 'w:w': '2000' } }, // 100px
            { name: 'w:gridCol', attributes: { 'w:w': '3000' } }, // 150px
            { name: 'w:gridCol', attributes: { 'w:w': '4000' } }, // 200px
          ],
        },
      ],
    };

    const mockRow = {
      name: 'w:tr',
      attributes: { 'w:rsidR': '123' },
      elements: [
        { name: 'w:trPr', elements: [] },
        { name: 'w:tc', elements: [] }, // cell 1
        {
          name: 'w:tc', // cell 2, with colspan 2
          elements: [{ name: 'w:tcPr', elements: [{ name: 'w:gridSpan', attributes: { 'w:val': '2' } }] }],
        },
        { name: 'w:tc', elements: [] }, // cell 3 (should be processed at index 3)
      ],
    };

    it('should encode a <w:tr> element correctly', () => {
      const params = {
        nodes: [mockRow],
        extraParams: { row: mockRow, columnWidths: [2000 / 20, 3000 / 20, 4000 / 20] },
        // other params if needed
      };
      const encodedAttrs = { rsidR: '123' };

      const result = translator.encode(params, encodedAttrs);

      // Check top-level structure
      expect(result.type).toBe('tableRow');
      expect(result.attrs.rsidR).toBe('123');

      // Check trPr encoding
      expect(trPrTranslator.encode).toHaveBeenCalledTimes(1);
      expect(result.attrs.tableRowProperties).toEqual({ encoded: 'trPr' });

      // Check tc encoding
      expect(tcTranslator.encode).toHaveBeenCalledTimes(3);
      expect(result.content).toHaveLength(3);

      // Check first cell
      expect(tcTranslator.encode).toHaveBeenCalledWith(
        expect.objectContaining({
          extraParams: expect.objectContaining({
            node: mockRow.elements[1],
            columnIndex: 0,
            columnWidth: 100,
          }),
        }),
      );
      expect(result.content[0].attrs).toEqual({
        from: 'tcTranslator',
        columnIndex: 0,
        columnWidth: 100,
        colspan: 1,
      });

      // Check second cell (with colspan)
      expect(tcTranslator.encode).toHaveBeenCalledWith(
        expect.objectContaining({
          extraParams: expect.objectContaining({
            node: mockRow.elements[2],
            columnIndex: 1,
            columnWidth: 150,
          }),
        }),
      );
      expect(result.content[1].attrs).toEqual({
        from: 'tcTranslator',
        columnIndex: 1,
        columnWidth: 150,
        colspan: 2,
      });

      // Check third cell (index is advanced by colspan)
      expect(tcTranslator.encode).toHaveBeenCalledWith(
        expect.objectContaining({
          extraParams: expect.objectContaining({
            node: mockRow.elements[3],
            columnIndex: 3,
            columnWidth: null, // No gridCol at this index
          }),
        }),
      );
      expect(result.content[2].attrs).toEqual({
        from: 'tcTranslator',
        columnIndex: 3,
        columnWidth: null,
        colspan: 1,
      });
    });

    it('handles rows with no cells or properties', () => {
      const emptyRow = { name: 'w:tr', elements: [] };
      const params = { extraParams: { row: emptyRow, table: mockTable } };
      const result = translator.encode(params, {});

      expect(result.type).toBe('tableRow');
      expect(result.content).toEqual([]);
      expect(result.attrs.tableRowProperties).toEqual({});
      expect(trPrTranslator.encode).not.toHaveBeenCalled();
      expect(tcTranslator.encode).not.toHaveBeenCalled();
    });

    it('merges w:trPr/w:tblPrEx/w:tblBorders into tableBorders passed to cells', () => {
      const baseTableBorders = {
        top: { size: 0.5, val: 'single' },
      };

      const tblBorders = {
        name: 'w:tblBorders',
        elements: [{ name: 'w:top', attributes: { 'w:val': 'nil' } }],
      };

      const mockRowWithOverride = {
        name: 'w:tr',
        elements: [
          {
            name: 'w:tblPrEx',
            elements: [tblBorders],
          },
          { name: 'w:tc', elements: [] },
        ],
      };

      tblBordersTranslator.encode.mockReturnValue({
        top: { val: 'none' },
      });

      const params = {
        nodes: [mockRowWithOverride],
        extraParams: {
          row: mockRowWithOverride,
          rowBorders: baseTableBorders,
          columnWidths: [100],
          activeRowSpans: [],
        },
      };

      translator.encode(params, {});

      const firstCellCall = tcTranslator.encode.mock.calls[0][0];
      expect(firstCellCall.extraParams.rowBorders.top).toEqual({ val: 'none' });
    });
  });

  describe('decode', () => {
    it('should decode a tableRow node with properties', () => {
      const mockNode = {
        type: 'tableRow',
        attrs: {
          rsidR: '123',
          tableRowProperties: { someProp: 'value' },
        },
        content: [{ type: 'tableCell' }],
      };
      const decodedAttrs = { 'w:rsidR': '123' };
      const params = { node: mockNode };

      const result = translator.decode(params, decodedAttrs);

      expect(result.name).toBe('w:tr');
      expect(result.attributes).toEqual({ 'w:rsidR': '123' });

      // Check that children and properties are decoded and ordered correctly
      expect(translateChildNodes).toHaveBeenCalledWith(params);
      expect(trPrTranslator.decode).toHaveBeenCalledWith(params);
      expect(result.elements).toEqual([
        { name: 'w:trPr', comment: 'mocked trPr' },
        { name: 'w:tc', comment: 'mocked cell' },
      ]);
    });

    it('should decode a tableRow node without properties', () => {
      const mockNode = {
        type: 'tableRow',
        attrs: { rsidR: '456' },
        content: [],
      };
      const decodedAttrs = { 'w:rsidR': '456' };
      const params = { node: mockNode };

      const result = translator.decode(params, decodedAttrs);

      expect(result.name).toBe('w:tr');
      expect(result.attributes).toEqual({ 'w:rsidR': '456' });
      expect(translateChildNodes).toHaveBeenCalledWith(params);
      expect(trPrTranslator.decode).not.toHaveBeenCalled();
      expect(result.elements).toEqual([{ name: 'w:tc', comment: 'mocked cell' }]);
    });

    it('should update tableRowProperties.rowHeight when node.attrs.rowHeight changes', () => {
      const mockNode = {
        type: 'tableRow',
        attrs: {
          rowHeight: 30, // New height in pixels
          tableRowProperties: {
            rowHeight: { value: '400' }, // Original height in twips (400/20 = 20px)
          },
        },
        content: [],
      };
      const params = { node: mockNode };

      translator.decode(params, {});

      expect(trPrTranslator.decode).toHaveBeenCalledWith({
        ...params,
        node: {
          ...mockNode,
          attrs: {
            ...mockNode.attrs,
            tableRowProperties: { rowHeight: { value: '600' }, cantSplit: undefined },
          },
        },
      });
    });

    it('trims cells to the stored grid when preferTableGrid is true', () => {
      const placeholder = { type: 'tableCell', attrs: { __placeholder: 'gridBefore', colwidth: [0] }, content: [] };
      const cell = () => ({ type: 'tableCell', attrs: { colspan: 1 }, content: [] });
      const mockNode = {
        type: 'tableRow',
        attrs: {
          tableRowProperties: { gridBefore: 1 },
        },
        content: [placeholder, cell(), cell(), cell()],
      };
      const params = {
        node: mockNode,
        extraParams: {
          preferTableGrid: true,
          totalColumns: 3,
        },
      };

      translator.decode(params, {});

      expect(translateChildNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({
            content: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
          }),
        }),
      );
      const translateCall = translateChildNodes.mock.calls[0][0];
      expect(translateCall.node.content).toHaveLength(2);
    });
  });
});
