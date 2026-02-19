// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@core/super-converter/helpers.js', () => ({
  twipsToPixels: vi.fn((val) => (val ? parseInt(val, 10) / 20 : null)),
  eighthPointsToPixels: vi.fn((val) => (val ? parseInt(val, 10) / 8 : null)),
  halfPointToPoints: vi.fn((val) => (val ? parseInt(val, 10) / 2 : null)),
  pixelsToTwips: vi.fn((val) => (val ? Math.round(val * 20) : 0)),
}));

vi.mock('../tr', () => ({
  translator: {
    encode: vi.fn((params) => ({
      type: 'tableRow',
      attrs: { from: 'trTranslator' },
      content: [
        { name: 'tableCell', attributes: {} },
        { name: 'tableCell', attributes: {} },
      ],
    })),
    decode: vi.fn(() => ({ name: 'w:tr', comment: 'mocked row' })),
  },
}));

vi.mock('@core/super-converter/v2/exporter/helpers/index.js', () => ({
  translateChildNodes: vi.fn(() => [{ name: 'w:tr', comment: 'mocked row' }]),
}));

import { translator, _getReferencedTableStyles } from './tbl-translator.js';
import { NodeTranslator } from '@translator';
import { translator as trTranslator } from '../tr';
import { translateChildNodes } from '@core/super-converter/v2/exporter/helpers/index.js';

