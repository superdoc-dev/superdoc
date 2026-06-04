/**
 * Tests for Section Extraction Module
 */

import { describe, it, expect } from 'vitest';
import { extractSectionData, parseColumnCount, parseColumnGap } from './extraction.js';
import type { PMNode } from '../types.js';

describe('extraction', () => {
  // ==================== extractVerticalAlign (via extractSectionData) Tests ====================
  describe('extractSectionData - vAlign extraction', () => {
    it('should extract vAlign "top" from sectPr', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                  attributes: { 'w:val': 'top' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBe('top');
    });

    it('should extract vAlign "center" from sectPr', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                  attributes: { 'w:val': 'center' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBe('center');
    });

    it('should extract vAlign "bottom" from sectPr', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                  attributes: { 'w:val': 'bottom' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBe('bottom');
    });

    it('should extract vAlign "both" from sectPr', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                  attributes: { 'w:val': 'both' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBe('both');
    });

    it('should return undefined vAlign when w:vAlign element is missing', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:pgSz',
                  attributes: { 'w:w': '12240', 'w:h': '15840' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBeUndefined();
    });

    it('should return undefined vAlign when w:val attribute is missing', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                  attributes: {},
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBeUndefined();
    });

    it('should return undefined vAlign for invalid w:val value', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                  attributes: { 'w:val': 'invalid' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBeUndefined();
    });

    it('should return undefined vAlign when w:vAlign has no attributes', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.vAlign).toBeUndefined();
    });
  });

  // ==================== extractSectionData - comprehensive tests ====================
  describe('extractSectionData - complete section data', () => {
    it('should extract vAlign along with other section properties', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:type',
                  attributes: { 'w:val': 'nextPage' },
                },
                {
                  name: 'w:pgSz',
                  attributes: { 'w:w': '12240', 'w:h': '15840' },
                },
                {
                  name: 'w:vAlign',
                  attributes: { 'w:val': 'center' },
                },
                {
                  name: 'w:cols',
                  attributes: { 'w:num': '2', 'w:space': '720' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('nextPage');
      expect(result?.vAlign).toBe('center');
      expect(result?.columnsPx).toEqual({
        count: 2,
        gap: 48, // 720 twips = 0.5 inches = 48 pixels
        withSeparator: false,
      });
    });

    it('should extract explicit custom column widths when w:cols contains w:col children', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:cols',
                  attributes: { 'w:num': '2', 'w:equalWidth': '0' },
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '1080', 'w:space': '1523' } },
                    { name: 'w:col', attributes: { 'w:w': '7459' } },
                  ],
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result?.columnsPx).toEqual({
        count: 2,
        gap: 101.53333333333333,
        withSeparator: false,
        widths: [72, 497.26666666666665],
        equalWidth: false,
      });
    });

    it('should handle section with only normalized margins and no sectPr elements', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          sectionMargins: {
            header: 0.5,
            footer: 0.5,
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.headerPx).toBe(48); // 0.5 inches * 96 px/inch
      expect(result?.footerPx).toBe(48);
      expect(result?.vAlign).toBeUndefined();
    });

    it('should return null when no section data is present', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {},
      };

      const result = extractSectionData(para);

      expect(result).toBeNull();
    });

    it('should default type to "nextPage" when sectPr exists but w:type is missing', () => {
      // type still defaults to 'nextPage' (preserves the established
      // pipeline behavior). The added `typeIsExplicit: false` flag tells
      // the column-balancing gate the type was defaulted, not authored —
      // critical for distinguishing sd-1655 (Word does NOT balance) from
      // sd-1480 (explicit continuous → Word balances).
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:vAlign',
                  attributes: { 'w:val': 'bottom' },
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('nextPage');
      expect(result?.typeIsExplicit).toBe(false);
      expect(result?.vAlign).toBe('bottom');
    });
  });

  describe('extractSectionData - page numbering chapter attributes', () => {
    function paragraphWithPgNumType(attributes: Record<string, string>): PMNode {
      return {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [{ name: 'w:pgNumType', attributes }],
            },
          },
        },
      };
    }

    it('should extract positive w:chapStyle from pgNumType', () => {
      const result = extractSectionData(paragraphWithPgNumType({ 'w:chapStyle': '1' }));

      expect(result?.numbering).toEqual({
        format: undefined,
        chapterStyle: 1,
      });
    });

    it('should extract each valid w:chapSep value', () => {
      const separators = ['hyphen', 'period', 'colon', 'emDash', 'enDash'] as const;

      for (const separator of separators) {
        const result = extractSectionData(paragraphWithPgNumType({ 'w:chapSep': separator }));

        expect(result?.numbering).toEqual({
          format: undefined,
          chapterSeparator: separator,
        });
      }
    });

    it('should ignore invalid w:chapSep values', () => {
      const result = extractSectionData(paragraphWithPgNumType({ 'w:chapSep': 'slash' }));

      expect(result?.numbering).toBeUndefined();
    });

    it('should ignore invalid and non-positive w:chapStyle values', () => {
      expect(extractSectionData(paragraphWithPgNumType({ 'w:chapStyle': '0' }))?.numbering).toBeUndefined();
      expect(extractSectionData(paragraphWithPgNumType({ 'w:chapStyle': '-1' }))?.numbering).toBeUndefined();
      expect(extractSectionData(paragraphWithPgNumType({ 'w:chapStyle': '1.5' }))?.numbering).toBeUndefined();
      expect(extractSectionData(paragraphWithPgNumType({ 'w:chapStyle': 'Heading1' }))?.numbering).toBeUndefined();
    });

    it('should preserve existing start-implies-decimal behavior with chapter attributes', () => {
      const result = extractSectionData(
        paragraphWithPgNumType({ 'w:start': '3', 'w:chapStyle': '2', 'w:chapSep': 'colon' }),
      );

      expect(result?.numbering).toEqual({
        format: 'decimal',
        start: 3,
        chapterStyle: 2,
        chapterSeparator: 'colon',
      });
    });
  });

  // ==================== parseColumnCount Tests ====================
  describe('parseColumnCount', () => {
    it('should return 1 when rawValue is undefined', () => {
      expect(parseColumnCount(undefined)).toBe(1);
    });

    it('should return 1 when rawValue is null', () => {
      expect(parseColumnCount(null as unknown as undefined)).toBe(1);
    });

    it('should parse valid numeric string', () => {
      expect(parseColumnCount('3')).toBe(3);
    });

    it('should parse valid number', () => {
      expect(parseColumnCount(2)).toBe(2);
    });

    it('should return 1 for invalid string', () => {
      expect(parseColumnCount('invalid')).toBe(1);
    });

    it('should return 1 for zero', () => {
      expect(parseColumnCount(0)).toBe(1);
    });

    it('should return 1 for negative number', () => {
      expect(parseColumnCount(-5)).toBe(1);
    });
  });

  // ==================== extractSectionData - column separator (w:sep) tests ====================
  describe('extractSectionData - column separator', () => {
    it('should include separator when w:sep="1"', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:cols',
                  attributes: { 'w:num': '2', 'w:space': '720', 'w:sep': '1' },
                },
              ],
            },
          },
        },
      };
      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.columnsPx).toEqual({
        count: 2,
        gap: 48,
        withSeparator: true,
      });
    });

    it('should include separator when w:sep="true"', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:cols',
                  attributes: { 'w:num': '2', 'w:space': '720', 'w:sep': 'true' },
                },
              ],
            },
          },
        },
      };
      const result = extractSectionData(para);

      expect(result?.columnsPx?.withSeparator).toBe(true);
    });

    it('should include separator when w:sep="on"', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:cols',
                  attributes: { 'w:num': '2', 'w:space': '720', 'w:sep': 'on' },
                },
              ],
            },
          },
        },
      };
      const result = extractSectionData(para);

      expect(result?.columnsPx?.withSeparator).toBe(true);
    });

    it('should not include separator when w:sep is absent', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:cols',
                  attributes: { 'w:num': '2', 'w:space': '720' },
                },
              ],
            },
          },
        },
      };
      const result = extractSectionData(para);

      expect(result?.columnsPx).toEqual({ count: 2, gap: 48, withSeparator: false });
    });

    it('should not include separator when w:sep="0"', () => {
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [
                {
                  name: 'w:cols',
                  attributes: { 'w:num': '2', 'w:space': '720', 'w:sep': '0' },
                },
              ],
            },
          },
        },
      };
      const result = extractSectionData(para);

      expect(result?.columnsPx).toEqual({ count: 2, gap: 48, withSeparator: false });
    });
  });

  // ==================== parseColumnGap Tests ====================
  describe('parseColumnGap', () => {
    it('should return default 0.5 inches when gapTwips is undefined', () => {
      expect(parseColumnGap(undefined)).toBe(0.5);
    });

    it('should return default 0.5 inches when gapTwips is null', () => {
      expect(parseColumnGap(null as unknown as undefined)).toBe(0.5);
    });

    it('should convert 720 twips to 0.5 inches', () => {
      expect(parseColumnGap(720)).toBe(0.5);
    });

    it('should convert 1440 twips to 1 inch', () => {
      expect(parseColumnGap(1440)).toBe(1);
    });

    it('should convert numeric string', () => {
      expect(parseColumnGap('720')).toBe(0.5);
    });

    it('should return default for invalid string', () => {
      expect(parseColumnGap('invalid')).toBe(0.5);
    });
  });
});
