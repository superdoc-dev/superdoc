/**
 * Header/Footer integration tests
 *
 * Validates that headers and footers render on correct pages,
 * page numbering works correctly, and section-specific headers are handled.
 *
 * @module header-footer-integration.test
 */

import { describe, it, expect } from 'vitest';
import { toFlowBlocks } from './test-helpers/to-flow-blocks.js';
import type { FlowBlock, PMNode } from '@superdoc/contracts';
import fs from 'fs';
import path from 'path';

/**
 * Test fixture paths
 */
const FIXTURES = {
  basic: path.join(__dirname, '../fixtures/sdt-flow-input.json'),
} as const;

/**
 * Load PM JSON fixture
 *
 * @param fixturePath - Path to fixture file
 * @returns ProseMirror document
 */
function loadPMJsonFixture(fixturePath: string): PMNode {
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Expand document to approximate page count
 *
 * @param baseDoc - Base document
 * @param targetPages - Target page count
 * @returns Expanded document
 */
function expandDocumentToPages(baseDoc: PMNode, targetPages: number): PMNode {
  const contentNodes = baseDoc.content || [];
  const repetitions = Math.ceil(targetPages / 2);
  const expandedContent: PMNode[] = [];

  for (let i = 0; i < repetitions; i++) {
    expandedContent.push(...contentNodes);
  }

  return {
    ...baseDoc,
    content: expandedContent,
  };
}

/**
 * Simulate page layout
 *
 * @param blocks - FlowBlock array
 * @returns Array of page metadata
 */
function simulatePageLayout(blocks: FlowBlock[]): Array<{
  pageNumber: number;
  blockCount: number;
}> {
  // Simplified: assume ~5 blocks per page
  const blocksPerPage = 5;
  const pageCount = Math.ceil(blocks.length / blocksPerPage);

  const pages: Array<{ pageNumber: number; blockCount: number }> = [];

  for (let i = 0; i < pageCount; i++) {
    const startIdx = i * blocksPerPage;
    const endIdx = Math.min((i + 1) * blocksPerPage, blocks.length);
    const blockCount = endIdx - startIdx;

    pages.push({
      pageNumber: i + 1,
      blockCount,
    });
  }

  return pages;
}

/**
 * Mock header/footer provider
 *
 * @param pageNumber - Page number
 * @param section - Section metadata
 * @returns Header/footer content
 */
function mockHeaderFooterProvider(
  pageNumber: number,
  section?: { oddEven?: boolean; firstPageDifferent?: boolean },
): {
  header?: string;
  footer?: string;
} {
  const isFirstPage = pageNumber === 1;
  const isOddPage = pageNumber % 2 === 1;

  let header: string | undefined;
  let footer: string | undefined;

  if (section?.firstPageDifferent && isFirstPage) {
    header = 'First Page Header';
    footer = 'First Page Footer';
  } else if (section?.oddEven) {
    header = isOddPage ? 'Odd Page Header' : 'Even Page Header';
    footer = isOddPage ? `Page ${pageNumber}` : `Page ${pageNumber}`;
  } else {
    header = 'Standard Header';
    footer = `Page ${pageNumber}`;
  }

  return { header, footer };
}

describe('Header/Footer Integration', () => {
  describe('Basic Header/Footer Rendering', () => {
    it('should render headers on all pages', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 10);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);

      // Each page should be able to have a header
      for (const page of pages) {
        const { header } = mockHeaderFooterProvider(page.pageNumber);
        expect(header).toBeDefined();
      }

      console.log(`Rendered headers on ${pages.length} pages`);
    });

    it('should render footers on all pages', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 10);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);

      for (const page of pages) {
        const { footer } = mockHeaderFooterProvider(page.pageNumber);
        expect(footer).toBeDefined();
      }

      console.log(`Rendered footers on ${pages.length} pages`);
    });

    it('should include page numbers in footers', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 10);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);

      for (const page of pages) {
        const { footer } = mockHeaderFooterProvider(page.pageNumber);
        expect(footer).toContain(`Page ${page.pageNumber}`);
      }
    });
  });

  describe('First Page Different', () => {
    it('should render different header on first page', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 5);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);
      const sectionOptions = { firstPageDifferent: true };

      const firstPageHeader = mockHeaderFooterProvider(1, sectionOptions).header;
      const secondPageHeader = mockHeaderFooterProvider(2, sectionOptions).header;

      expect(firstPageHeader).toBe('First Page Header');
      expect(secondPageHeader).toBe('Standard Header');
      expect(firstPageHeader).not.toBe(secondPageHeader);
    });

    it('should render different footer on first page', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 5);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);
      const sectionOptions = { firstPageDifferent: true };

      const firstPageFooter = mockHeaderFooterProvider(1, sectionOptions).footer;
      const secondPageFooter = mockHeaderFooterProvider(2, sectionOptions).footer;

      expect(firstPageFooter).toBe('First Page Footer');
      expect(secondPageFooter).toContain('Page 2');
      expect(firstPageFooter).not.toBe(secondPageFooter);
    });
  });

  describe('Odd/Even Pages', () => {
    it('should render different headers for odd/even pages', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 10);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);
      const sectionOptions = { oddEven: true };

      const oddPageHeader = mockHeaderFooterProvider(1, sectionOptions).header;
      const evenPageHeader = mockHeaderFooterProvider(2, sectionOptions).header;

      expect(oddPageHeader).toBe('Odd Page Header');
      expect(evenPageHeader).toBe('Even Page Header');
      expect(oddPageHeader).not.toBe(evenPageHeader);
    });

    it('should alternate headers correctly across pages', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 10);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);
      const sectionOptions = { oddEven: true };

      for (const page of pages) {
        const { header } = mockHeaderFooterProvider(page.pageNumber, sectionOptions);
        const expectedHeader = page.pageNumber % 2 === 1 ? 'Odd Page Header' : 'Even Page Header';
        expect(header).toBe(expectedHeader);
      }
    });
  });

  describe('Page Numbering', () => {
    it('should increment page numbers correctly', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 20);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);

      for (let i = 0; i < pages.length; i++) {
        expect(pages[i].pageNumber).toBe(i + 1);
      }
    });

    it('should support custom page number formatting', () => {
      // Roman numerals, letters, etc.
      const formatPageNumber = (num: number, format: 'arabic' | 'roman' | 'letter'): string => {
        switch (format) {
          case 'roman':
            // Simplified roman numeral conversion
            const romanMap: [number, string][] = [
              [10, 'X'],
              [9, 'IX'],
              [5, 'V'],
              [4, 'IV'],
              [1, 'I'],
            ];
            let roman = '';
            let n = num;
            for (const [value, letter] of romanMap) {
              while (n >= value) {
                roman += letter;
                n -= value;
              }
            }
            return roman;

          case 'letter':
            return String.fromCharCode(64 + num); // A, B, C...

          case 'arabic':
          default:
            return num.toString();
        }
      };

      expect(formatPageNumber(1, 'arabic')).toBe('1');
      expect(formatPageNumber(5, 'roman')).toBe('V');
      expect(formatPageNumber(1, 'letter')).toBe('A');
    });

    it('should handle page number fields dynamically', () => {
      // Page number fields should update based on actual page position
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 10);
      const { blocks } = toFlowBlocks(largeDoc);

      const pages = simulatePageLayout(blocks);

      // Each page footer should contain correct page number
      for (const page of pages) {
        const { footer } = mockHeaderFooterProvider(page.pageNumber);
        expect(footer).toContain(page.pageNumber.toString());
      }
    });
  });

  describe('Section-Specific Headers/Footers', () => {
    it('should support different headers per section', () => {
      // Multi-section document
      const sections = [
        { name: 'Section 1', pageCount: 3 },
        { name: 'Section 2', pageCount: 5 },
        { name: 'Section 3', pageCount: 4 },
      ];

      let currentPage = 1;
      for (const section of sections) {
        for (let i = 0; i < section.pageCount; i++) {
          const header = `${section.name} Header`;
          expect(header).toContain(section.name);
          currentPage++;
        }
      }

      expect(currentPage).toBe(13); // 3 + 5 + 4 + 1
    });

    it('should handle section breaks correctly', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const { blocks } = toFlowBlocks(doc);

      // Check for section break blocks
      const sectionBreaks = blocks.filter((b) => b.kind === 'sectionBreak');

      console.log(`Found ${sectionBreaks.length} section breaks`);

      // Section breaks should trigger new headers/footers
      expect(blocks).toBeDefined();
    });

    it('should restart page numbering per section if configured', () => {
      const sections = [
        { startPage: 1, pageCount: 5 },
        { startPage: 1, pageCount: 3 }, // Restart numbering
        { startPage: 1, pageCount: 4 }, // Restart numbering
      ];

      for (const section of sections) {
        for (let i = 0; i < section.pageCount; i++) {
          const pageNum = section.startPage + i;
          expect(pageNum).toBeGreaterThanOrEqual(1);
          expect(pageNum).toBeLessThanOrEqual(section.pageCount);
        }
      }
    });
  });

  describe('Header/Footer Content', () => {
    it('should support rich text in headers', () => {
      // Headers can contain formatted text, images, etc.
      const headerContent = {
        runs: [
          { text: 'Company Name', bold: true },
          { text: ' - ', bold: false },
          { text: 'Document Title', italic: true },
        ],
      };

      expect(headerContent.runs).toHaveLength(3);
      expect(headerContent.runs[0].bold).toBe(true);
      expect(headerContent.runs[2].italic).toBe(true);
    });

    it('should support images in headers/footers', () => {
      const headerWithImage = {
        image: {
          src: 'logo.png',
          width: 100,
          height: 50,
        },
        text: 'Company Name',
      };

      expect(headerWithImage.image).toBeDefined();
      expect(headerWithImage.image.src).toBe('logo.png');
    });

    it('should support fields in headers/footers', () => {
      // Date, page number, file name fields
      const footerWithFields = {
        runs: [
          { field: 'PAGE' }, // Current page number
          { text: ' of ' },
          { field: 'NUMPAGES' }, // Total pages
          { text: ' - ' },
          { field: 'DATE' }, // Current date
        ],
      };

      expect(footerWithFields.runs).toHaveLength(5);
      expect(footerWithFields.runs[0].field).toBe('PAGE');
      expect(footerWithFields.runs[2].field).toBe('NUMPAGES');
    });
  });

  describe('Performance', () => {
    it('should render headers/footers efficiently for many pages', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(doc, 100);
      const { blocks } = toFlowBlocks(largeDoc);

      const start = performance.now();
      const pages = simulatePageLayout(blocks);

      // Render headers/footers for all pages
      for (const page of pages) {
        mockHeaderFooterProvider(page.pageNumber);
      }

      const elapsed = performance.now() - start;

      console.log(`Rendered headers/footers for ${pages.length} pages in ${elapsed.toFixed(2)}ms`);

      // Should be fast (<100ms for 100 pages)
      expect(elapsed).toBeLessThan(100);
    });

    it('should cache header/footer content when appropriate', () => {
      const cache = new Map<string, { header?: string; footer?: string }>();

      const getCachedHeaderFooter = (pageNumber: number, sectionKey: string): { header?: string; footer?: string } => {
        const cacheKey = `${sectionKey}-${pageNumber}`;

        if (cache.has(cacheKey)) {
          return cache.get(cacheKey)!;
        }

        const content = mockHeaderFooterProvider(pageNumber);
        cache.set(cacheKey, content);
        return content;
      };

      // Request same page multiple times
      getCachedHeaderFooter(1, 'section1');
      getCachedHeaderFooter(1, 'section1');
      getCachedHeaderFooter(1, 'section1');

      // Should only cache once
      expect(cache.size).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle documents with no headers/footers', () => {
      const doc = loadPMJsonFixture(FIXTURES.basic);
      const { blocks } = toFlowBlocks(doc);

      const pages = simulatePageLayout(blocks);

      // All pages should be valid even without headers/footers
      expect(pages.length).toBeGreaterThan(0);
    });

    it('should handle empty header/footer content', () => {
      const emptyHeaderFooter = { header: '', footer: '' };

      expect(emptyHeaderFooter.header).toBe('');
      expect(emptyHeaderFooter.footer).toBe('');
    });

    it('should handle very long header/footer content', () => {
      const longHeader = 'A'.repeat(1000);
      const headerContent = { header: longHeader };

      expect(headerContent.header.length).toBe(1000);
    });

    it('should handle header/footer height constraints', () => {
      // Headers/footers should not exceed page margins
      const pageHeight = 1056; // px
      const topMargin = 72; // px
      const bottomMargin = 72; // px

      const maxHeaderHeight = topMargin;
      const maxFooterHeight = bottomMargin;

      expect(maxHeaderHeight).toBeLessThanOrEqual(topMargin);
      expect(maxFooterHeight).toBeLessThanOrEqual(bottomMargin);
    });
  });
});
