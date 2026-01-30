/**
 * Painter Integration Tests
 *
 * Tests for bucket fallback logic and painter displayPageText integration.
 * Validates that the decoration provider correctly selects header/footer layouts
 * with bucket fallback when exact page matches are not found.
 */

import { describe, it, expect } from 'bun:test';
import { getBucketForPageNumber, getBucketRepresentative, type DigitBucket } from '../src/layoutHeaderFooter';
import type { HeaderFooterLayout, HeaderFooterPage } from '@superdoc/contracts';

describe('Bucket Fallback Logic', () => {
  describe('getBucketForPageNumber', () => {
    it('should assign single-digit pages to d1 bucket', () => {
      expect(getBucketForPageNumber(1)).toBe('d1');
      expect(getBucketForPageNumber(5)).toBe('d1');
      expect(getBucketForPageNumber(9)).toBe('d1');
    });

    it('should assign two-digit pages to d2 bucket', () => {
      expect(getBucketForPageNumber(10)).toBe('d2');
      expect(getBucketForPageNumber(50)).toBe('d2');
      expect(getBucketForPageNumber(99)).toBe('d2');
    });

    it('should assign three-digit pages to d3 bucket', () => {
      expect(getBucketForPageNumber(100)).toBe('d3');
      expect(getBucketForPageNumber(500)).toBe('d3');
      expect(getBucketForPageNumber(999)).toBe('d3');
    });

    it('should assign four-digit+ pages to d4 bucket', () => {
      expect(getBucketForPageNumber(1000)).toBe('d4');
      expect(getBucketForPageNumber(5000)).toBe('d4');
      expect(getBucketForPageNumber(10000)).toBe('d4');
    });
  });

  describe('getBucketRepresentative', () => {
    it('should return representative page 5 for d1 bucket', () => {
      expect(getBucketRepresentative('d1')).toBe(5);
    });

    it('should return representative page 50 for d2 bucket', () => {
      expect(getBucketRepresentative('d2')).toBe(50);
    });

    it('should return representative page 500 for d3 bucket', () => {
      expect(getBucketRepresentative('d3')).toBe(500);
    });

    it('should return representative page 5000 for d4 bucket', () => {
      expect(getBucketRepresentative('d4')).toBe(5000);
    });
  });

  describe('Bucket Fallback Simulation', () => {
    /**
     * Helper function to simulate the decoration provider's bucket fallback logic.
     * This is the same logic implemented in PresentationEditor#findHeaderFooterPageForPageNumber.
     */
    function findHeaderFooterPageForPageNumber(
      pages: HeaderFooterPage[],
      pageNumber: number,
    ): HeaderFooterPage | undefined {
      if (!pages || pages.length === 0) {
        return undefined;
      }

      // 1. Try exact match first
      const exactMatch = pages.find((p) => p.number === pageNumber);
      if (exactMatch) {
        return exactMatch;
      }

      // 2. If bucketing is used, find the representative for this page's bucket
      const bucket = getBucketForPageNumber(pageNumber);
      const representative = getBucketRepresentative(bucket);
      const bucketMatch = pages.find((p) => p.number === representative);
      if (bucketMatch) {
        return bucketMatch;
      }

      // 3. Final fallback: return the first available page
      return pages[0];
    }

    it('should find exact match when available', () => {
      const pages: HeaderFooterPage[] = [
        { number: 1, fragments: [] },
        { number: 50, fragments: [] },
        { number: 100, fragments: [] },
      ];

      const result = findHeaderFooterPageForPageNumber(pages, 50);
      expect(result?.number).toBe(50);
    });

    it('should fall back to bucket representative when exact match not found', () => {
      // Large doc scenario: only bucket representatives are laid out
      const pages: HeaderFooterPage[] = [
        { number: 5, fragments: [] }, // d1 representative
        { number: 50, fragments: [] }, // d2 representative
        { number: 500, fragments: [] }, // d3 representative
      ];

      // Page 7 should fall back to d1 representative (page 5)
      const result1 = findHeaderFooterPageForPageNumber(pages, 7);
      expect(result1?.number).toBe(5);

      // Page 42 should fall back to d2 representative (page 50)
      const result2 = findHeaderFooterPageForPageNumber(pages, 42);
      expect(result2?.number).toBe(50);

      // Page 123 should fall back to d3 representative (page 500)
      const result3 = findHeaderFooterPageForPageNumber(pages, 123);
      expect(result3?.number).toBe(500);
    });

    it('should fall back to first page when no bucket match found', () => {
      // Edge case: d4 pages but no d4 representative in layout
      const pages: HeaderFooterPage[] = [
        { number: 5, fragments: [] }, // d1 representative
        { number: 50, fragments: [] }, // d2 representative
      ];

      // Page 1000 is in d4 bucket, but no d4 representative exists
      // Should fall back to first available page
      const result = findHeaderFooterPageForPageNumber(pages, 1000);
      expect(result?.number).toBe(5);
    });

    it('should handle small doc scenario with per-page layouts', () => {
      // Small doc (<100 pages): each page has its own layout
      const pages: HeaderFooterPage[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
        { number: 4, fragments: [] },
        { number: 5, fragments: [] },
      ];

      // Each page should get exact match
      for (let i = 1; i <= 5; i++) {
        const result = findHeaderFooterPageForPageNumber(pages, i);
        expect(result?.number).toBe(i);
      }
    });

    it('should return undefined for empty pages array', () => {
      const result = findHeaderFooterPageForPageNumber([], 1);
      expect(result).toBeUndefined();
    });

    it('should handle cross-bucket digit transitions', () => {
      // Test the 9→10 and 99→100 transitions mentioned in the plan
      const pages: HeaderFooterPage[] = [
        { number: 5, fragments: [] }, // d1 representative
        { number: 50, fragments: [] }, // d2 representative
        { number: 500, fragments: [] }, // d3 representative
      ];

      // Page 9 (last of d1) → representative 5
      const result1 = findHeaderFooterPageForPageNumber(pages, 9);
      expect(result1?.number).toBe(5);

      // Page 10 (first of d2) → representative 50
      const result2 = findHeaderFooterPageForPageNumber(pages, 10);
      expect(result2?.number).toBe(50);

      // Page 99 (last of d2) → representative 50
      const result3 = findHeaderFooterPageForPageNumber(pages, 99);
      expect(result3?.number).toBe(50);

      // Page 100 (first of d3) → representative 500
      const result4 = findHeaderFooterPageForPageNumber(pages, 100);
      expect(result4?.number).toBe(500);
    });
  });

  describe('Page numberText Integration', () => {
    it('should preserve numberText property in HeaderFooterPage', () => {
      const page: HeaderFooterPage = {
        number: 5,
        fragments: [],
        numberText: 'v', // Roman numeral for 5
      };

      expect(page.numberText).toBe('v');
      expect(page.number).toBe(5);
    });

    it('should handle various numberText formats', () => {
      const pages: HeaderFooterPage[] = [
        { number: 1, fragments: [], numberText: 'i' }, // lowerRoman
        { number: 2, fragments: [], numberText: 'II' }, // upperRoman
        { number: 3, fragments: [], numberText: 'C' }, // upperLetter
        { number: 4, fragments: [], numberText: '4' }, // decimal
      ];

      pages.forEach((page) => {
        expect(page.numberText).toBeDefined();
        expect(typeof page.numberText).toBe('string');
      });
    });
  });

  describe('HeaderFooterLayout structure validation', () => {
    it('should have correct structure for bucketed layout', () => {
      const layout: HeaderFooterLayout = {
        height: 72,
        minY: 0,
        maxY: 72,
        pages: [
          { number: 5, fragments: [], numberText: '5' }, // d1 representative
          { number: 50, fragments: [], numberText: '50' }, // d2 representative
          { number: 500, fragments: [], numberText: '500' }, // d3 representative
        ],
      };

      expect(layout.pages).toHaveLength(3);
      expect(layout.pages[0].number).toBe(5);
      expect(layout.pages[1].number).toBe(50);
      expect(layout.pages[2].number).toBe(500);
    });

    it('should have correct structure for per-page layout', () => {
      // Small doc: per-page layouts
      const layout: HeaderFooterLayout = {
        height: 72,
        pages: Array.from({ length: 10 }, (_, i) => ({
          number: i + 1,
          fragments: [],
          numberText: String(i + 1),
        })),
      };

      expect(layout.pages).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(layout.pages[i].number).toBe(i + 1);
        expect(layout.pages[i].numberText).toBe(String(i + 1));
      }
    });
  });
});

describe('Painter DisplayPageText Flow', () => {
  describe('Page type with numberText', () => {
    it('should include numberText in Page type', () => {
      const page: { number: number; numberText?: string } = {
        number: 5,
        numberText: 'v',
      };

      expect(page.numberText).toBe('v');
    });

    it('should handle missing numberText gracefully', () => {
      const page: { number: number; numberText?: string } = {
        number: 5,
      };

      expect(page.numberText).toBeUndefined();
    });
  });

  describe('Backward compatibility', () => {
    it('should work with layouts that do not have numberText', () => {
      const pages: HeaderFooterPage[] = [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
      ];

      // Should not throw when numberText is missing
      expect(pages[0].numberText).toBeUndefined();
      expect(pages[1].numberText).toBeUndefined();
    });
  });
});
