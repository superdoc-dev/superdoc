import { describe, it, expect } from 'vitest';
import { pixelsToTwips } from '@converter/helpers.js';
import {
  DEFAULT_COLUMN_WIDTH_PX,
  getSchemaDefaultColumnWidthPx,
  getTableWidthPx,
  normalizeTwipWidth,
  resolveFallbackColumnWidthTwips,
} from './tblGrid-helpers.js';

describe('tblGrid helpers', () => {
  describe('normalizeTwipWidth', () => {
    it('returns numeric values for valid input', () => {
      expect(normalizeTwipWidth('2400')).toBe(2400);
      expect(normalizeTwipWidth(1200)).toBe(1200);
    });

    it('returns null for invalid values', () => {
      expect(normalizeTwipWidth(null)).toBeNull();
      expect(normalizeTwipWidth(undefined)).toBeNull();
      expect(normalizeTwipWidth('abc')).toBeNull();
      expect(normalizeTwipWidth(0)).toBeNull();
      expect(normalizeTwipWidth(-20)).toBeNull();
    });
  });

  describe('getSchemaDefaultColumnWidthPx', () => {
    it('uses the first positive width from array defaults', () => {
      const params = {
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: [null, 180] } } } },
            },
          },
        },
      };
      expect(getSchemaDefaultColumnWidthPx(params)).toBe(180);
    });

    it('supports numeric defaults', () => {
      const params = {
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: 160 } } } },
            },
          },
        },
      };
      expect(getSchemaDefaultColumnWidthPx(params)).toBe(160);
    });

    it('falls back to DEFAULT_COLUMN_WIDTH_PX when missing', () => {
      expect(getSchemaDefaultColumnWidthPx({})).toBe(DEFAULT_COLUMN_WIDTH_PX);
    });
  });

  describe('getTableWidthPx', () => {
    it('returns explicit table width when provided', () => {
      const params = { node: { attrs: { tableWidth: { width: 420 } } } };
      expect(getTableWidthPx(params)).toBe(420);
    });

    it('translates tableProperties width in twips', () => {
      const params = {
        node: {
          attrs: {
            tableProperties: {
              tableWidth: { value: 1440, type: 'dxa' },
            },
          },
        },
      };
      expect(getTableWidthPx(params)).toBeCloseTo(96, 3);
    });

    it('ignores unsupported width types', () => {
      const params = {
        node: {
          attrs: {
            tableProperties: {
              tableWidth: { value: 1440, type: 'pct' },
            },
          },
        },
      };
      expect(getTableWidthPx(params)).toBeNull();
    });
  });

  describe('resolveFallbackColumnWidthTwips', () => {
    const cellMinWidthTwips = pixelsToTwips(10);

    it('uses table width when available', () => {
      const params = {
        node: { attrs: { tableWidth: { width: 400 } } },
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: [160] } } } },
            },
          },
        },
      };

      const result = resolveFallbackColumnWidthTwips(params, 2, cellMinWidthTwips);
      expect(result).toBe(pixelsToTwips(200));
    });

    it('falls back to schema default when table width absent', () => {
      const params = {
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: [120] } } } },
            },
          },
        },
      };

      const result = resolveFallbackColumnWidthTwips(params, 3, cellMinWidthTwips);
      expect(result).toBe(pixelsToTwips(120));
    });

    it('respects the minimum cell width', () => {
      const params = {
        node: { attrs: { tableWidth: { width: 5 } } },
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: [5] } } } },
            },
          },
        },
      };

      const result = resolveFallbackColumnWidthTwips(params, 5, cellMinWidthTwips);
      expect(result).toBe(cellMinWidthTwips);
    });

    it('guards against non-finite computed widths', () => {
      const params = {
        editor: {
          schema: {
            nodes: {
              tableCell: { spec: { attrs: { colwidth: { default: [Infinity] } } } },
            },
          },
        },
      };

      const result = resolveFallbackColumnWidthTwips(params, 2, cellMinWidthTwips);
      const expected = Math.max(pixelsToTwips(DEFAULT_COLUMN_WIDTH_PX), cellMinWidthTwips);
      expect(result).toBe(expected);
    });
  });
});
