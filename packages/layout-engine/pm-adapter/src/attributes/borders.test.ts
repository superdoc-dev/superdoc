/**
 * Tests for Border & Shading Normalization Module
 *
 * Covers 10 functions for converting OOXML borders and shading to layout engine formats:
 * - convertBorderSpec: OOXML border → BorderSpec
 * - convertTableBorderValue: OOXML border → TableBorderValue
 * - extractTableBorders: Table-level border extraction
 * - extractCellBorders: Cell-level border extraction
 * - extractCellPadding: Cell padding from cellMargins
 * - normalizeParagraphBorders: Paragraph border normalization
 * - normalizeBorderSide: Single border side normalization
 * - mapBorderStyle: OOXML border style mapping
 * - normalizeParagraphShading: Paragraph shading normalization
 * - normalizeShadingColor: Shading color normalization
 */

import { describe, it, expect } from 'vitest';
import {
  convertBorderSpec,
  convertTableBorderValue,
  extractTableBorders,
  extractCellBorders,
  extractCellPadding,
  normalizeParagraphBorders,
  normalizeBorderSide,
  mapBorderStyle,
  normalizeParagraphShading,
  normalizeShadingColor,
} from './borders.js';

describe('convertBorderSpec', () => {
  describe('valid borders', () => {
    it('should convert complete border with all properties', () => {
      const input = { val: 'single', size: 2, color: 'FF0000' };
      const result = convertBorderSpec(input);
      expect(result?.style).toBe('single');
      expect(result?.color).toBe('#FF0000');
      expect(result?.width).toBeCloseTo(Math.max(0.5, (2 / 8) * (96 / 72)));
    });

    it('should add # prefix to color if missing', () => {
      const input = { val: 'double', size: 4, color: '00FF00' };
      const result = convertBorderSpec(input);
      expect(result?.style).toBe('double');
      expect(result?.color).toBe('#00FF00');
      expect(result?.width).toBeCloseTo(Math.max(0.5, (4 / 8) * (96 / 72)));
    });

    it('should preserve # prefix if already present', () => {
      const input = { val: 'single', size: 1, color: '#0000FF' };
      const result = convertBorderSpec(input);
      expect(result?.style).toBe('single');
      expect(result?.color).toBe('#0000FF');
      expect(result?.width).toBeCloseTo(Math.max(0.5, (1 / 8) * (96 / 72)));
    });

    it('should default to black color for auto', () => {
      const input = { val: 'single', size: 2, color: 'auto' };
      const result = convertBorderSpec(input);
      expect(result?.color).toBe('#000000');
    });

    it('should default to black color when color is missing', () => {
      const input = { val: 'single', size: 2 };
      const result = convertBorderSpec(input);
      expect(result?.color).toBe('#000000');
    });

    it('should default to single style when val is missing', () => {
      const input = { size: 2, color: 'FF0000' };
      const result = convertBorderSpec(input);
      expect(result?.style).toBe('single');
    });

    it('should handle fractional width', () => {
      const input = { val: 'single', size: 1.5, color: 'FF0000' };
      const result = convertBorderSpec(input);
      expect(result?.width).toBeCloseTo(Math.max(0.5, (1.5 / 8) * (96 / 72)));
    });

    it('should convert eighths-of-point sizes to pixels', () => {
      const input = { val: 'single', size: 16, color: 'FF0000' };
      const result = convertBorderSpec(input);
      expect(result?.width).toBeCloseTo((16 / 8) * (96 / 72));
    });

    it('should handle various border styles', () => {
      const styles = ['single', 'double', 'dashed', 'dotted', 'thick', 'dashDotStroked'];
      styles.forEach((style) => {
        const result = convertBorderSpec({ val: style, size: 2 });
        expect(result?.style).toBe(style);
      });
    });
  });

  describe('nil/none/zero borders', () => {
    it('should return none style for nil border', () => {
      const input = { val: 'nil', size: 2, color: 'FF0000' };
      const result = convertBorderSpec(input);
      expect(result).toEqual({ style: 'none', width: 0 });
    });

    it('should return none style for none border', () => {
      const input = { val: 'none', size: 2, color: 'FF0000' };
      const result = convertBorderSpec(input);
      expect(result).toEqual({ style: 'none', width: 0 });
    });

    it('should return none style for zero width border', () => {
      const input = { val: 'single', size: 0, color: 'FF0000' };
      const result = convertBorderSpec(input);
      expect(result).toEqual({ style: 'none', width: 0 });
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for null', () => {
      expect(convertBorderSpec(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(convertBorderSpec(undefined)).toBeUndefined();
    });

    it('should return undefined for non-object', () => {
      expect(convertBorderSpec('string')).toBeUndefined();
      expect(convertBorderSpec(123)).toBeUndefined();
      expect(convertBorderSpec(true)).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      expect(convertBorderSpec({})).toBeUndefined();
    });

    it('should return undefined when size is undefined', () => {
      const input = { val: 'single', color: 'FF0000' };
      expect(convertBorderSpec(input)).toBeUndefined();
    });

    it('should return undefined when size is null', () => {
      const input = { val: 'single', size: null, color: 'FF0000' };
      expect(convertBorderSpec(input)).toBeUndefined();
    });

    it('should return undefined for NaN size', () => {
      const input = { val: 'single', size: NaN, color: 'FF0000' };
      expect(convertBorderSpec(input)).toBeUndefined();
    });

    it('should return undefined for Infinity size', () => {
      const input = { val: 'single', size: Infinity, color: 'FF0000' };
      expect(convertBorderSpec(input)).toBeUndefined();
    });

    it('should return undefined for -Infinity size', () => {
      const input = { val: 'single', size: -Infinity, color: 'FF0000' };
      expect(convertBorderSpec(input)).toBeUndefined();
    });

    it('should return undefined for non-number size', () => {
      const input = { val: 'single', size: '2', color: 'FF0000' };
      expect(convertBorderSpec(input)).toBeUndefined();
    });

    it('should return undefined for non-string color', () => {
      const input = { val: 'single', size: 2, color: 123 };
      expect(convertBorderSpec(input)).toBeUndefined();
    });

    it('should handle object with only non-border properties', () => {
      const input = { other: 'value', unrelated: 123 };
      expect(convertBorderSpec(input)).toBeUndefined();
    });
  });
});

describe('convertTableBorderValue', () => {
  describe('valid borders', () => {
    it('should convert complete border with all properties', () => {
      const input = { val: 'single', size: 2, color: 'FF0000' };
      const result = convertTableBorderValue(input);
      expect(result?.style).toBe('single');
      expect(result?.color).toBe('#FF0000');
      expect(result?.width).toBeCloseTo(Math.max(0.5, (2 / 8) * (96 / 72)));
    });

    it('should add # prefix to color if missing', () => {
      const input = { val: 'double', size: 4, color: '00FF00' };
      const result = convertTableBorderValue(input);
      expect(result?.color).toBe('#00FF00');
    });

    it('should default to black for auto color', () => {
      const input = { val: 'single', size: 2, color: 'auto' };
      const result = convertTableBorderValue(input);
      expect(result?.color).toBe('#000000');
    });

    it('should convert border size units to pixels', () => {
      const input = { val: 'single', size: 24, color: 'FF0000' };
      const result = convertTableBorderValue(input);
      expect(result?.width).toBeCloseTo((24 / 8) * (96 / 72));
    });
  });

  describe('nil/none/zero borders', () => {
    it('should return {none: true} for nil border', () => {
      const input = { val: 'nil', size: 2 };
      const result = convertTableBorderValue(input);
      expect(result).toEqual({ none: true });
    });

    it('should return {none: true} for none border', () => {
      const input = { val: 'none', size: 2 };
      const result = convertTableBorderValue(input);
      expect(result).toEqual({ none: true });
    });

    it('should return {none: true} for zero width', () => {
      const input = { val: 'single', size: 0 };
      const result = convertTableBorderValue(input);
      expect(result).toEqual({ none: true });
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for null', () => {
      expect(convertTableBorderValue(null)).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      expect(convertTableBorderValue({})).toBeUndefined();
    });

    it('should return undefined when size is missing', () => {
      expect(convertTableBorderValue({ val: 'single' })).toBeUndefined();
    });
  });
});

describe('extractTableBorders', () => {
  describe('already normalized borders extraction', () => {
    it('should extract already normalized TableBorderValue objects', () => {
      const input = {
        top: { style: 'single', width: 2, color: '#FF0000' },
        bottom: { style: 'double', width: 4, color: '#00FF00' },
      };
      const result = extractTableBorders(input);
      expect(result).toEqual({
        top: { style: 'single', width: 2, color: '#FF0000' },
        bottom: { style: 'double', width: 4, color: '#00FF00' },
      });
    });

    it('should handle all six border sides when already normalized', () => {
      const input = {
        top: { style: 'single', width: 1 },
        right: { style: 'single', width: 2 },
        bottom: { style: 'single', width: 3 },
        left: { style: 'single', width: 4 },
        insideH: { style: 'single', width: 5 },
        insideV: { style: 'single', width: 6 },
      };
      const result = extractTableBorders(input);
      expect(result).toHaveProperty('top');
      expect(result).toHaveProperty('right');
      expect(result).toHaveProperty('bottom');
      expect(result).toHaveProperty('left');
      expect(result).toHaveProperty('insideH');
      expect(result).toHaveProperty('insideV');
    });
  });

  describe('raw OOXML borders extraction', () => {
    it('should convert raw OOXML borders to TableBorderValue format', () => {
      const input = {
        top: { val: 'single', size: 2, color: 'FF0000' },
        bottom: { val: 'double', size: 4, color: '00FF00' },
      };
      const result = extractTableBorders(input);
      expect(result?.top?.style).toBe('single');
      expect(result?.top?.color).toBe('#FF0000');
      expect(result?.top?.width).toBeCloseTo(Math.max(0.5, (2 / 8) * (96 / 72)));
      expect(result?.bottom?.style).toBe('double');
      expect(result?.bottom?.color).toBe('#00FF00');
      expect(result?.bottom?.width).toBeCloseTo(Math.max(0.5, (4 / 8) * (96 / 72)));
    });

    it('should handle all six border sides from raw OOXML', () => {
      const input = {
        top: { val: 'single', size: 1 },
        right: { val: 'single', size: 2 },
        bottom: { val: 'single', size: 3 },
        left: { val: 'single', size: 4 },
        insideH: { val: 'single', size: 5 },
        insideV: { val: 'single', size: 6 },
      };
      const result = extractTableBorders(input);
      expect(Object.keys(result!)).toHaveLength(6);
    });

    it('should convert nil borders to {none: true}', () => {
      const input = {
        top: { val: 'single', size: 2 },
        bottom: { val: 'nil', size: 2 },
      };
      const result = extractTableBorders(input);
      expect(result?.top).toBeDefined();
      expect(result?.bottom).toEqual({ none: true });
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined when no borders present', () => {
      expect(extractTableBorders({})).toBeUndefined();
    });

    it('should return undefined when input is empty object', () => {
      expect(extractTableBorders({})).toBeUndefined();
    });

    it('should return undefined when all borders are invalid', () => {
      const input = {
        top: { val: 'single' }, // Missing size
        bottom: null,
      };
      expect(extractTableBorders(input)).toBeUndefined();
    });
  });
});

describe('extractCellBorders', () => {
  describe('valid cell borders', () => {
    it('should extract all four cell border sides', () => {
      const input = {
        borders: {
          top: { val: 'single', size: 1, color: 'FF0000' },
          right: { val: 'double', size: 2, color: '00FF00' },
          bottom: { val: 'dashed', size: 3, color: '0000FF' },
          left: { val: 'dotted', size: 4, color: 'FFFF00' },
        },
      };
      const result = extractCellBorders(input);
      expect(result?.top?.style).toBe('single');
      expect(result?.top?.color).toBe('#FF0000');
      expect(result?.top?.width).toBeCloseTo(Math.max(0.5, (1 / 8) * (96 / 72)));
      expect(result?.right?.style).toBe('double');
      expect(result?.right?.color).toBe('#00FF00');
      expect(result?.right?.width).toBeCloseTo(Math.max(0.5, (2 / 8) * (96 / 72)));
      expect(result?.bottom?.style).toBe('dashed');
      expect(result?.bottom?.color).toBe('#0000FF');
      expect(result?.bottom?.width).toBeCloseTo(Math.max(0.5, (3 / 8) * (96 / 72)));
      expect(result?.left?.style).toBe('dotted');
      expect(result?.left?.color).toBe('#FFFF00');
      expect(result?.left?.width).toBeCloseTo(Math.max(0.5, (4 / 8) * (96 / 72)));
    });

    it('should extract partial cell borders', () => {
      const input = {
        borders: {
          top: { val: 'single', size: 2 },
          bottom: { val: 'single', size: 2 },
        },
      };
      const result = extractCellBorders(input);
      expect(result?.top).toBeDefined();
      expect(result?.bottom).toBeDefined();
      expect(result?.left).toBeUndefined();
      expect(result?.right).toBeUndefined();
    });

    it('should skip nil borders', () => {
      const input = {
        borders: {
          top: { val: 'single', size: 2 },
          bottom: { val: 'nil', size: 0 },
        },
      };
      const result = extractCellBorders(input);
      expect(result?.top).toBeDefined();
      expect(result?.bottom).toEqual({ style: 'none', width: 0 });
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined when cellAttrs has no borders', () => {
      expect(extractCellBorders({})).toBeUndefined();
    });

    it('should return undefined when all borders are invalid', () => {
      const input = {
        borders: {
          top: { val: 'single' }, // Missing size
          bottom: null,
        },
      };
      expect(extractCellBorders(input)).toBeUndefined();
    });

    it('should return undefined for empty borders object', () => {
      expect(extractCellBorders({ borders: {} })).toBeUndefined();
    });
  });
});

describe('extractCellPadding', () => {
  describe('valid cell padding', () => {
    it('should extract all four padding sides', () => {
      const input = {
        cellMargins: {
          top: 10,
          right: 20,
          bottom: 15,
          left: 25,
        },
      };
      const result = extractCellPadding(input);
      expect(result).toEqual({
        top: 10,
        right: 20,
        bottom: 15,
        left: 25,
      });
    });

    it('should extract partial padding', () => {
      const input = {
        cellMargins: {
          top: 10,
          bottom: 15,
        },
      };
      const result = extractCellPadding(input);
      expect(result).toEqual({
        top: 10,
        bottom: 15,
      });
    });

    it('should handle zero padding values', () => {
      const input = {
        cellMargins: {
          top: 0,
          right: 0,
        },
      };
      const result = extractCellPadding(input);
      expect(result).toEqual({
        top: 0,
        right: 0,
      });
    });

    it('should handle fractional padding', () => {
      const input = {
        cellMargins: {
          top: 10.5,
          left: 12.75,
        },
      };
      const result = extractCellPadding(input);
      expect(result).toEqual({
        top: 10.5,
        left: 12.75,
      });
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined when no cellMargins', () => {
      expect(extractCellPadding({})).toBeUndefined();
    });

    it('should return undefined when cellMargins is not an object', () => {
      expect(extractCellPadding({ cellMargins: 'string' })).toBeUndefined();
      expect(extractCellPadding({ cellMargins: 123 })).toBeUndefined();
    });

    it('should return undefined when cellMargins is empty', () => {
      expect(extractCellPadding({ cellMargins: {} })).toBeUndefined();
    });

    it('should skip non-numeric values', () => {
      const input = {
        cellMargins: {
          top: 10,
          right: 'not a number',
          bottom: null,
          left: undefined,
        },
      };
      const result = extractCellPadding(input);
      expect(result).toEqual({ top: 10 });
    });
  });
});

describe('normalizeParagraphBorders', () => {
  describe('valid paragraph borders', () => {
    it('should normalize all four border sides', () => {
      const input = {
        top: { val: 'single', size: 1, color: 'FF0000' },
        right: { val: 'double', size: 2, color: '00FF00' },
        bottom: { val: 'dashed', size: 3, color: '0000FF' },
        left: { val: 'dotted', size: 4, color: 'FFFF00' },
      };
      const result = normalizeParagraphBorders(input);
      expect(result?.top).toBeDefined();
      expect(result?.right).toBeDefined();
      expect(result?.bottom).toBeDefined();
      expect(result?.left).toBeDefined();
    });

    it('should normalize partial borders', () => {
      const input = {
        top: { val: 'single', size: 2 },
        bottom: { val: 'double', size: 4 },
      };
      const result = normalizeParagraphBorders(input);
      expect(result?.top).toBeDefined();
      expect(result?.bottom).toBeDefined();
      expect(result?.left).toBeUndefined();
      expect(result?.right).toBeUndefined();
    });
  });

  describe('nil borders exclusion', () => {
    it('should exclude nil borders from result', () => {
      const input = {
        top: { val: 'single', size: 2, color: 'FF0000' },
        bottom: { val: 'nil' },
        left: { val: 'none' },
        right: { val: 'double', size: 4 },
      };
      const result = normalizeParagraphBorders(input);
      expect(result).toBeDefined();
      expect(result?.top).toBeDefined();
      expect(result?.right).toBeDefined();
      expect(result?.bottom).toBeUndefined();
      expect(result?.left).toBeUndefined();
    });

    it('should return undefined when all borders are nil', () => {
      const input = {
        top: { val: 'nil' },
        bottom: { val: 'none' },
        left: { val: 'nil' },
        right: { val: 'none' },
      };
      expect(normalizeParagraphBorders(input)).toBeUndefined();
    });

    it('should normalize between border', () => {
      const input = {
        top: { val: 'single', size: 1, color: 'FF0000' },
        between: { val: 'single', size: 2, color: '0000FF' },
      };
      const result = normalizeParagraphBorders(input);
      expect(result?.top).toBeDefined();
      expect(result?.between).toBeDefined();
      expect(result?.between?.style).toBe('solid');
      expect(result?.between?.color).toContain('0000FF');
    });

    it('should normalize between border alone', () => {
      const input = {
        between: { val: 'dashed', size: 4, color: '00FF00' },
      };
      const result = normalizeParagraphBorders(input);
      expect(result).toBeDefined();
      expect(result?.between).toBeDefined();
      expect(result?.between?.style).toBe('dashed');
    });

    it('should return undefined when between border is nil', () => {
      const input = {
        between: { val: 'nil' },
      };
      expect(normalizeParagraphBorders(input)).toBeUndefined();
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for null', () => {
      expect(normalizeParagraphBorders(null)).toBeUndefined();
    });

    it('should return undefined for non-object', () => {
      expect(normalizeParagraphBorders('string')).toBeUndefined();
    });

    it('should return undefined when all sides are invalid', () => {
      const input = {
        top: null,
        bottom: undefined,
        left: 'invalid',
      };
      expect(normalizeParagraphBorders(input)).toBeUndefined();
    });
  });
});

describe('normalizeBorderSide', () => {
  describe('valid border sides', () => {
    it('should normalize complete border side', () => {
      // size is in OOXML eighths-of-a-point: 16 eighths = 2pt = 2.67px
      const input = { val: 'single', size: 16, color: '#FF0000', space: 5 };
      const result = normalizeBorderSide(input);
      expect(result).toEqual({
        style: 'solid',
        width: (16 / 8) * (96 / 72), // 2pt in pixels
        color: '#FF0000',
        space: 5,
      });
    });

    it('should normalize border with only style', () => {
      const input = { val: 'double' };
      const result = normalizeBorderSide(input);
      expect(result).toEqual({ style: 'double' });
    });

    it('should normalize border with only width', () => {
      // size is in OOXML eighths-of-a-point: 24 eighths = 3pt = 4px
      const input = { size: 24 };
      const result = normalizeBorderSide(input);
      expect(result).toEqual({ width: (24 / 8) * (96 / 72) }); // 3pt in pixels
    });

    it('should clamp negative width to zero', () => {
      const input = { size: -5 };
      const result = normalizeBorderSide(input);
      expect(result?.width).toBe(0);
    });

    it('should clamp negative space to zero', () => {
      const input = { space: -10 };
      const result = normalizeBorderSide(input);
      expect(result?.space).toBe(0);
    });

    it('should handle zero width', () => {
      const input = { size: 0 };
      const result = normalizeBorderSide(input);
      expect(result?.width).toBe(0);
    });

    it('should convert OOXML widths to pixels', () => {
      const input = { size: 32 };
      const result = normalizeBorderSide(input);
      expect(result?.width).toBeCloseTo((32 / 8) * (96 / 72));
    });
  });

  describe('nil and none borders', () => {
    it('should return undefined for nil border without size', () => {
      const input = { val: 'nil' };
      expect(normalizeBorderSide(input)).toBeUndefined();
    });

    it('should return undefined for none border without size', () => {
      const input = { val: 'none' };
      expect(normalizeBorderSide(input)).toBeUndefined();
    });

    it('should return undefined for nil border with size', () => {
      const input = { val: 'nil', size: 2 };
      expect(normalizeBorderSide(input)).toBeUndefined();
    });

    it('should return undefined for none border with size', () => {
      const input = { val: 'none', size: 2 };
      expect(normalizeBorderSide(input)).toBeUndefined();
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for null', () => {
      expect(normalizeBorderSide(null)).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      expect(normalizeBorderSide({})).toBeUndefined();
    });

    it('should return undefined when all properties are invalid', () => {
      const input = { other: 'value', unrelated: 123 };
      expect(normalizeBorderSide(input)).toBeUndefined();
    });
  });
});

describe('mapBorderStyle', () => {
  describe('special styles', () => {
    it('should map "nil" to "none"', () => {
      expect(mapBorderStyle('nil')).toBe('none');
    });

    it('should map "none" to "none"', () => {
      expect(mapBorderStyle('none')).toBe('none');
    });

    it('should map "double" to "double"', () => {
      expect(mapBorderStyle('double')).toBe('double');
    });
  });

  describe('dashed variants', () => {
    it('should map "dashed" to "dashed"', () => {
      expect(mapBorderStyle('dashed')).toBe('dashed');
    });

    it('should map "dashsmallgap" to "dashed"', () => {
      expect(mapBorderStyle('dashsmallgap')).toBe('dashed');
    });

    it('should map "dashlargegap" to "dashed"', () => {
      expect(mapBorderStyle('dashlargegap')).toBe('dashed');
    });
  });

  describe('dotted variants', () => {
    it('should map "dotted" to "dotted"', () => {
      expect(mapBorderStyle('dotted')).toBe('dotted');
    });

    it('should map "dot" to "dotted"', () => {
      expect(mapBorderStyle('dot')).toBe('dotted');
    });
  });

  describe('default to solid', () => {
    it('should map "single" to "solid"', () => {
      expect(mapBorderStyle('single')).toBe('solid');
    });

    it('should map "thick" to "solid"', () => {
      expect(mapBorderStyle('thick')).toBe('solid');
    });

    it('should map "thickThinSmallGap" to "solid"', () => {
      expect(mapBorderStyle('thickThinSmallGap')).toBe('solid');
    });

    it('should map unknown style to "solid"', () => {
      expect(mapBorderStyle('unknown')).toBe('solid');
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase NIL', () => {
      expect(mapBorderStyle('NIL')).toBe('none');
    });

    it('should handle uppercase DOUBLE', () => {
      expect(mapBorderStyle('DOUBLE')).toBe('double');
    });

    it('should handle mixed case DashSmallGap', () => {
      expect(mapBorderStyle('DashSmallGap')).toBe('dashed');
    });

    it('should handle uppercase DOTTED', () => {
      expect(mapBorderStyle('DOTTED')).toBe('dotted');
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for non-string', () => {
      expect(mapBorderStyle(123)).toBeUndefined();
      expect(mapBorderStyle(null)).toBeUndefined();
      expect(mapBorderStyle(undefined)).toBeUndefined();
      expect(mapBorderStyle({})).toBeUndefined();
    });
  });
});

describe('normalizeParagraphShading', () => {
  describe('valid shading', () => {
    it('should normalize fill color', () => {
      const input = { fill: '#FF0000' };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({ fill: '#FF0000' });
    });

    it('should normalize color', () => {
      const input = { color: '#00FF00' };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({ color: '#00FF00' });
    });

    it('should normalize val (shading pattern)', () => {
      const input = { val: 'clear' };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({ val: 'clear' });
    });

    it('should normalize all theme properties', () => {
      const input = {
        themeColor: 'accent1',
        themeFill: 'accent2',
        themeFillShade: 'BF',
        themeFillTint: '40',
        themeShade: 'BF',
        themeTint: '40',
      };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({
        themeColor: 'accent1',
        themeFill: 'accent2',
        themeFillShade: 'BF',
        themeFillTint: '40',
        themeShade: 'BF',
        themeTint: '40',
      });
    });

    it('should normalize complete shading object', () => {
      const input = {
        fill: '#FFFF00',
        color: '#000000',
        val: 'clear',
        themeColor: 'accent1',
      };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({
        fill: '#FFFF00',
        color: '#000000',
        val: 'clear',
        themeColor: 'accent1',
      });
    });

    it('should trim string values', () => {
      const input = { val: '  clear  ', themeColor: '  accent1  ' };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({ val: 'clear', themeColor: 'accent1' });
    });
  });

  describe('auto color filtering', () => {
    it('should filter out "auto" fill color', () => {
      const input = { fill: 'auto', color: '#FF0000' };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({ color: '#FF0000' });
    });

    it('should filter out "auto" color', () => {
      const input = { fill: '#FF0000', color: 'auto' };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({ fill: '#FF0000' });
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for null', () => {
      expect(normalizeParagraphShading(null)).toBeUndefined();
    });

    it('should return undefined for non-object', () => {
      expect(normalizeParagraphShading('string')).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      expect(normalizeParagraphShading({})).toBeUndefined();
    });

    it('should skip empty string values', () => {
      const input = { val: '', themeColor: '  ', fill: '#FF0000' };
      const result = normalizeParagraphShading(input);
      expect(result).toEqual({ fill: '#FF0000' });
    });
  });
});

describe('normalizeShadingColor', () => {
  describe('valid colors', () => {
    it('should normalize color with # prefix', () => {
      expect(normalizeShadingColor('#FF0000')).toBe('#FF0000');
    });

    it('should normalize color without # prefix', () => {
      expect(normalizeShadingColor('00FF00')).toBe('#00FF00');
    });

    it('should handle uppercase color codes', () => {
      expect(normalizeShadingColor('ABCDEF')).toBe('#ABCDEF');
    });

    it('should handle lowercase color codes', () => {
      expect(normalizeShadingColor('abcdef')).toBe('#abcdef');
    });
  });

  describe('auto filtering', () => {
    it('should filter out "auto"', () => {
      expect(normalizeShadingColor('auto')).toBeUndefined();
    });

    it('should filter out "AUTO" (case insensitive)', () => {
      // Fixed: now handles case-insensitively
      expect(normalizeShadingColor('AUTO')).toBeUndefined();
    });

    it('should filter out "Auto" (case insensitive)', () => {
      // Fixed: now handles case-insensitively
      expect(normalizeShadingColor('Auto')).toBeUndefined();
    });
  });

  describe('invalid inputs', () => {
    it('should return undefined for null', () => {
      expect(normalizeShadingColor(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(normalizeShadingColor(undefined)).toBeUndefined();
    });

    it('should return undefined for non-string', () => {
      expect(normalizeShadingColor(123)).toBeUndefined();
      expect(normalizeShadingColor({})).toBeUndefined();
    });
  });
});
