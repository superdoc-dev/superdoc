// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies in the same shape as tr-translator.test.js so the row
// translator's helpers resolve consistently across test files.
vi.mock('@core/super-converter/helpers.js', () => ({
  twipsToPixels: vi.fn((val) => (val ? parseInt(val, 10) / 20 : 0)),
  pixelsToTwips: vi.fn((val) => (val ? Math.round(val * 20) : 0)),
  eighthPointsToPixels: vi.fn((val) => (val != null ? parseInt(val, 10) / 8 : 0)),
}));

vi.mock('@core/super-converter/v2/exporter/helpers/index.js', () => ({
  translateChildNodes: vi.fn(),
}));

vi.mock('../tc', () => ({
  translator: {
    encode: vi.fn((params) => ({
      type: 'tableCell',
      attrs: {
        from: 'tcTranslator',
        columnIndex: params.extraParams.columnIndex,
        columnWidth: params.extraParams.columnWidth,
        colspan: 1,
      },
    })),
  },
}));

vi.mock('../trPr', () => ({
  translator: {
    encode: vi.fn(() => ({})),
    decode: vi.fn(() => null),
  },
}));

vi.mock('../tblBorders', () => ({
  translator: {
    encode: vi.fn(() => null),
    decode: vi.fn(() => null),
  },
}));

import { translator } from './tr-translator.js';
import { translator as tcTranslator } from '../tc';
import { translateChildNodes } from '@core/super-converter/v2/exporter/helpers/index.js';

const COMMENCEMENT_CELL = {
  name: 'w:tc',
  elements: [
    {
      name: 'w:p',
      elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'COMMENCEMENT DATE' }] }] }],
    },
  ],
};

const DATE_CELL = {
  name: 'w:tc',
  elements: [
    {
      name: 'w:p',
      elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '18 January 2025' }] }] }],
    },
  ],
};

const SDT_PR = {
  name: 'w:sdtPr',
  elements: [
    { name: 'w:id', attributes: { 'w:val': '849213029' } },
    {
      name: 'w:date',
      attributes: { 'w:fullDate': '2025-01-18T00:00:00Z' },
      elements: [
        { name: 'w:dateFormat', attributes: { 'w:val': 'd MMMM yyyy' } },
        { name: 'w:lid', attributes: { 'w:val': 'en-AU' } },
        { name: 'w:storeMappedDataAs', attributes: { 'w:val': 'dateTime' } },
        { name: 'w:calendar', attributes: { 'w:val': 'gregorian' } },
      ],
    },
  ],
};

const SDT_END_PR = { name: 'w:sdtEndPr', elements: [] };

