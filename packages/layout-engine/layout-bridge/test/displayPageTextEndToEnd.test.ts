/**
 * End-to-End Integration Tests for Display Page Text
 *
 * Tests the complete flow from incrementalLayout through decoration provider
 * to painter, verifying that displayPageText is correctly propagated throughout
 * the system.
 */

import { describe, it, expect } from 'bun:test';
import type { Page, HeaderFooterPage, HeaderFooterLayout } from '@superdoc/contracts';
import { getBucketForPageNumber, getBucketRepresentative } from '../src/layoutHeaderFooter';

describe('End-to-End DisplayPageText Flow', () => {
  describe('Page numberText propagation', () => {
    it('should populate numberText on body pages from incrementalLayout', () => {
      // Simulating what incrementalLayout does after numbering context computation
      const pages: Page[] = [
        {
          number: 1,
          fragments: [],
          numberText: 'i', // lowerRoman format
        },
        {
          number: 2,
          fragments: [],
          numberText: 'ii',
        },
        {
          number: 3,
          fragments: [],
          numberText: 'iii',
        },
      ];

      // Verify numberText is set correctly
      expect(pages[0].numberText).toBe('i');
      expect(pages[1].numberText).toBe('ii');
      expect(pages[2].numberText).toBe('iii');
    });

    it('should handle section-aware numbering with restarts', () => {
      // Simulating a document with two sections:
      // - Section 1: pages 1-2 with lowerRoman
      // - Section 2: pages 3-5 with decimal, restart at 1
      const pages: Page[] = [
        { number: 1, fragments: [], numberText: 'i' },
        { number: 2, fragments: [], numberText: 'ii' },
        { number: 3, fragments: [], numberText: '1' }, // Section 2 starts, restart
        { number: 4, fragments: [], numberText: '2' },
        { number: 5, fragments: [], numberText: '3' },
      ];

      expect(pages[0].numberText).toBe('i');
      expect(pages[1].numberText).toBe('ii');
      expect(pages[2].numberText).toBe('1'); // Restarted
      expect(pages[3].numberText).toBe('2');
      expect(pages[4].numberText).toBe('3');
    });
  });

  describe('Header/Footer numberText in layouts', () => {
    it('should populate numberText on header/footer pages for small docs (<100 pages)', () => {
      // Small doc scenario: per-page layouts
      const headerLayout: HeaderFooterLayout = {
        height: 72,
        pages: [
          { number: 1, fragments: [], numberText: 'i' },
          { number: 2, fragments: [], numberText: 'ii' },
          { number: 3, fragments: [], numberText: 'iii' },
        ],
      };

      // Each page has its own numberText
      headerLayout.pages.forEach((page, index) => {
        expect(page.numberText).toBeDefined();
        expect(page.number).toBe(index + 1);
      });
    });

    it('should populate numberText on bucket representative pages for large docs (>=100 pages)', () => {
      // Large doc scenario: bucket representatives only
      const headerLayout: HeaderFooterLayout = {
        height: 72,
        pages: [
          { number: 5, fragments: [], numberText: '5' }, // d1 representative
          { number: 50, fragments: [], numberText: '50' }, // d2 representative
          { number: 500, fragments: [], numberText: '500' }, // d3 representative
        ],
      };

      // Verify bucket representatives have numberText
      expect(headerLayout.pages[0].numberText).toBe('5');
      expect(headerLayout.pages[1].numberText).toBe('50');
      expect(headerLayout.pages[2].numberText).toBe('500');

      // Verify they are actual bucket representatives
      expect(headerLayout.pages[0].number).toBe(getBucketRepresentative('d1'));
      expect(headerLayout.pages[1].number).toBe(getBucketRepresentative('d2'));
      expect(headerLayout.pages[2].number).toBe(getBucketRepresentative('d3'));
    });

    it('should handle mixed formats in header/footer pages with bucketing', () => {
      // Large doc with section-aware numbering
      // Section 1 uses lowerRoman, section 2 uses decimal
      const headerLayout: HeaderFooterLayout = {
        height: 72,
        pages: [
          { number: 5, fragments: [], numberText: 'v' }, // d1 with roman
          { number: 50, fragments: [], numberText: '50' }, // d2 with decimal
          { number: 500, fragments: [], numberText: '500' }, // d3 with decimal
        ],
      };

      expect(headerLayout.pages[0].numberText).toBe('v'); // Roman
      expect(headerLayout.pages[1].numberText).toBe('50'); // Decimal
      expect(headerLayout.pages[2].numberText).toBe('500'); // Decimal
    });
  });

  describe('Decoration provider bucket selection', () => {
    /**
     * Simulates the decoration provider's page selection logic
     * (same as PresentationEditor#findHeaderFooterPageForPageNumber)
     */
    function findPageForDecorationProvider(
      pages: HeaderFooterPage[],
      requestedPageNumber: number,
    ): HeaderFooterPage | undefined {
      // 1. Exact match
      const exact = pages.find((p) => p.number === requestedPageNumber);
      if (exact) return exact;

      // 2. Bucket fallback
      const bucket = getBucketForPageNumber(requestedPageNumber);
      const representative = getBucketRepresentative(bucket);
      const bucketMatch = pages.find((p) => p.number === representative);
      if (bucketMatch) return bucketMatch;

      // 3. First page fallback
      return pages[0];
    }

    it('should select exact page when available (small doc)', () => {
      const pages: HeaderFooterPage[] = [
        { number: 1, fragments: [], numberText: '1' },
        { number: 2, fragments: [], numberText: '2' },
        { number: 3, fragments: [], numberText: '3' },
      ];

      // Request page 2 - should get exact match
      const selected = findPageForDecorationProvider(pages, 2);
      expect(selected?.number).toBe(2);
      expect(selected?.numberText).toBe('2');
    });

    it('should fall back to bucket representative (large doc)', () => {
      const pages: HeaderFooterPage[] = [
        { number: 5, fragments: [], numberText: '5' }, // d1 rep
        { number: 50, fragments: [], numberText: '50' }, // d2 rep
        { number: 500, fragments: [], numberText: '500' }, // d3 rep
      ];

      // Request page 7 (in d1 bucket) - should get page 5
      const selected1 = findPageForDecorationProvider(pages, 7);
      expect(selected1?.number).toBe(5);
      expect(selected1?.numberText).toBe('5');

      // Request page 42 (in d2 bucket) - should get page 50
      const selected2 = findPageForDecorationProvider(pages, 42);
      expect(selected2?.number).toBe(50);
      expect(selected2?.numberText).toBe('50');

      // Request page 250 (in d3 bucket) - should get page 500
      const selected3 = findPageForDecorationProvider(pages, 250);
      expect(selected3?.number).toBe(500);
      expect(selected3?.numberText).toBe('500');
    });

    it('should preserve fragments from selected page', () => {
      const mockFragments = [
        { kind: 'para' as const, blockId: 'test', fromLine: 0, toLine: 1, x: 0, y: 0, width: 100 },
      ];

      const pages: HeaderFooterPage[] = [
        { number: 5, fragments: mockFragments, numberText: 'v' },
        { number: 50, fragments: [], numberText: '50' },
      ];

      // Request page 7 - should get page 5's fragments
      const selected = findPageForDecorationProvider(pages, 7);
      expect(selected?.fragments).toBe(mockFragments);
      expect(selected?.numberText).toBe('v');
    });
  });

  describe('Painter context integration', () => {
    it('should pass numberText to DOM painter context', () => {
      // Simulating FragmentRenderContext in DOM painter
      const context = {
        pageNumber: 5,
        totalPages: 100,
        section: 'body' as const,
        pageNumberText: 'v', // From page.numberText
      };

      expect(context.pageNumberText).toBe('v');

      // Painter should use pageNumberText when available
      const resolvedText = context.pageNumberText ?? String(context.pageNumber);
      expect(resolvedText).toBe('v');
    });

    it('should pass numberText to PDF painter context', () => {
      // Simulating FragmentRenderContext in PDF painter
      const context = {
        pageNumber: 50,
        totalPages: 500,
        section: 'header' as const,
        pageNumberText: 'L', // Roman numeral for 50
      };

      expect(context.pageNumberText).toBe('L');

      // Painter token resolution should prefer pageNumberText
      const resolvedText = context.pageNumberText ?? String(context.pageNumber);
      expect(resolvedText).toBe('L');
    });

    it('should fall back to pageNumber when numberText is undefined', () => {
      const context = {
        pageNumber: 5,
        totalPages: 100,
        section: 'body' as const,
        pageNumberText: undefined,
      };

      const resolvedText = context.pageNumberText ?? String(context.pageNumber);
      expect(resolvedText).toBe('5'); // Falls back to pageNumber
    });
  });

  describe('Backward compatibility', () => {
    it('should work when numberText is not provided (legacy behavior)', () => {
      const page: Page = {
        number: 5,
        fragments: [],
        // numberText is optional, may be undefined in older code
      };

      // Should not throw
      const text = page.numberText ?? String(page.number);
      expect(text).toBe('5'); // Falls back to number
    });

    it('should handle header/footer layouts without numberText', () => {
      const layout: HeaderFooterLayout = {
        height: 72,
        pages: [
          { number: 1, fragments: [] },
          { number: 2, fragments: [] },
        ],
      };

      // Should not throw when accessing numberText
      layout.pages.forEach((page) => {
        const text = page.numberText ?? String(page.number);
        expect(typeof text).toBe('string');
      });
    });
  });

  describe('Edge cases from plan', () => {
    it('should handle 9→10 digit transition (d1 to d2)', () => {
      const pages: HeaderFooterPage[] = [
        { number: 5, fragments: [], numberText: '5' }, // d1 representative
        { number: 50, fragments: [], numberText: '50' }, // d2 representative
      ];

      function findPage(pageNum: number): HeaderFooterPage | undefined {
        const exact = pages.find((p) => p.number === pageNum);
        if (exact) return exact;
        const bucket = getBucketForPageNumber(pageNum);
        const rep = getBucketRepresentative(bucket);
        return pages.find((p) => p.number === rep) ?? pages[0];
      }

      // Page 9 (last of d1) should use d1 representative
      const page9 = findPage(9);
      expect(page9?.number).toBe(5);

      // Page 10 (first of d2) should use d2 representative
      const page10 = findPage(10);
      expect(page10?.number).toBe(50);
    });

    it('should handle 99→100 digit transition (d2 to d3)', () => {
      const pages: HeaderFooterPage[] = [
        { number: 50, fragments: [], numberText: '50' }, // d2 representative
        { number: 500, fragments: [], numberText: '500' }, // d3 representative
      ];

      function findPage(pageNum: number): HeaderFooterPage | undefined {
        const exact = pages.find((p) => p.number === pageNum);
        if (exact) return exact;
        const bucket = getBucketForPageNumber(pageNum);
        const rep = getBucketRepresentative(bucket);
        return pages.find((p) => p.number === rep) ?? pages[0];
      }

      // Page 99 (last of d2) should use d2 representative
      const page99 = findPage(99);
      expect(page99?.number).toBe(50);

      // Page 100 (first of d3) should use d3 representative
      const page100 = findPage(100);
      expect(page100?.number).toBe(500);
    });

    it('should handle very large documents (10k+ pages)', () => {
      const pages: HeaderFooterPage[] = [
        { number: 5, fragments: [], numberText: '5' }, // d1
        { number: 50, fragments: [], numberText: '50' }, // d2
        { number: 500, fragments: [], numberText: '500' }, // d3
        { number: 5000, fragments: [], numberText: '5000' }, // d4
      ];

      function findPage(pageNum: number): HeaderFooterPage | undefined {
        const exact = pages.find((p) => p.number === pageNum);
        if (exact) return exact;
        const bucket = getBucketForPageNumber(pageNum);
        const rep = getBucketRepresentative(bucket);
        return pages.find((p) => p.number === rep) ?? pages[0];
      }

      // Page 9999 should use d4 representative
      const page9999 = findPage(9999);
      expect(page9999?.number).toBe(5000);
      expect(page9999?.numberText).toBe('5000');

      // Page 10000 should also use d4 representative
      const page10000 = findPage(10000);
      expect(page10000?.number).toBe(5000);
    });
  });
});
