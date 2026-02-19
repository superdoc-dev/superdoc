/**
 * Unit tests for page numbering module
 *
 * Tests formatPageNumber and computeDisplayPageNumber functions for correct
 * page number formatting and section-aware display numbering.
 */

import { describe, it, expect } from 'vitest';
import { formatPageNumber, computeDisplayPageNumber } from './pageNumbering';
import type { Page, SectionMetadata } from '@superdoc/contracts';

describe('formatPageNumber', () => {
  describe('decimal format', () => {
    it('should format positive numbers as decimal strings', () => {
      expect(formatPageNumber(1, 'decimal')).toBe('1');
      expect(formatPageNumber(5, 'decimal')).toBe('5');
      expect(formatPageNumber(42, 'decimal')).toBe('42');
      expect(formatPageNumber(999, 'decimal')).toBe('999');
      expect(formatPageNumber(10000, 'decimal')).toBe('10000');
    });

    it('should clamp zero to 1', () => {
      expect(formatPageNumber(0, 'decimal')).toBe('1');
    });

    it('should clamp negative numbers to 1', () => {
      expect(formatPageNumber(-1, 'decimal')).toBe('1');
      expect(formatPageNumber(-100, 'decimal')).toBe('1');
    });
  });

  describe('numberInDash format', () => {
    it('should wrap numbers in dashes', () => {
      expect(formatPageNumber(1, 'numberInDash')).toBe('-1-');
      expect(formatPageNumber(12, 'numberInDash')).toBe('-12-');
    });

    it('should clamp zero to 1', () => {
      expect(formatPageNumber(0, 'numberInDash')).toBe('-1-');
    });
  });

  describe('upperRoman format', () => {
    it('should format numbers 1-10 correctly', () => {
      expect(formatPageNumber(1, 'upperRoman')).toBe('I');
      expect(formatPageNumber(2, 'upperRoman')).toBe('II');
      expect(formatPageNumber(3, 'upperRoman')).toBe('III');
      expect(formatPageNumber(4, 'upperRoman')).toBe('IV');
      expect(formatPageNumber(5, 'upperRoman')).toBe('V');
      expect(formatPageNumber(6, 'upperRoman')).toBe('VI');
      expect(formatPageNumber(7, 'upperRoman')).toBe('VII');
      expect(formatPageNumber(8, 'upperRoman')).toBe('VIII');
      expect(formatPageNumber(9, 'upperRoman')).toBe('IX');
      expect(formatPageNumber(10, 'upperRoman')).toBe('X');
    });

    it('should format numbers 11-50 correctly', () => {
      expect(formatPageNumber(11, 'upperRoman')).toBe('XI');
      expect(formatPageNumber(14, 'upperRoman')).toBe('XIV');
      expect(formatPageNumber(19, 'upperRoman')).toBe('XIX');
      expect(formatPageNumber(20, 'upperRoman')).toBe('XX');
      expect(formatPageNumber(40, 'upperRoman')).toBe('XL');
      expect(formatPageNumber(49, 'upperRoman')).toBe('XLIX');
      expect(formatPageNumber(50, 'upperRoman')).toBe('L');
    });

    it('should format numbers 51-100 correctly', () => {
      expect(formatPageNumber(51, 'upperRoman')).toBe('LI');
      expect(formatPageNumber(90, 'upperRoman')).toBe('XC');
      expect(formatPageNumber(99, 'upperRoman')).toBe('XCIX');
      expect(formatPageNumber(100, 'upperRoman')).toBe('C');
    });

    it('should format hundreds correctly', () => {
      expect(formatPageNumber(400, 'upperRoman')).toBe('CD');
      expect(formatPageNumber(500, 'upperRoman')).toBe('D');
      expect(formatPageNumber(900, 'upperRoman')).toBe('CM');
    });

    it('should format thousands correctly', () => {
      expect(formatPageNumber(1000, 'upperRoman')).toBe('M');
      expect(formatPageNumber(1994, 'upperRoman')).toBe('MCMXCIV');
      expect(formatPageNumber(2023, 'upperRoman')).toBe('MMXXIII');
      expect(formatPageNumber(3999, 'upperRoman')).toBe('MMMCMXCIX');
    });

    it('should fall back to decimal for numbers > 3999', () => {
      expect(formatPageNumber(4000, 'upperRoman')).toBe('4000');
      expect(formatPageNumber(10000, 'upperRoman')).toBe('10000');
    });

    it('should clamp zero and negative to 1', () => {
      expect(formatPageNumber(0, 'upperRoman')).toBe('I');
      expect(formatPageNumber(-5, 'upperRoman')).toBe('I');
    });
  });

  describe('lowerRoman format', () => {
    it('should format numbers as lowercase roman numerals', () => {
      expect(formatPageNumber(1, 'lowerRoman')).toBe('i');
      expect(formatPageNumber(4, 'lowerRoman')).toBe('iv');
      expect(formatPageNumber(9, 'lowerRoman')).toBe('ix');
      expect(formatPageNumber(49, 'lowerRoman')).toBe('xlix');
      expect(formatPageNumber(99, 'lowerRoman')).toBe('xcix');
      expect(formatPageNumber(1994, 'lowerRoman')).toBe('mcmxciv');
    });

    it('should fall back to decimal for numbers > 3999', () => {
      expect(formatPageNumber(4000, 'lowerRoman')).toBe('4000');
    });

    it('should clamp zero and negative to 1', () => {
      expect(formatPageNumber(0, 'lowerRoman')).toBe('i');
      expect(formatPageNumber(-10, 'lowerRoman')).toBe('i');
    });
  });

  describe('upperLetter format', () => {
    it('should format numbers 1-26 as A-Z', () => {
      expect(formatPageNumber(1, 'upperLetter')).toBe('A');
      expect(formatPageNumber(2, 'upperLetter')).toBe('B');
      expect(formatPageNumber(3, 'upperLetter')).toBe('C');
      expect(formatPageNumber(13, 'upperLetter')).toBe('M');
      expect(formatPageNumber(26, 'upperLetter')).toBe('Z');
    });

    it('should format numbers > 26 as AA, AB, etc.', () => {
      expect(formatPageNumber(27, 'upperLetter')).toBe('AA');
      expect(formatPageNumber(28, 'upperLetter')).toBe('AB');
      expect(formatPageNumber(52, 'upperLetter')).toBe('AZ');
      expect(formatPageNumber(53, 'upperLetter')).toBe('BA');
      expect(formatPageNumber(78, 'upperLetter')).toBe('BZ');
      expect(formatPageNumber(79, 'upperLetter')).toBe('CA');
    });

    it('should format large numbers correctly', () => {
      expect(formatPageNumber(702, 'upperLetter')).toBe('ZZ');
      expect(formatPageNumber(703, 'upperLetter')).toBe('AAA');
      expect(formatPageNumber(704, 'upperLetter')).toBe('AAB');
    });

    it('should clamp zero and negative to A', () => {
      expect(formatPageNumber(0, 'upperLetter')).toBe('A');
      expect(formatPageNumber(-1, 'upperLetter')).toBe('A');
    });
  });

  describe('lowerLetter format', () => {
    it('should format numbers 1-26 as a-z', () => {
      expect(formatPageNumber(1, 'lowerLetter')).toBe('a');
      expect(formatPageNumber(2, 'lowerLetter')).toBe('b');
      expect(formatPageNumber(3, 'lowerLetter')).toBe('c');
      expect(formatPageNumber(13, 'lowerLetter')).toBe('m');
      expect(formatPageNumber(26, 'lowerLetter')).toBe('z');
    });

    it('should format numbers > 26 as aa, ab, etc.', () => {
      expect(formatPageNumber(27, 'lowerLetter')).toBe('aa');
      expect(formatPageNumber(28, 'lowerLetter')).toBe('ab');
      expect(formatPageNumber(52, 'lowerLetter')).toBe('az');
      expect(formatPageNumber(53, 'lowerLetter')).toBe('ba');
    });

    it('should format large numbers correctly', () => {
      expect(formatPageNumber(702, 'lowerLetter')).toBe('zz');
      expect(formatPageNumber(703, 'lowerLetter')).toBe('aaa');
    });

    it('should clamp zero and negative to a', () => {
      expect(formatPageNumber(0, 'lowerLetter')).toBe('a');
      expect(formatPageNumber(-1, 'lowerLetter')).toBe('a');
    });
  });
});