describe('w:tr translator — cell-level SDT (SD-3289 / IT-1119)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encode (import): cell-level SDT (CT_SdtCell) unwrap', () => {
    it('imports a direct w:tc + a w:sdt > w:sdtContent > w:tc as two cells', () => {
      const row = {
        name: 'w:tr',
        elements: [
          COMMENCEMENT_CELL,
          {
            name: 'w:sdt',
            elements: [SDT_PR, { name: 'w:sdtContent', elements: [DATE_CELL] }],
          },
        ],
      };
      const params = {
        nodes: [row],
        extraParams: { row, columnWidths: [163, 296] },
      };

      const result = translator.encode(params, {});

      expect(tcTranslator.encode).toHaveBeenCalledTimes(2);
      expect(result.content).toHaveLength(2);
      // first cell: regular, no cellSdt
      expect(result.content[0].attrs.cellSdt).toBeUndefined();
      // second cell: wrapped, carries cellSdt
      expect(result.content[1].attrs.cellSdt).toEqual({
        scope: 'cell',
        sdtPr: SDT_PR,
        sdtEndPr: null,
      });
    });

    it('preserves w:sdtEndPr when present on the wrapper', () => {
      const row = {
        name: 'w:tr',
        elements: [
          {
            name: 'w:sdt',
            elements: [SDT_PR, SDT_END_PR, { name: 'w:sdtContent', elements: [DATE_CELL] }],
          },
        ],
      };
      const params = { nodes: [row], extraParams: { row, columnWidths: [296] } };

      const result = translator.encode(params, {});

      expect(result.content[0].attrs.cellSdt).toEqual({
        scope: 'cell',
        sdtPr: SDT_PR,
        sdtEndPr: SDT_END_PR,
      });
    });

    it('routes the inner w:tc through the existing tc-translator', () => {
      const row = {
        name: 'w:tr',
        elements: [{ name: 'w:sdt', elements: [SDT_PR, { name: 'w:sdtContent', elements: [DATE_CELL] }] }],
      };
      const params = { nodes: [row], extraParams: { row, columnWidths: [296] } };

      translator.encode(params, {});

      expect(tcTranslator.encode).toHaveBeenCalledWith(
        expect.objectContaining({
          extraParams: expect.objectContaining({ node: DATE_CELL, columnIndex: 0, columnWidth: 296 }),
        }),
      );
    });

    it('defensively imports multi-cell SDT wrappers without wrapper metadata', () => {
      const secondInnerCell = {
        name: 'w:tc',
        elements: [
          {
            name: 'w:p',
            elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'B' }] }] }],
          },
        ],
      };
      const row = {
        name: 'w:tr',
        elements: [
          {
            name: 'w:sdt',
            elements: [SDT_PR, { name: 'w:sdtContent', elements: [DATE_CELL, secondInnerCell] }],
          },
        ],
      };
      const params = { nodes: [row], extraParams: { row, columnWidths: [148, 148] } };

      const result = translator.encode(params, {});

      expect(result.content).toHaveLength(2);
      expect(result.content[0].attrs.cellSdt).toBeUndefined();
      expect(result.content[1].attrs.cellSdt).toBeUndefined();
    });

    it('skips other legal row children silently (w:customXml, run-level markup)', () => {
      const row = {
        name: 'w:tr',
        elements: [
          COMMENCEMENT_CELL,
          { name: 'w:customXml', elements: [DATE_CELL] }, // not unwrapped in v1
          { name: 'w:bookmarkStart', attributes: { 'w:id': '1' } }, // run-level markup
        ],
      };
      const params = { nodes: [row], extraParams: { row, columnWidths: [163] } };

      const result = translator.encode(params, {});

      expect(tcTranslator.encode).toHaveBeenCalledTimes(1);
      expect(result.content).toHaveLength(1);
    });

    it('does not crash when the SDT wrapper has no sdtContent', () => {
      const row = {
        name: 'w:tr',
        elements: [{ name: 'w:sdt', elements: [SDT_PR] }],
      };
      const params = { nodes: [row], extraParams: { row, columnWidths: [296] } };

      expect(() => translator.encode(params, {})).not.toThrow();
    });
  });

  describe('decode (export): re-wrap cells with cellSdt metadata', () => {
    it('wraps a cell carrying cellSdt in <w:sdt><w:sdtContent><w:tc/></w:sdtContent></w:sdt>', () => {
      const exportedTc = { name: 'w:tc', comment: 'cell xml' };
      vi.mocked(translateChildNodes).mockReturnValueOnce([exportedTc]);

      const row = {
        type: 'tableRow',
        attrs: {},
        content: [
          {
            type: 'tableCell',
            attrs: { cellSdt: { scope: 'cell', sdtPr: SDT_PR, sdtEndPr: null } },
            content: [],
          },
        ],
      };

      const result = translator.decode({ node: row, extraParams: {} }, {});

      expect(result.elements).toHaveLength(1);
      const wrapped = result.elements[0];
      expect(wrapped.name).toBe('w:sdt');
      expect(wrapped.elements).toHaveLength(2);
      expect(wrapped.elements[0]).toBe(SDT_PR);
      expect(wrapped.elements[1]).toEqual({ name: 'w:sdtContent', elements: [exportedTc] });
    });

    it('emits <w:sdtEndPr> in the wrapper when preserved', () => {
      const exportedTc = { name: 'w:tc', comment: 'cell xml' };
      vi.mocked(translateChildNodes).mockReturnValueOnce([exportedTc]);

      const row = {
        type: 'tableRow',
        attrs: {},
        content: [
          {
            type: 'tableCell',
            attrs: { cellSdt: { scope: 'cell', sdtPr: SDT_PR, sdtEndPr: SDT_END_PR } },
            content: [],
          },
        ],
      };

      const result = translator.decode({ node: row, extraParams: {} }, {});

      const wrapped = result.elements[0];
      expect(wrapped.elements).toHaveLength(3);
      expect(wrapped.elements[0]).toBe(SDT_PR);
      expect(wrapped.elements[1]).toBe(SDT_END_PR);
      expect(wrapped.elements[2]).toEqual({ name: 'w:sdtContent', elements: [exportedTc] });
    });

    it('does not wrap cells without cellSdt metadata', () => {
      const tc1 = { name: 'w:tc', comment: 'first' };
      const tc2 = { name: 'w:tc', comment: 'second' };
      vi.mocked(translateChildNodes).mockReturnValueOnce([tc1, tc2]);

      const row = {
        type: 'tableRow',
        attrs: {},
        content: [
          { type: 'tableCell', attrs: {}, content: [] },
          { type: 'tableCell', attrs: { cellSdt: null }, content: [] },
        ],
      };

      const result = translator.decode({ node: row, extraParams: {} }, {});

      expect(result.elements).toEqual([tc1, tc2]);
    });

    it('wraps only the SDT cell when a row has mixed bare and SDT-wrapped cells', () => {
      const bareTc = { name: 'w:tc', comment: 'bare' };
      const wrappedTc = { name: 'w:tc', comment: 'date cell xml' };
      vi.mocked(translateChildNodes).mockReturnValueOnce([bareTc, wrappedTc]);

      const row = {
        type: 'tableRow',
        attrs: {},
        content: [
          { type: 'tableCell', attrs: {}, content: [] },
          {
            type: 'tableCell',
            attrs: { cellSdt: { scope: 'cell', sdtPr: SDT_PR, sdtEndPr: null } },
            content: [],
          },
        ],
      };

      const result = translator.decode({ node: row, extraParams: {} }, {});

      expect(result.elements[0]).toBe(bareTc);
      expect(result.elements[1].name).toBe('w:sdt');
      expect(result.elements[1].elements[1].elements[0]).toBe(wrappedTc);
    });

    it('ignores cellSdt with the wrong scope discriminator', () => {
      const exportedTc = { name: 'w:tc', comment: 'cell xml' };
      vi.mocked(translateChildNodes).mockReturnValueOnce([exportedTc]);

      const row = {
        type: 'tableRow',
        attrs: {},
        content: [
          {
            type: 'tableCell',
            // scope is 'row' (hypothetical future variant) — should not wrap as cell-level
            attrs: { cellSdt: { scope: 'row', sdtPr: SDT_PR, sdtEndPr: null } },
            content: [],
          },
        ],
      };

      const result = translator.decode({ node: row, extraParams: {} }, {});

      expect(result.elements).toEqual([exportedTc]);
    });
  });
});
