import { describe, it, expect, vi } from 'vitest';
import { translator } from './tblGrid-translator.js';
import { NodeTranslator } from '@translator';

// Mock dependencies
vi.mock('@core/super-converter/helpers.js', () => ({
  twipsToPixels: vi.fn((val) => (val ? parseInt(val, 10) / 20 : 0)),
  pixelsToTwips: vi.fn((val) => (val ? Math.round(val * 20) : 0)),
}));

import { twipsToPixels, pixelsToTwips } from '@converter/helpers.js';

describe('w:tblGrid translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:tblGrid');
      expect(translator.sdNodeOrKeyName).toBe('grid');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('encodes a <w:tblGrid> element with multiple grid columns', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblGrid',
            elements: [
              { name: 'w:gridCol', attributes: { 'w:w': '1000' } },
              { name: 'w:gridCol', attributes: { 'w:w': '2500' } },
              { name: 'w:gridCol', attributes: { 'w:w': '1500' } },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result.sdNodeOrKeyName).toBe('grid');
      expect(result.attributes).toEqual([{ col: 1000 }, { col: 2500 }, { col: 1500 }]);
    });

    it('handles grid columns with non-integer or missing values', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblGrid',
            elements: [
              { name: 'w:gridCol', attributes: { 'w:w': '123.45' } },
              { name: 'w:gridCol', attributes: { 'w:w': 'abc' } },
              { name: 'w:gridCol', attributes: {} },
            ],
          },
        ],
      };

      const result = translator.encode(params);

      // 'abc' and empty attributes result in undefined from parseInteger, so they are filtered out by encodeProperties
      expect(result.attributes).toEqual([{ col: 123 }]);
    });

    it('handles an empty <w:tblGrid> element', () => {
      const params = {
        nodes: [
          {
            name: 'w:tblGrid',
            elements: [],
          },
        ],
      };

      const result = translator.encode(params);

      expect(result.attributes).toEqual([]);
    });
  });

  describe('decode', () => {
    it('should decode a grid attribute into a <w:tblGrid> element', () => {
      const params = {
        node: {
          attrs: {
            grid: [{ col: 1000 }, { col: 2500 }],
          },
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [50] } },
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [125] } },
            ],
          },
        },
      };

      const expectedElements = [
        { name: 'w:gridCol', attributes: { 'w:w': '1000' } },
        { name: 'w:gridCol', attributes: { 'w:w': '2500' } },
      ];

      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      expect(result.elements).toEqual(expectedElements);
    });

    it('handles empty grid array', () => {
      const params = {
        node: {
          attrs: {
            grid: [],
          },
        },
      };
      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      expect(result.elements).toEqual([]);
    });

    it('uses cell widths when grid properties are empty', () => {
      const params = {
        node: {
          attrs: {},
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [50] } },
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [125] } },
            ],
          },
        },
      };

      const expectedElements = [
        { name: 'w:gridCol', attributes: { 'w:w': '1000' } },
        { name: 'w:gridCol', attributes: { 'w:w': '2500' } },
      ];

      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      expect(result.elements).toEqual(expectedElements);
    });

    it('prioritizes grid properties over cell widths when different', () => {
      const params = {
        node: {
          attrs: {
            grid: [{ col: 500 }, { col: 1250 }],
          },
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [50] } },
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [125] } },
            ],
          },
        },
      };

      const expectedElements = [
        { name: 'w:gridCol', attributes: { 'w:w': '500' } },
        { name: 'w:gridCol', attributes: { 'w:w': '1250' } },
      ];

      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      expect(result.elements).toEqual(expectedElements);
    });

    it('handles missing grid attribute', () => {
      const params = {
        node: {
          attrs: {},
        },
      };
      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      expect(result.elements).toEqual([]);
    });

    it('treats null grid attributes as empty arrays', () => {
      const params = {
        node: {
          attrs: {
            grid: null,
          },
        },
        extraParams: {
          firstRow: {
            content: [{ type: 'tableCell', attrs: { colspan: 1 } }],
          },
        },
      };

      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      expect(result.elements).toHaveLength(1);
    });

    it('treats non-array grid attributes as empty arrays', () => {
      const params = {
        node: {
          attrs: {
            grid: {},
          },
        },
        extraParams: {
          firstRow: {
            content: [{ type: 'tableCell', attrs: { colwidth: [150] } }],
          },
        },
      };

      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      expect(result.elements[0].attributes['w:w']).toBe('3000');
    });

    it('derives column widths from table width when sizing data is missing', () => {
      const params = {
        node: {
          attrs: {
            tableWidth: { width: 400 },
          },
        },
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: [160] } } } },
            },
          },
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: {} },
              { type: 'tableCell', attrs: {} },
            ],
          },
        },
      };

      const result = translator.decode(params);
      const widths = result.elements.map((el) => el.attributes['w:w']);
      expect(widths).toEqual(['4000', '4000']);
    });

    it('falls back to schema defaults when no column sizing metadata exists', () => {
      const params = {
        node: {
          attrs: {},
        },
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: [120] } } } },
            },
          },
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: {} },
              { type: 'tableCell', attrs: {} },
            ],
          },
        },
      };

      const result = translator.decode(params);
      const widths = result.elements.map((el) => el.attributes['w:w']);
      expect(widths).toEqual(['2400', '2400']);
    });

    it('preserves distinct grid column widths when reconstructing the grid', () => {
      const params = {
        node: {
          attrs: {
            grid: [{ col: 2000 }, { col: 4000 }],
          },
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: { colspan: 1 } },
              { type: 'tableCell', attrs: { colspan: 1 } },
            ],
          },
        },
      };

      const result = translator.decode(params);
      const widths = result.elements.map((el) => el.attributes['w:w']);
      expect(widths).toEqual(['2000', '4000']);
    });

    it('prefers stored grid column count when preferTableGrid is true', () => {
      const params = {
        node: {
          attrs: {
            grid: [{ col: 2000 }, { col: 4000 }],
          },
        },
        extraParams: {
          preferTableGrid: true,
          totalColumns: 2,
          firstRow: {
            content: [
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [50] } },
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [60] } },
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [70] } },
            ],
          },
        },
      };

      const result = translator.decode(params);
      expect(result.elements).toHaveLength(2);
      const widths = result.elements.map((el) => el.attributes['w:w']);
      expect(widths).toEqual(['2000', '4000']);
    });

    it('derives grid widths from tableHeader cells in header-only first row', () => {
      const params = {
        node: {
          attrs: {},
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableHeader', attrs: { colspan: 1, colwidth: [80] } },
              { type: 'tableHeader', attrs: { colspan: 1, colwidth: [120] } },
            ],
          },
        },
      };

      const result = translator.decode(params);
      expect(result.name).toBe('w:tblGrid');
      const widths = result.elements.map((el) => el.attributes['w:w']);
      // 80 * 20 = 1600, 120 * 20 = 2400 (via mocked pixelsToTwips)
      expect(widths).toEqual(['1600', '2400']);
    });

    it('preserves narrow grid columns for placeholder cells without inflating width', () => {
      const params = {
        node: {
          attrs: {
            grid: [{ col: 8 }, { col: 3413 }],
          },
        },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [0], __placeholder: 'gridBefore' } },
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [170.65] } },
            ],
          },
        },
      };

      const result = translator.decode(params);
      const widths = result.elements.map((el) => el.attributes['w:w']);
      expect(widths).toEqual(['8', '3413']);
    });
  });

  describe('round-trip', () => {
    it('should maintain consistency after encode and decode', () => {
      const initialXmlNode = {
        name: 'w:tblGrid',
        elements: [
          { name: 'w:gridCol', attributes: { 'w:w': '1000' } },
          { name: 'w:gridCol', attributes: { 'w:w': '2500' } },
        ],
      };

      const encoded = translator.encode({ nodes: [initialXmlNode] });

      const decoded = translator.decode({
        node: { attrs: { grid: encoded.attributes } },
        extraParams: {
          firstRow: {
            content: [
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [50] } },
              { type: 'tableCell', attrs: { colspan: 1, colwidth: [125] } },
            ],
          },
        },
      });

      expect(decoded.name).toBe(initialXmlNode.name);
      expect(decoded.elements).toEqual(initialXmlNode.elements);
    });
  });
});
