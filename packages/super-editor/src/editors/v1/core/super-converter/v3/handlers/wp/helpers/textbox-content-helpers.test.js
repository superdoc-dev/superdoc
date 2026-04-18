import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  collectTextBoxParagraphs,
  preProcessTextBoxContent,
  halfPointsToPixels,
  resolveFontFamilyForTextBox,
  resolveParagraphPropertiesForTextBox,
  extractRunFormatting,
  extractParagraphAlignment,
  extractBodyPrProperties,
} from './textbox-content-helpers.js';
import { preProcessNodesForFldChar } from '@converter/field-references/preProcessNodesForFldChar.js';
import { preProcessPageFieldsOnly } from '@converter/field-references/preProcessPageFieldsOnly.js';
import { resolveRunProperties } from '@converter/styles';
import { translator as rPrTranslator } from '@converter/v3/handlers/w/rpr';

// Mock all dependencies
vi.mock('@converter/field-references/preProcessNodesForFldChar.js', () => ({
  preProcessNodesForFldChar: vi.fn((nodes) => ({ processedNodes: nodes })),
}));

vi.mock('@converter/field-references/preProcessPageFieldsOnly.js', () => ({
  preProcessPageFieldsOnly: vi.fn((nodes) => ({ processedNodes: nodes })),
}));

vi.mock('@core/utilities/carbonCopy.js', () => ({
  carbonCopy: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
}));

vi.mock('@converter/styles', () => ({
  resolveParagraphProperties: vi.fn(() => ({})),
  resolveRunProperties: vi.fn((params, inline, paragraph) => ({ ...inline, ...paragraph })),
}));

vi.mock('@converter/v3/handlers/w/pPr', () => ({
  translator: {
    encode: vi.fn(() => ({})),
  },
}));

vi.mock('@converter/v3/handlers/w/rpr', () => ({
  translator: {
    encode: vi.fn(() => ({})),
  },
}));

vi.mock('@superdoc/style-engine/ooxml', () => ({
  resolveDocxFontFamily: vi.fn((fontFamily) => fontFamily?.ascii || 'Arial'),
}));

vi.mock('@converter/SuperConverter.js', () => ({
  SuperConverter: {
    toCssFontFamily: vi.fn((font) => font),
  },
}));