describe('w:tbl translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tbl');
      expect(translator.sdNodeOrKeyName).toBe('table');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    const mockDocx = {
      'word/styles.xml': {
        elements: [
          {
            name: 'w:styles',
            elements: [
              {
                name: 'w:style',
                attributes: { 'w:styleId': 'TableGrid' },
                elements: [
                  { name: 'w:name', attributes: { 'w:val': 'Table Grid' } },
                  {
                    name: 'w:tblPr',
                    elements: [
                      {
                        name: 'w:tblBorders',
                        elements: [
                          { name: 'w:top', attributes: { 'w:val': 'single', 'w:sz': '4' } },
                          { name: 'w:insideH', attributes: { 'w:val': 'dashed', 'w:sz': '2' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const mockTblNode = {
      name: 'w:tbl',
      elements: [
        {
          name: 'w:tblPr',
          elements: [
            { name: 'w:tblStyle', attributes: { 'w:val': 'TableGrid' } },
            { name: 'w:tblW', attributes: { 'w:w': '5000', 'w:type': 'pct' } },
            { name: 'w:jc', attributes: { 'w:val': 'center' } },
            { name: 'w:tblInd', attributes: { 'w:w': '144', 'w:type': 'dxa' } },
            { name: 'w:tblLayout', attributes: { 'w:type': 'fixed' } },
            { name: 'w:tblCellSpacing', attributes: { 'w:w': '10', 'w:type': 'dxa' } },
            {
              name: 'w:tblBorders',
              elements: [{ name: 'w:bottom', attributes: { 'w:val': 'double', 'w:sz': '8' } }],
            },
          ],
        },
        {
          name: 'w:tblGrid',
          elements: [{ name: 'w:gridCol', attributes: { 'w:w': '2000' } }],
        },
        { name: 'w:tr', elements: [{ name: 'w:tc', attributes: {}, elements: [] }] },
        { name: 'w:tr', elements: [{ name: 'w:tc', attributes: {}, elements: [] }] },
      ],
    };

    it('should encode a <w:tbl> element correctly', () => {
      const params = {
        nodes: [mockTblNode],
        docx: mockDocx,
      };

      const result = translator.encode(params, {});

      // Check top-level structure
      expect(result.type).toBe('table');
      expect(result.attrs).toBeDefined();
      expect(result.content).toHaveLength(2);

      // Check translator calls
      expect(trTranslator.encode).toHaveBeenCalledTimes(2);

      // Check attributes
      expect(result.attrs.tableProperties).toEqual({
        borders: {
          bottom: {
            size: 8,
            val: 'double',
          },
        },
        justification: 'center',
        tableWidth: {
          type: 'pct',
          value: 5000,
        },
        tableCellSpacing: {
          type: 'dxa',
          value: 10,
        },
        tableIndent: {
          type: 'dxa',
          value: 144,
        },
        tableLayout: 'fixed',
        tableStyleId: 'TableGrid',
        cellMargins: {},
      });
      expect(result.attrs.grid).toEqual([{ col: 2000 }]);
      expect(result.attrs.tableStyleId).toBe('TableGrid');
      expect(result.attrs.tableWidth).toEqual({ value: 5000, type: 'pct' });
      expect(result.attrs.justification).toBe('center');
      expect(result.attrs.tableIndent).toEqual({ width: 7.2, type: 'dxa' });
      expect(result.attrs.tableLayout).toBe('fixed');
      expect(result.attrs.tableCellSpacing).toEqual({ w: '10', type: 'dxa' });
      expect(result.attrs.borderCollapse).toBe('separate');

      // Check borders (merged from style and inline)
      expect(result.attrs.borders).toEqual({
        top: { size: 0.5, val: 'single' }, // from style
        insideH: { size: 0.25, val: 'dashed' }, // from style
        bottom: { size: 1, val: 'double' }, // from inline
      });
    });

    it('handles tables with no properties or rows', () => {
      const simpleTable = {
        name: 'w:tbl',
        elements: [
          { name: 'w:tblPr', elements: [] }, // empty tblPr
        ],
      };
      const params = { nodes: [simpleTable], docx: {} };

      const result = translator.encode(params, {});

      expect(result.type).toBe('table');
      expect(result.content).toEqual([]);
      expect(result.attrs.tableProperties).toEqual({ cellMargins: {} });
      expect(trTranslator.encode).not.toHaveBeenCalled();
    });

    it('preserves raw OOXML value for pct table width with dxa grid columns', () => {
      // SD-1581: Tables with percentage width but fixed (dxa) grid columns
      // should preserve the raw pct value for downstream layout calculations
      const mixedTable = {
        name: 'w:tbl',
        elements: [
          {
            name: 'w:tblPr',
            elements: [
              { name: 'w:tblW', attributes: { 'w:w': '5000', 'w:type': 'pct' } }, // 100% width
            ],
          },
          {
            name: 'w:tblGrid',
            elements: [
              { name: 'w:gridCol', attributes: { 'w:w': '2880' } }, // 2 inches in twips
              { name: 'w:gridCol', attributes: { 'w:w': '2880' } },
            ],
          },
        ],
      };
      const params = { nodes: [mixedTable], docx: {} };

      const result = translator.encode(params, {});

      // tableWidth should use { value, type } shape for pct (not converted to pixels)
      expect(result.attrs.tableWidth).toEqual({ value: 5000, type: 'pct' });
      // grid columns should still be converted to pixels
      expect(result.attrs.grid).toEqual([{ col: 2880 }, { col: 2880 }]);
    });

    it('handles auto table width type as fallback', () => {
      const autoWidthTable = {
        name: 'w:tbl',
        elements: [
          {
            name: 'w:tblPr',
            elements: [{ name: 'w:tblW', attributes: { 'w:w': '0', 'w:type': 'auto' } }],
          },
        ],
      };
      const params = { nodes: [autoWidthTable], docx: {} };

      const result = translator.encode(params, {});

      expect(result.attrs.tableWidth).toEqual({ width: 0, type: 'auto' });
    });
  });

  describe('decode', () => {
    it('should decode a table node with properties and grid', () => {
      const mockNode = {
        type: 'table',
        attrs: {
          tableProperties: { justification: 'center' },
          grid: [{ col: '2000' }],
        },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { colwidth: [100] },
              },
            ],
          },
        ],
      };
      const params = { node: mockNode };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tbl');
      expect(result.attributes).toEqual({});

      // Check that children and properties are decoded and ordered correctly
      expect(translateChildNodes).toHaveBeenCalledWith(expect.objectContaining({ node: mockNode }));

      // Check for real tblPr
      const tblPr = result.elements.find((el) => el.name === 'w:tblPr');
      expect(tblPr).toBeDefined();
      expect(tblPr.elements).toEqual([expect.objectContaining({ name: 'w:jc', attributes: { 'w:val': 'center' } })]);

      // Check for real tblGrid
      const tblGrid = result.elements.find((el) => el.name === 'w:tblGrid');
      expect(tblGrid).toBeDefined();
      expect(tblGrid.elements).toEqual([expect.objectContaining({ name: 'w:gridCol', attributes: { 'w:w': '2000' } })]);
    });

    it('should generate a grid if not present', () => {
      const mockNode = {
        type: 'table',
        attrs: {},
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { colwidth: [150] } },
              { type: 'tableCell', attrs: { colwidth: [200] } },
            ],
          },
        ],
      };
      const params = { node: mockNode };

      const result = translator.decode(params);

      expect(result.name).toBe('w:tbl');
      const tblGrid = result.elements.find((el) => el.name === 'w:tblGrid');
      expect(tblGrid).toBeDefined();
      expect(tblGrid.elements.length).toBe(2);
      expect(tblGrid.elements[0].attributes['w:w']).toBe('3000');
      expect(tblGrid.elements[1].attributes['w:w']).toBe('4000');
    });

    describe('_preProcessVerticalMergeCells', () => {
      it('should add placeholder cells for rowspan > 1', () => {
        const mockEditorSchema = {
          nodes: {
            paragraph: {
              createAndFill: vi.fn(() => ({ toJSON: () => ({ type: 'paragraph', content: [] }) })),
            },
          },
        };

        const mockNode = {
          type: 'table',
          attrs: {},
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { rowspan: 2, colspan: 1 }, content: [] },
                { type: 'tableCell', attrs: { rowspan: 1, colspan: 1 }, content: [] },
              ],
            },
            {
              type: 'tableRow',
              content: [{ type: 'tableCell', attrs: { rowspan: 1, colspan: 1 }, content: [] }],
            },
          ],
        };

        const params = { node: mockNode, editorSchema: mockEditorSchema };
        translator.decode(params);

        // The node passed to translateChildNodes is the one that has been processed.
        const processedNode = translateChildNodes.mock.calls[0][0].node;

        // The original node is mutated, so we check the result of the preprocessing step
        expect(processedNode.content[1].content).toHaveLength(2);
        const addedCell = processedNode.content[1].content[0];
        expect(addedCell.type).toBe('tableCell');
        expect(addedCell.attrs.continueMerge).toBe(true);
        expect(addedCell.attrs.rowspan).toBe(null); // reset
        expect(addedCell.attrs.colspan).toBe(mockNode.content[0].content[0].attrs.colspan); // preserve original span for layout
        expect(addedCell.content).toEqual([{ type: 'paragraph', content: [] }]);
        expect(mockEditorSchema.nodes.paragraph.createAndFill).toHaveBeenCalled();
      });
    });
  });

  describe('getReferencedTableStyles', () => {
    it('should return null if tblStyleTag is missing', () => {
      expect(_getReferencedTableStyles(null, {})).toBeNull();
    });

    it('should return null if styleId is not found', () => {
      const docx = { 'word/styles.xml': { elements: [{ name: 'w:styles', elements: [] }] } };
      expect(_getReferencedTableStyles('NonExistent', { docx })).toBeNull();
    });

    it('should extract styles correctly', () => {
      const docx = {
        'word/styles.xml': {
          elements: [
            {
              name: 'w:styles',
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'MyTableStyle' },
                  elements: [
                    { name: 'w:name', attributes: { 'w:val': 'My Table' } },
                    { name: 'w:pPr', elements: [{ name: 'w:jc', attributes: { 'w:val': 'right' } }] },
                    {
                      name: 'w:rPr',
                      elements: [
                        { name: 'w:rFonts', attributes: { 'w:ascii': 'Calibri' } },
                        { name: 'w:sz', attributes: { 'w:val': '22' } }, // 11pt
                      ],
                    },
                    {
                      name: 'w:tblPr',
                      elements: [
                        {
                          name: 'w:tblBorders',
                          elements: [{ name: 'w:top', attributes: { 'w:val': 'single', 'w:sz': '8' } }],
                        },
                        {
                          name: 'w:tblCellMar',
                          elements: [{ name: 'w:left', attributes: { 'w:w': '108' } }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const styles = _getReferencedTableStyles('MyTableStyle', { docx });

      expect(styles.name).toBeDefined();
      expect(styles.justification).toBe('right');
      expect(styles.fonts).toEqual({ ascii: 'Calibri', hAnsi: undefined, cs: undefined });
      expect(styles.fontSize).toBe('11pt');
      expect(styles.borders).toEqual({ top: { size: 1, val: 'single' } });
      expect(styles.cellMargins).toEqual({
        marginLeft: { value: 108, type: 'dxa' },
        marginRight: undefined,
        marginTop: undefined,
        marginBottom: undefined,
      });
    });

    it('ignores table properties when translator returns undefined', () => {
      const docx = {
        'word/styles.xml': {
          elements: [
            {
              name: 'w:styles',
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'UnsupportedTableStyle' },
                  elements: [
                    { name: 'w:name', attributes: { 'w:val': 'Unsupported Table Style' } },
                    {
                      name: 'w:tblPr',
                      elements: [{ name: 'w:tblStylePr', attributes: { 'w:type': 'firstRow' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      /** @type {ReturnType<typeof _getReferencedTableStyles>} */
      let styles;
      expect(() => {
        styles = _getReferencedTableStyles('UnsupportedTableStyle', { docx });
      }).not.toThrow();

      expect(styles).toBeDefined();
      expect(styles?.name).toBeDefined();
      expect(styles?.borders).toBeUndefined();
      expect(styles?.cellMargins).toBeUndefined();
    });
  });
});