describe('computeDisplayPageNumber', () => {
  describe('empty or single section documents', () => {
    it('should return empty array for empty pages', () => {
      const result = computeDisplayPageNumber([], []);
      expect(result).toEqual([]);
    });

    it('should handle single page with default numbering', () => {
      const pages: Page[] = [{ number: 1, fragments: [] }];
      const sections: SectionMetadata[] = [{ sectionIndex: 0 }];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        physicalPage: 1,
        displayNumber: 1,
        displayText: '1',
        sectionIndex: 0,
      });
    });

    it('should handle multiple pages in single section with decimal format', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
      ];
      const sections: SectionMetadata[] = [{ sectionIndex: 0 }];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        physicalPage: 1,
        displayNumber: 1,
        displayText: '1',
        sectionIndex: 0,
      });
      expect(result[1]).toEqual({
        physicalPage: 2,
        displayNumber: 2,
        displayText: '2',
        sectionIndex: 0,
      });
      expect(result[2]).toEqual({
        physicalPage: 3,
        displayNumber: 3,
        displayText: '3',
        sectionIndex: 0,
      });
    });

    it('should apply custom format to single section', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: {
            format: 'lowerRoman',
          },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result).toHaveLength(3);
      expect(result[0].displayText).toBe('i');
      expect(result[1].displayText).toBe('ii');
      expect(result[2].displayText).toBe('iii');
    });

    it('should apply custom start value to single section', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: {
            format: 'decimal',
            start: 5,
          },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        physicalPage: 1,
        displayNumber: 5,
        displayText: '5',
        sectionIndex: 0,
      });
      expect(result[1]).toEqual({
        physicalPage: 2,
        displayNumber: 6,
        displayText: '6',
        sectionIndex: 0,
      });
      expect(result[2]).toEqual({
        physicalPage: 3,
        displayNumber: 7,
        displayText: '7',
        sectionIndex: 0,
      });
    });
  });

  describe('multi-section documents', () => {
    it('should handle section restart with default format', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
        { number: 4, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'lowerRoman' },
        },
        {
          sectionIndex: 1,
          numbering: { format: 'decimal', start: 1 },
        },
      ];

      // Note: Currently using simplified section tracking
      // This test documents current behavior; full section tracking may be added later
      const result = computeDisplayPageNumber(pages, sections);

      expect(result).toHaveLength(4);
      // All pages are in section 0 in simplified implementation
      expect(result[0].displayText).toBe('i');
      expect(result[1].displayText).toBe('ii');
      expect(result[2].displayText).toBe('iii');
      expect(result[3].displayText).toBe('iv');
    });

    it('should support multiple number formats', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'upperLetter' },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result[0].displayText).toBe('A');
      expect(result[1].displayText).toBe('B');
      expect(result[2].displayText).toBe('C');
    });
  });

  describe('edge cases', () => {
    it('should handle pages with no section metadata', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ];
      const sections: SectionMetadata[] = [];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result).toHaveLength(2);
      expect(result[0].displayText).toBe('1');
      expect(result[1].displayText).toBe('2');
    });

    it('should handle start value of 0 by clamping to 1', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { start: 0 },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      // start: 0 means we begin at 0, but display is clamped to min 1
      expect(result[0].displayNumber).toBe(0);
      expect(result[1].displayNumber).toBe(1);
    });

    it('should handle negative start value by clamping display to 1', () => {
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { start: -2 },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      // Display numbers are clamped to 1 minimum in formatPageNumber
      // but the internal counter can be negative
      expect(result[0].displayNumber).toBe(-2);
      expect(result[1].displayNumber).toBe(-1);
      expect(result[2].displayNumber).toBe(0);
    });
  });

  describe('format transitions', () => {
    it('should handle transition from single digit to double digit decimal', () => {
      const pages: Page[] = Array.from({ length: 15 }, (_, i) => ({
        number: i + 1,
        fragments: [],
      }));
      const sections: SectionMetadata[] = [{ sectionIndex: 0 }];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result[8].displayText).toBe('9');
      expect(result[9].displayText).toBe('10');
      expect(result[10].displayText).toBe('11');
    });

    it('should handle transition from Z to AA in upperLetter', () => {
      const pages: Page[] = Array.from({ length: 30 }, (_, i) => ({
        number: i + 1,
        fragments: [],
      }));
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'upperLetter' },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result[24].displayText).toBe('Y');
      expect(result[25].displayText).toBe('Z');
      expect(result[26].displayText).toBe('AA');
      expect(result[27].displayText).toBe('AB');
    });

    it('should handle large page numbers in roman numerals', () => {
      const pages: Page[] = Array.from({ length: 5 }, (_, i) => ({
        number: i + 1,
        fragments: [],
      }));
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'upperRoman', start: 3997 },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result[0].displayText).toBe('MMMCMXCVII');
      expect(result[1].displayText).toBe('MMMCMXCVIII');
      expect(result[2].displayText).toBe('MMMCMXCIX');
      // Should fall back to decimal for > 3999
      expect(result[3].displayText).toBe('4000');
      expect(result[4].displayText).toBe('4001');
    });
  });

  describe('continuous sections', () => {
    it('should continue numbering without explicit restart in continuous sections', () => {
      // This documents current behavior - full continuous section support may come later
      const pages: Page[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
        { number: 4, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'decimal' },
        },
        {
          sectionIndex: 1,
          // No start value - should continue from previous section
          numbering: { format: 'decimal' },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      // Currently all pages are treated as section 0
      // Full section boundary tracking may be added later
      expect(result).toHaveLength(4);
      expect(result[0].displayNumber).toBe(1);
      expect(result[1].displayNumber).toBe(2);
      expect(result[2].displayNumber).toBe(3);
      expect(result[3].displayNumber).toBe(4);
    });
  });

  describe('complex multi-section scenarios', () => {
    it('should handle mixed formats across sections using page.sectionIndex', () => {
      const pages: Page[] = [
        { number: 1, fragments: [], sectionIndex: 0 }, // Section 0: lowerRoman
        { number: 2, fragments: [], sectionIndex: 0 }, // Section 0: lowerRoman
        { number: 3, fragments: [], sectionIndex: 1 }, // Section 1: decimal (restart at 1)
        { number: 4, fragments: [], sectionIndex: 1 }, // Section 1: decimal
        { number: 5, fragments: [], sectionIndex: 2 }, // Section 2: upperLetter (restart at 1)
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'lowerRoman', start: 1 },
        },
        {
          sectionIndex: 1,
          numbering: { format: 'decimal', start: 1 },
        },
        {
          sectionIndex: 2,
          numbering: { format: 'upperLetter', start: 1 },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result).toHaveLength(5);
      // Section 0: pages 1-2 in lowerRoman
      expect(result[0]).toEqual({
        physicalPage: 1,
        displayNumber: 1,
        displayText: 'i',
        sectionIndex: 0,
      });
      expect(result[1]).toEqual({
        physicalPage: 2,
        displayNumber: 2,
        displayText: 'ii',
        sectionIndex: 0,
      });
      // Section 1: pages 3-4 in decimal (restarted at 1)
      expect(result[2]).toEqual({
        physicalPage: 3,
        displayNumber: 1,
        displayText: '1',
        sectionIndex: 1,
      });
      expect(result[3]).toEqual({
        physicalPage: 4,
        displayNumber: 2,
        displayText: '2',
        sectionIndex: 1,
      });
      // Section 2: page 5 in upperLetter (restarted at 1)
      expect(result[4]).toEqual({
        physicalPage: 5,
        displayNumber: 1,
        displayText: 'A',
        sectionIndex: 2,
      });
    });

    it('should continue numbering when section has no restart', () => {
      const pages: Page[] = [
        { number: 1, fragments: [], sectionIndex: 0 },
        { number: 2, fragments: [], sectionIndex: 0 },
        { number: 3, fragments: [], sectionIndex: 1 }, // Section 1: no restart, continues from previous
        { number: 4, fragments: [], sectionIndex: 1 },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'decimal', start: 1 },
        },
        {
          sectionIndex: 1,
          // No start value - should continue from previous section
          numbering: { format: 'decimal' },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      // Pages should continue 1, 2, 3, 4 without restart
      expect(result[0].displayNumber).toBe(1);
      expect(result[1].displayNumber).toBe(2);
      expect(result[2].displayNumber).toBe(3);
      expect(result[3].displayNumber).toBe(4);
    });

    it('should fall back to section 0 when page has no sectionIndex', () => {
      // Backward compatibility: pages without sectionIndex default to section 0
      const pages: Page[] = [
        { number: 1, fragments: [] }, // No sectionIndex, defaults to 0
        { number: 2, fragments: [] },
      ];
      const sections: SectionMetadata[] = [
        {
          sectionIndex: 0,
          numbering: { format: 'upperRoman', start: 1 },
        },
      ];

      const result = computeDisplayPageNumber(pages, sections);

      expect(result[0].displayText).toBe('I');
      expect(result[0].sectionIndex).toBe(0);
      expect(result[1].displayText).toBe('II');
      expect(result[1].sectionIndex).toBe(0);
    });
  });
});