describe('textbox-content-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collectTextBoxParagraphs', () => {
    it('should return empty array for non-array input', () => {
      expect(collectTextBoxParagraphs(null)).toEqual([]);
      expect(collectTextBoxParagraphs(undefined)).toEqual([]);
      expect(collectTextBoxParagraphs('string')).toEqual([]);
      expect(collectTextBoxParagraphs(123)).toEqual([]);
    });

    it('should return empty array for empty array input', () => {
      expect(collectTextBoxParagraphs([])).toEqual([]);
    });

    it('should collect direct w:p paragraphs', () => {
      const nodes = [
        { name: 'w:p', elements: [] },
        { name: 'w:p', elements: [] },
      ];
      const result = collectTextBoxParagraphs(nodes);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('w:p');
      expect(result[1].name).toBe('w:p');
    });

    it('should collect nested w:p paragraphs inside w:sdt', () => {
      const nodes = [
        {
          name: 'w:sdt',
          elements: [
            {
              name: 'w:sdtContent',
              elements: [
                { name: 'w:p', elements: [] },
                { name: 'w:p', elements: [] },
              ],
            },
          ],
        },
      ];
      const result = collectTextBoxParagraphs(nodes);
      expect(result).toHaveLength(2);
    });

    it('should collect deeply nested paragraphs', () => {
      const nodes = [
        {
          name: 'wrapper',
          elements: [
            {
              name: 'inner',
              elements: [
                {
                  name: 'deep',
                  elements: [{ name: 'w:p', elements: [] }],
                },
              ],
            },
          ],
        },
      ];
      const result = collectTextBoxParagraphs(nodes);
      expect(result).toHaveLength(1);
    });

    it('should handle mixed direct and nested paragraphs', () => {
      const nodes = [
        { name: 'w:p', elements: [] },
        {
          name: 'w:sdt',
          elements: [
            {
              name: 'w:sdtContent',
              elements: [{ name: 'w:p', elements: [] }],
            },
          ],
        },
        { name: 'w:p', elements: [] },
      ];
      const result = collectTextBoxParagraphs(nodes);
      expect(result).toHaveLength(3);
    });

    it('should skip null nodes', () => {
      const nodes = [null, { name: 'w:p', elements: [] }, undefined, { name: 'w:p', elements: [] }];
      const result = collectTextBoxParagraphs(nodes);
      expect(result).toHaveLength(2);
    });

    it('should not collect non-paragraph elements', () => {
      const nodes = [
        { name: 'w:r', elements: [] },
        { name: 'w:t', elements: [] },
        { name: 'other', elements: [] },
      ];
      const result = collectTextBoxParagraphs(nodes);
      expect(result).toHaveLength(0);
    });
  });

  describe('preProcessTextBoxContent', () => {
    it('should return input unchanged if no elements', () => {
      expect(preProcessTextBoxContent(null)).toBeNull();
      expect(preProcessTextBoxContent(undefined)).toBeUndefined();
      expect(preProcessTextBoxContent({})).toEqual({});
    });

    it('should use preProcessPageFieldsOnly for header files', () => {
      const content = { elements: [{ name: 'w:p' }] };
      preProcessTextBoxContent(content, { filename: 'header1.xml' });
      expect(preProcessPageFieldsOnly).toHaveBeenCalled();
      expect(preProcessNodesForFldChar).not.toHaveBeenCalled();
    });

    it('should use preProcessPageFieldsOnly for footer files', () => {
      const content = { elements: [{ name: 'w:p' }] };
      preProcessTextBoxContent(content, { filename: 'footer2.xml' });
      expect(preProcessPageFieldsOnly).toHaveBeenCalled();
      expect(preProcessNodesForFldChar).not.toHaveBeenCalled();
    });

    it('should use preProcessNodesForFldChar for document.xml', () => {
      const content = { elements: [{ name: 'w:p' }] };
      preProcessTextBoxContent(content, { filename: 'document.xml' });
      expect(preProcessNodesForFldChar).toHaveBeenCalled();
      expect(preProcessPageFieldsOnly).not.toHaveBeenCalled();
    });

    it('should use preProcessNodesForFldChar when no filename provided', () => {
      const content = { elements: [{ name: 'w:p' }] };
      preProcessTextBoxContent(content, {});
      expect(preProcessNodesForFldChar).toHaveBeenCalled();
    });

    it('should match header.xml without number', () => {
      const content = { elements: [{ name: 'w:p' }] };
      preProcessTextBoxContent(content, { filename: 'header.xml' });
      expect(preProcessPageFieldsOnly).toHaveBeenCalled();
    });

    it('should match footer.xml without number', () => {
      const content = { elements: [{ name: 'w:p' }] };
      preProcessTextBoxContent(content, { filename: 'footer.xml' });
      expect(preProcessPageFieldsOnly).toHaveBeenCalled();
    });

    it('should be case insensitive for header/footer detection', () => {
      const content = { elements: [{ name: 'w:p' }] };
      preProcessTextBoxContent(content, { filename: 'HEADER1.XML' });
      expect(preProcessPageFieldsOnly).toHaveBeenCalled();
    });
  });

  describe('halfPointsToPixels', () => {
    it('should return undefined for null input', () => {
      expect(halfPointsToPixels(null)).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(halfPointsToPixels(undefined)).toBeUndefined();
    });

    it('should return undefined for non-numeric string', () => {
      expect(halfPointsToPixels('abc')).toBeUndefined();
    });

    it('should return undefined for NaN', () => {
      expect(halfPointsToPixels(NaN)).toBeUndefined();
    });

    it('should return undefined for Infinity', () => {
      expect(halfPointsToPixels(Infinity)).toBeUndefined();
    });

    it('should convert 24 half-points to 16px (12pt)', () => {
      // 24 half-points = 12 points = 16 pixels (at 96dpi)
      const result = halfPointsToPixels(24);
      expect(result).toBe(16);
    });

    it('should convert 20 half-points to ~13.33px (10pt)', () => {
      // 20 half-points = 10 points = 13.333... pixels
      const result = halfPointsToPixels(20);
      expect(result).toBeCloseTo(13.333, 2);
    });

    it('should handle string input', () => {
      const result = halfPointsToPixels('24');
      expect(result).toBe(16);
    });

    it('should handle zero', () => {
      expect(halfPointsToPixels(0)).toBe(0);
    });
  });

  describe('extractParagraphAlignment', () => {
    it('should return null for paragraph without pPr', () => {
      const paragraph = { name: 'w:p', elements: [] };
      expect(extractParagraphAlignment(paragraph)).toBeNull();
    });

    it('should return null for pPr without jc', () => {
      const paragraph = {
        name: 'w:p',
        elements: [{ name: 'w:pPr', elements: [] }],
      };
      expect(extractParagraphAlignment(paragraph)).toBeNull();
    });

    it('should return "left" for jc val="left"', () => {
      const paragraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:jc', attributes: { val: 'left' } }],
          },
        ],
      };
      expect(extractParagraphAlignment(paragraph)).toBe('left');
    });

    it('should return "left" for jc val="start"', () => {
      const paragraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:jc', attributes: { val: 'start' } }],
          },
        ],
      };
      expect(extractParagraphAlignment(paragraph)).toBe('left');
    });

    it('should return "right" for jc val="right"', () => {
      const paragraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:jc', attributes: { val: 'right' } }],
          },
        ],
      };
      expect(extractParagraphAlignment(paragraph)).toBe('right');
    });

    it('should return "right" for jc val="end"', () => {
      const paragraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:jc', attributes: { val: 'end' } }],
          },
        ],
      };
      expect(extractParagraphAlignment(paragraph)).toBe('right');
    });

    it('should return "center" for jc val="center"', () => {
      const paragraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:jc', attributes: { val: 'center' } }],
          },
        ],
      };
      expect(extractParagraphAlignment(paragraph)).toBe('center');
    });

    it('should return null for unknown alignment value', () => {
      const paragraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:jc', attributes: { val: 'justify' } }],
          },
        ],
      };
      expect(extractParagraphAlignment(paragraph)).toBeNull();
    });

    it('should handle w:val attribute format', () => {
      const paragraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [{ name: 'w:jc', attributes: { 'w:val': 'center' } }],
          },
        ],
      };
      expect(extractParagraphAlignment(paragraph)).toBe('center');
    });
  });

  describe('extractBodyPrProperties', () => {
    it('should return defaults for null input (verticalAlign defaults to top per OOXML spec)', () => {
      const result = extractBodyPrProperties(null);
      expect(result.verticalAlign).toBe('top');
      expect(result.wrap).toBe('square');
      expect(result.insets).toBeDefined();
    });

    it('should return defaults for empty bodyPr (verticalAlign defaults to top per OOXML spec)', () => {
      const result = extractBodyPrProperties({});
      expect(result.verticalAlign).toBe('top');
      expect(result.wrap).toBe('square');
    });

    it('should extract verticalAlign "top" from anchor="t"', () => {
      const bodyPr = { attributes: { anchor: 't' } };
      const result = extractBodyPrProperties(bodyPr);
      expect(result.verticalAlign).toBe('top');
    });

    it('should extract verticalAlign "center" from anchor="ctr"', () => {
      const bodyPr = { attributes: { anchor: 'ctr' } };
      const result = extractBodyPrProperties(bodyPr);
      expect(result.verticalAlign).toBe('center');
    });

    it('should extract verticalAlign "bottom" from anchor="b"', () => {
      const bodyPr = { attributes: { anchor: 'b' } };
      const result = extractBodyPrProperties(bodyPr);
      expect(result.verticalAlign).toBe('bottom');
    });

    it('should extract custom insets', () => {
      const bodyPr = {
        attributes: {
          lIns: '0',
          tIns: '0',
          rIns: '0',
          bIns: '0',
        },
      };
      const result = extractBodyPrProperties(bodyPr);
      expect(result.insets.left).toBe(0);
      expect(result.insets.top).toBe(0);
      expect(result.insets.right).toBe(0);
      expect(result.insets.bottom).toBe(0);
    });

    it('should use default insets when not specified', () => {
      const result = extractBodyPrProperties({});
      // Default horizontal inset: 91440 EMU * (96/914400) ≈ 9.6px
      // Default vertical inset: 45720 EMU * (96/914400) ≈ 4.8px
      expect(result.insets.left).toBeCloseTo(9.6, 1);
      expect(result.insets.right).toBeCloseTo(9.6, 1);
      expect(result.insets.top).toBeCloseTo(4.8, 1);
      expect(result.insets.bottom).toBeCloseTo(4.8, 1);
    });

    it('should extract wrap mode', () => {
      const bodyPr = { attributes: { wrap: 'none' } };
      const result = extractBodyPrProperties(bodyPr);
      expect(result.wrap).toBe('none');
    });
  });

  describe('extractRunFormatting', () => {
    beforeEach(() => {
      rPrTranslator.encode.mockReturnValue({});
      resolveRunProperties.mockReturnValue({});
    });

    it('should return empty object for null rPr', () => {
      const result = extractRunFormatting(null, {}, {});
      expect(result).toEqual({});
    });

    it('should extract bold formatting', () => {
      resolveRunProperties.mockReturnValue({ bold: true });
      const result = extractRunFormatting({}, {}, {});
      expect(result.bold).toBe(true);
    });

    it('should extract italic formatting', () => {
      resolveRunProperties.mockReturnValue({ italic: true });
      const result = extractRunFormatting({}, {}, {});
      expect(result.italic).toBe(true);
    });

    it('should extract color and strip # prefix', () => {
      resolveRunProperties.mockReturnValue({ color: { val: '#FF0000' } });
      const result = extractRunFormatting({}, {}, {});
      expect(result.color).toBe('FF0000');
    });

    it('should not include color when value is "auto"', () => {
      resolveRunProperties.mockReturnValue({ color: { val: 'auto' } });
      const result = extractRunFormatting({}, {}, {});
      expect(result.color).toBeUndefined();
    });

    it('should extract fontSize in pixels', () => {
      resolveRunProperties.mockReturnValue({ fontSize: 24 }); // 24 half-points = 16px
      const result = extractRunFormatting({}, {}, {});
      expect(result.fontSize).toBe(16);
    });

    it('should extract fontFamily', () => {
      resolveRunProperties.mockReturnValue({ fontFamily: 'Arial' });
      const result = extractRunFormatting({}, {}, { docx: {} });
      expect(result.fontFamily).toBe('Arial');
    });

    it('should extract letterSpacing from twips to pixels', () => {
      resolveRunProperties.mockReturnValue({ letterSpacing: -6 });
      const result = extractRunFormatting({}, {}, {});
      expect(result.letterSpacing).toBeCloseTo(-0.4, 3);
    });

    it('should handle color with w:val attribute', () => {
      resolveRunProperties.mockReturnValue({ color: { 'w:val': '00FF00' } });
      const result = extractRunFormatting({}, {}, {});
      expect(result.color).toBe('00FF00');
    });
  });
});
