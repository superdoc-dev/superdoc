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

    it('uses per-column w:space and ignores section w:space for unequal columns (ECMA-376 §17.6.4)', () => {
      // SD-2324: the reported ISDA sections are <w:cols w:num="4" w:equalWidth="0" w:space="720">
      // with explicit <w:col w:space="0"> children. Per §17.6.4, when columns are NOT equal width
      // the section-level w:space is ignored — the inter-column gap is each column's own w:space.
      // So the gap must be 0 (from the children), not 48px (from the 720-twip section space).
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
                  attributes: { 'w:num': '4', 'w:equalWidth': '0', 'w:space': '720' },
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '2340', 'w:space': '0' } },
                    { name: 'w:col', attributes: { 'w:w': '2340', 'w:space': '0' } },
                    { name: 'w:col', attributes: { 'w:w': '2340', 'w:space': '0' } },
                    { name: 'w:col', attributes: { 'w:w': '2340', 'w:space': '0' } },
                  ],
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result?.columnsPx).toEqual({
        count: 4,
        gap: 0,
        withSeparator: false,
        widths: [156, 156, 156, 156],
        equalWidth: false,
      });
    });

    it('drops child widths and uses the section gap when w:equalWidth="1" (equal mode, Word ignores children)', () => {
      // SD-2324: Word treats w:equalWidth="1" as equal mode regardless of any <w:col w:w> children.
      // It ignores child widths/spaces, derives equal columns from w:num, and the gap from w:cols/@w:space.
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
                  attributes: { 'w:num': '2', 'w:equalWidth': '1', 'w:space': '720' },
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '2880' } },
                    { name: 'w:col', attributes: { 'w:w': '5760' } },
                  ],
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      // No widths emitted; gap from the 720-twip section space (48px). Word equalizes such columns.
      expect(result?.columnsPx).toEqual({
        count: 2,
        gap: 48,
        withSeparator: false,
        equalWidth: true,
      });
    });

    it('drops child widths when w:equalWidth is omitted (omitted defaults to equal mode, like Word)', () => {
      // SD-2324: an omitted w:equalWidth is equal mode in Word (verified: EvenlySpaced=true). Child
      // <w:col w:w> values must NOT leak through as explicit widths.
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
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '2880', 'w:space': '720' } },
                    { name: 'w:col', attributes: { 'w:w': '5760' } },
                  ],
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      // No widths, no equalWidth field; gap from the section space (48px).
      expect(result?.columnsPx).toEqual({
        count: 2,
        gap: 48,
        withSeparator: false,
      });
    });

    it('ignores child w:space and defaults the gap to 720 twips in equal mode (SD-2324 gap-half)', () => {
      // SD-2324: in equal mode the gap comes from w:cols/@w:space only. With the section space omitted,
      // it defaults to 720 twips (48px) even though the children declare w:space="0". Consulting the
      // child space here (the pre-fix behavior) would wrongly yield a 0px gap. Verified against Word.
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
                  attributes: { 'w:num': '2' },
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '2880', 'w:space': '0' } },
                    { name: 'w:col', attributes: { 'w:w': '2880', 'w:space': '0' } },
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
        gap: 48, // 720-twip default, NOT the child w:space of 0
        withSeparator: false,
      });
    });

    it('keeps explicit child widths with a 0 gap when w:equalWidth="0" and no child w:space (SD-2324 F5)', () => {
      // Explicit mode is unchanged by the equal-mode fix: child widths are honored, and an absent child
      // w:space yields a 0 gap (CT_Column/@space default 0), not the 720-twip section default.
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
                    { name: 'w:col', attributes: { 'w:w': '4680' } },
                    { name: 'w:col', attributes: { 'w:w': '4680' } },
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
        gap: 0,
        withSeparator: false,
        widths: [312, 312],
        equalWidth: false,
      });
    });

    it('resolves explicit-mode count as min(w:num default 1, valid child-width count); omitted num stays 1 (SD-2324, Word-verified)', () => {
      // Word caps the explicit column count to the <w:col> children actually provided. With w:num
      // omitted (default 1) and 3 children, Word renders 1 column (verified Count=1), not 3.
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
                  attributes: { 'w:equalWidth': '0' },
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '2880' } },
                    { name: 'w:col', attributes: { 'w:w': '2880' } },
                    { name: 'w:col', attributes: { 'w:w': '2880' } },
                  ],
                },
              ],
            },
          },
        },
      };

      const result = extractSectionData(para);

      // min(1, 3) -> count is 1 (NOT 3 from the children).
      expect(result?.columnsPx?.count).toBe(1);
      expect(result?.columnsPx?.equalWidth).toBe(false);
    });

    it('caps explicit count to the valid child-width count when w:num exceeds it (SD-2324 F8)', () => {
      // w:num="4" with only two <w:col> renders 2 columns in Word (verified), not 4. Capping the
      // count at the source keeps the fill loop (which reads the raw count) from creating surplus
      // 1px phantom columns. min(4, 2) -> 2.
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
                  attributes: { 'w:num': '4', 'w:equalWidth': '0' },
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '2880', 'w:space': '720' } },
                    { name: 'w:col', attributes: { 'w:w': '5760' } },
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
        gap: 48,
        withSeparator: false,
        widths: [192, 384],
        equalWidth: false,
      });
    });

    it('caps to the valid child-width count, ignoring <w:col> with no usable w:w (SD-2324)', () => {
      // Four <w:col> but only two carry a usable w:w; the count caps to those two (widths.length),
      // not the raw four children. min(4, 2) -> 2.
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
                  attributes: { 'w:num': '4', 'w:equalWidth': '0' },
                  elements: [
                    { name: 'w:col', attributes: { 'w:w': '2880' } },
                    { name: 'w:col', attributes: { 'w:w': '5760' } },
                    { name: 'w:col', attributes: { 'w:w': '0' } },
                    { name: 'w:col', attributes: {} },
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
        gap: 0,
        withSeparator: false,
        widths: [192, 384],
        equalWidth: false,
      });
    });

    it('takes the count from w:num in equal mode (count 3, no children) (SD-2324)', () => {
      // Equal mode (omitted equalWidth) takes the count straight from w:num and the gap from the
      // section w:space (720 twips -> 48px); no per-column widths are emitted.
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [{ name: 'w:cols', attributes: { 'w:num': '3', 'w:space': '720' } }],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result?.columnsPx).toEqual({ count: 3, gap: 48, withSeparator: false });
    });

    it('returns no columnsPx when the section has no <w:cols> element (SD-2324)', () => {
      // A sectPr without <w:cols> must not synthesize a column layout.
      const para: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [{ name: 'w:pgSz', attributes: { 'w:w': '12240', 'w:h': '15840' } }],
            },
          },
        },
      };

      const result = extractSectionData(para);

      expect(result).not.toBeNull();
      expect(result?.columnsPx).toBeUndefined();
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
