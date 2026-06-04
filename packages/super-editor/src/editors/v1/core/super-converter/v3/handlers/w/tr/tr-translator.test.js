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
      const tcPr = tcNode.elements?.find((el) => el?.name === 'w:tcPr');
      const gridSpan = tcPr?.elements?.find((el) => el?.name === 'w:gridSpan');
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

vi.mock('../trPr', () => ({
  translator: {
    encode: vi.fn(() => ({ encoded: 'trPr' })),
    decode: vi.fn(() => ({ name: 'w:trPr', comment: 'mocked trPr' })),
  },
}));

import { translator } from './tr-translator.js';
import { NodeTranslator } from '@translator';
import { translator as tcTranslator } from '../tc';
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

    it('skips vMerge-consumed cells without advancing the next encoded cell column', () => {
      const rowWithConsumedCell = {
        name: 'w:tr',
        elements: [
          { name: 'w:tc', elements: [], _vMergeConsumed: true },
          { name: 'w:tc', elements: [] },
          { name: 'w:tc', elements: [] },
        ],
      };
      const params = {
        nodes: [rowWithConsumedCell],
        extraParams: {
          row: rowWithConsumedCell,
          columnWidths: [100, 150, 200],
          activeRowSpans: [1, 0, 0],
        },
      };

      const result = translator.encode(params, {});

      expect(tcTranslator.encode).toHaveBeenCalledTimes(2);
      expect(tcTranslator.encode).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          extraParams: expect.objectContaining({
            node: rowWithConsumedCell.elements[1],
            columnIndex: 1,
            columnWidth: 150,
          }),
        }),
      );
      expect(tcTranslator.encode).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          extraParams: expect.objectContaining({
            node: rowWithConsumedCell.elements[2],
            columnIndex: 2,
            columnWidth: 200,
          }),
        }),
      );
      expect(result.content).toHaveLength(2);
      expect(result.content.map((cell) => cell.attrs.columnIndex)).toEqual([1, 2]);
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

  describe('structural tracked changes (whole-table insert/delete)', () => {
    const rowWithMarker = (markerName) => ({
      name: 'w:tr',
      elements: [
        {
          name: 'w:trPr',
          elements: [
            {
              name: markerName,
              attributes: {
                'w:id': '7',
                'w:author': 'Alice Reviewer',
                'w:authorEmail': 'alice@example.com',
                'w:date': '2026-05-20T16:00:00Z',
              },
            },
          ],
        },
        { name: 'w:tc', elements: [] },
      ],
    });

    it('reads <w:ins> in <w:trPr> into a rowInsert trackChange attr', () => {
      const row = rowWithMarker('w:ins');
      const result = translator.encode({ nodes: [row], extraParams: { row, columnWidths: [100] } }, {});

      expect(result.attrs.trackChange).toMatchObject({
        type: 'rowInsert',
        id: '7',
        sourceId: '7',
        author: 'Alice Reviewer',
        authorEmail: 'alice@example.com',
        date: '2026-05-20T16:00:00Z',
      });
    });

    it('reads <w:del> in <w:trPr> into a rowDelete trackChange attr', () => {
      const row = rowWithMarker('w:del');
      const result = translator.encode({ nodes: [row], extraParams: { row, columnWidths: [100] } }, {});

      expect(result.attrs.trackChange).toMatchObject({ type: 'rowDelete', id: '7' });
    });

    it('leaves trackChange unset for a plain row', () => {
      const row = {
        name: 'w:tr',
        elements: [
          { name: 'w:trPr', elements: [] },
          { name: 'w:tc', elements: [] },
        ],
      };
      const result = translator.encode({ nodes: [row], extraParams: { row, columnWidths: [100] } }, {});

      expect(result.attrs.trackChange).toBeUndefined();
    });

    describe('export (decode)', () => {
      const rowNode = (trackChange) => ({
        type: 'tableRow',
        attrs: { trackChange },
        content: [{ type: 'tableCell', attrs: {}, content: [] }],
      });

      it('emits <w:ins> inside <w:trPr> for a rowInsert trackChange', () => {
        const node = rowNode({
          type: 'rowInsert',
          id: '7',
          sourceId: '7',
          author: 'Alice Reviewer',
          authorEmail: 'alice@example.com',
          date: '2026-05-20T16:00:00Z',
        });
        const result = translator.decode({ node }, {});
        const trPr = result.elements.find((el) => el?.name === 'w:trPr');
        expect(trPr).toBeDefined();
        const ins = trPr.elements.find((el) => el?.name === 'w:ins');
        expect(ins).toBeDefined();
        expect(ins.attributes).toMatchObject({
          'w:id': '7',
          'w:author': 'Alice Reviewer',
          'w:authorEmail': 'alice@example.com',
          'w:date': '2026-05-20T16:00:00Z',
        });
        // With no base row properties, the marker is the sole child of w:trPr.
        expect(trPr.elements[0].name).toBe('w:ins');
      });

      it('places the revision marker after base row props and before trPrChange (CT_TrPr order)', () => {
        // Drive the (mocked) trPr translator to emit a base prop + a trPrChange,
        // so the marker placement against real siblings is asserted.
        vi.mocked(trPrTranslator.decode).mockReturnValueOnce({
          name: 'w:trPr',
          elements: [{ name: 'w:trHeight', attributes: { 'w:val': '300' } }, { name: 'w:trPrChange' }],
        });
        const node = {
          type: 'tableRow',
          attrs: {
            trackChange: { type: 'rowInsert', id: '7', sourceId: '7' },
            tableRowProperties: { rowHeight: { value: '300' } },
          },
          content: [{ type: 'tableCell', attrs: {}, content: [] }],
        };
        const result = translator.decode({ node }, {});
        const trPr = result.elements.find((el) => el?.name === 'w:trPr');
        const order = trPr.elements.map((el) => el.name);
        // ins must follow the base prop and precede trPrChange.
        expect(order).toEqual(['w:trHeight', 'w:ins', 'w:trPrChange']);
      });

      it('emits <w:del> inside <w:trPr> for a rowDelete trackChange', () => {
        const node = rowNode({ type: 'rowDelete', id: '3', sourceId: '3', author: 'Alice Reviewer' });
        const result = translator.decode({ node }, {});
        const trPr = result.elements.find((el) => el?.name === 'w:trPr');
        const del = trPr.elements.find((el) => el?.name === 'w:del');
        expect(del).toBeDefined();
        expect(del.attributes['w:id']).toBe('3');
      });

      it('emits no revision marker for a plain row', () => {
        const node = rowNode(null);
        const result = translator.decode({ node }, {});
        const trPr = result.elements.find((el) => el?.name === 'w:trPr');
        // No tableRowProperties and no trackChange → no w:trPr is synthesized.
        expect(trPr).toBeUndefined();
      });

      // Drive translateChildNodes to emit a realistic cell (a paragraph with a
      // text run) so the synthesized cell-content markers can be asserted.
      const mockCellWithText = () => {
        translateChildNodes.mockReturnValueOnce([
          {
            name: 'w:tc',
            elements: [
              { name: 'w:tcPr', elements: [] },
              {
                name: 'w:p',
                elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Hi' }] }] }],
              },
            ],
          },
        ]);
      };
      const decodeTrackedRow = (trackChange) =>
        translator.decode({ node: { type: 'tableRow', attrs: { trackChange }, content: [] } }, {});

      it('marks each cell paragraph mark and wraps cell runs in <w:ins> for a rowInsert', () => {
        mockCellWithText();
        const result = decodeTrackedRow({ type: 'rowInsert', id: '7', sourceId: '7', author: 'Alice Reviewer' });
        const tc = result.elements.find((el) => el?.name === 'w:tc');
        const paragraph = tc.elements.find((el) => el?.name === 'w:p');

        // Paragraph mark tracked as inserted: pPr > rPr > w:ins (first in rPr).
        const pPr = paragraph.elements.find((el) => el?.name === 'w:pPr');
        const rPr = pPr.elements.find((el) => el?.name === 'w:rPr');
        expect(rPr.elements[0].name).toBe('w:ins');
        expect(rPr.elements[0].attributes['w:id']).toBe('7');

        // The text run is wrapped in <w:ins>, keeping <w:t> (not <w:delText>).
        const insRun = paragraph.elements.find((el) => el?.name === 'w:ins' && el.elements?.[0]?.name === 'w:r');
        expect(insRun).toBeDefined();
        expect(insRun.elements[0].elements.some((c) => c?.name === 'w:t')).toBe(true);
      });

      it('marks cell paragraph marks with <w:del> and rewrites run text to <w:delText> for a rowDelete', () => {
        mockCellWithText();
        const result = decodeTrackedRow({ type: 'rowDelete', id: '3', sourceId: '3', author: 'Alice Reviewer' });
        const tc = result.elements.find((el) => el?.name === 'w:tc');
        const paragraph = tc.elements.find((el) => el?.name === 'w:p');

        const pPr = paragraph.elements.find((el) => el?.name === 'w:pPr');
        const rPr = pPr.elements.find((el) => el?.name === 'w:rPr');
        expect(rPr.elements[0].name).toBe('w:del');

        const delRun = paragraph.elements.find((el) => el?.name === 'w:del' && el.elements?.[0]?.name === 'w:r');
        expect(delRun).toBeDefined();
        // Deleted run text becomes <w:delText>, never <w:t>.
        const run = delRun.elements[0];
        expect(run.elements.some((c) => c?.name === 'w:delText')).toBe(true);
        expect(run.elements.some((c) => c?.name === 'w:t')).toBe(false);
      });

      it('wraps runs nested inside a <w:hyperlink>, converting <w:t> to <w:delText> for a delete', () => {
        translateChildNodes.mockReturnValueOnce([
          {
            name: 'w:tc',
            elements: [
              {
                name: 'w:p',
                elements: [
                  {
                    name: 'w:hyperlink',
                    attributes: { 'r:id': 'rId5' },
                    elements: [
                      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link' }] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
        const result = decodeTrackedRow({ type: 'rowDelete', id: '9', sourceId: '9', author: 'Alice Reviewer' });
        const tc = result.elements.find((el) => el?.name === 'w:tc');
        const paragraph = tc.elements.find((el) => el?.name === 'w:p');
        const hyperlink = paragraph.elements.find((el) => el?.name === 'w:hyperlink');
        // The hyperlink container stays; its inner run is wrapped in <w:del>.
        const delWrap = hyperlink.elements.find((el) => el?.name === 'w:del' && el.elements?.[0]?.name === 'w:r');
        expect(delWrap).toBeDefined();
        expect(delWrap.elements[0].elements.some((c) => c?.name === 'w:delText')).toBe(true);
      });

      it('inserts the paragraph-mark <w:rPr> before a terminal <w:sectPr> (CT_PPr order)', () => {
        translateChildNodes.mockReturnValueOnce([
          {
            name: 'w:tc',
            elements: [
              {
                name: 'w:p',
                elements: [
                  {
                    name: 'w:pPr',
                    elements: [
                      { name: 'w:jc', attributes: { 'w:val': 'left' } },
                      { name: 'w:sectPr', elements: [] },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
        const result = decodeTrackedRow({ type: 'rowInsert', id: '11', sourceId: '11', author: 'Alice Reviewer' });
        const tc = result.elements.find((el) => el?.name === 'w:tc');
        const pPr = tc.elements.find((el) => el?.name === 'w:p').elements.find((el) => el?.name === 'w:pPr');
        const order = pPr.elements.map((el) => el?.name);
        // rPr (with the ins) must precede the terminal sectPr.
        expect(order).toEqual(['w:jc', 'w:rPr', 'w:sectPr']);
        const rPr = pPr.elements.find((el) => el?.name === 'w:rPr');
        expect(rPr.elements[0].name).toBe('w:ins');
      });

      it('does not double-mark an already-tracked run or paragraph mark (idempotent)', () => {
        translateChildNodes.mockReturnValueOnce([
          {
            name: 'w:tc',
            elements: [
              {
                name: 'w:p',
                elements: [
                  {
                    name: 'w:pPr',
                    elements: [{ name: 'w:rPr', elements: [{ name: 'w:ins', attributes: { 'w:id': '99' } }] }],
                  },
                  { name: 'w:ins', attributes: { 'w:id': '99' }, elements: [{ name: 'w:r', elements: [] }] },
                ],
              },
            ],
          },
        ]);
        const result = decodeTrackedRow({ type: 'rowInsert', id: '11', sourceId: '11', author: 'Alice Reviewer' });
        const paragraph = result.elements.find((el) => el?.name === 'w:tc').elements.find((el) => el?.name === 'w:p');
        const rPr = paragraph.elements.find((el) => el?.name === 'w:pPr').elements.find((el) => el?.name === 'w:rPr');
        // Existing paragraph-mark ins is preserved; no second ins added.
        expect(rPr.elements.filter((el) => el?.name === 'w:ins')).toHaveLength(1);
        // The already-wrapped run is not re-wrapped (no <w:ins><w:ins>).
        const wrap = paragraph.elements.find((el) => el?.name === 'w:ins' && el.elements?.[0]?.name === 'w:r');
        expect(wrap).toBeDefined();
        expect(wrap.elements[0].name).toBe('w:r');
      });

      it('round-trips import → export preserving the trPr ins markup', () => {
        const importRow = {
          name: 'w:tr',
          elements: [
            {
              name: 'w:trPr',
              elements: [
                {
                  name: 'w:ins',
                  attributes: { 'w:id': '7', 'w:author': 'Alice Reviewer', 'w:date': '2026-05-20T16:00:00Z' },
                },
              ],
            },
            { name: 'w:tc', elements: [] },
          ],
        };
        const encoded = translator.encode(
          { nodes: [importRow], extraParams: { row: importRow, columnWidths: [100] } },
          {},
        );
        const exported = translator.decode({ node: encoded }, {});
        const trPr = exported.elements.find((el) => el?.name === 'w:trPr');
        const ins = trPr.elements.find((el) => el?.name === 'w:ins');
        expect(ins.attributes['w:id']).toBe('7');
        expect(ins.attributes['w:author']).toBe('Alice Reviewer');
        expect(ins.attributes['w:date']).toBe('2026-05-20T16:00:00Z');
      });
    });
  });
});
