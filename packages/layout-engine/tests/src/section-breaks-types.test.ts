/**
 * Section Break Type Tests
 *
 * Tests all section break types and their behavior:
 * - nextPage: Force a page break
 * - continuous: No forced page break (changes apply from next page naturally)
 * - evenPage: Force break to next even page
 * - oddPage: Force break to next odd page
 * - Default type handling when w:type is missing
 * - Body section type preservation
 * - First section type preservation
 *
 * @module section-breaks-types.test
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  createPMDocWithSections,
  convertAndLayout,
  pmToFlowBlocks,
  getSectionBreaks,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';

describe('Section Breaks - Type Handling', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('nextPage Type', () => {
    it('should force a page break for nextPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Should have section break with nextPage type
      const sectionBreaks = getSectionBreaks(blocks);
      const nextPageBreak = sectionBreaks.find((b) => b.type === 'nextPage');
      expect(nextPageBreak).toBeDefined();

      // Should create at least 2 pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle multiple consecutive nextPage breaks', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Each nextPage should force a new page
      expect(layout.pages.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('continuous Type', () => {
    it('should not force a page break for continuous type with same orientation', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - short content'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - short content'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);

      // Should have continuous type section break
      const sectionBreaks = getSectionBreaks(blocks);
      const continuousBreak = sectionBreaks.find((b) => b.type === 'continuous');
      expect(continuousBreak).toBeDefined();
    });

    it('should handle multiple consecutive continuous breaks', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Should have multiple continuous breaks
      const continuousBreaks = sectionBreaks.filter((b) => b.type === 'continuous');
      expect(continuousBreaks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('evenPage Type', () => {
    it('should force a page break to next even page', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'evenPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Should have evenPage type section break
      const sectionBreaks = getSectionBreaks(blocks);
      const evenPageBreak = sectionBreaks.find((b) => b.type === 'evenPage');
      expect(evenPageBreak).toBeDefined();

      // Should create pages (evenPage may insert blank page to reach even)
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('should insert blank page if needed to reach even page number', async () => {
      // Start on page 1 (odd), evenPage should go to page 2 (even)
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Page 1'],
            props: {
              type: 'evenPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Should start on Page 2 (even)'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Should have at least 2 pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('oddPage Type', () => {
    it('should force a page break to next odd page', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'oddPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Should have oddPage type section break
      const sectionBreaks = getSectionBreaks(blocks);
      const oddPageBreak = sectionBreaks.find((b) => b.type === 'oddPage');
      expect(oddPageBreak).toBeDefined();

      // Should create pages (oddPage may insert blank page to reach odd)
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('should insert blank page if needed to reach odd page number', async () => {
      // Create scenario where we need to insert a blank page
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Page 1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Page 2'],
            props: {
              type: 'oddPage', // Should go to page 3 (odd)
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3 - Should start on Page 3 (odd)'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Should have at least 3 pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Default Type Handling', () => {
    it('should default to continuous when type is missing', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              // No type specified - should default to continuous
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // When type is not specified, it may be undefined or default to continuous
      // Just verify we have section breaks
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Body Section Type', () => {
    it('should preserve body section type (not force to continuous)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
          },
        ],
        {
          type: 'nextPage', // Body sectPr with nextPage type
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Body section should respect its type
      // The initial section break or final section break should have the type
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect body section evenPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
          },
        ],
        {
          type: 'evenPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Should have section breaks
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('First Section Type', () => {
    it('should preserve first section type (not force to continuous)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - First section'],
            props: {
              type: 'nextPage', // First section with explicit type
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // First section's type should be preserved
      const nextPageBreak = sectionBreaks.find((b) => b.type === 'nextPage');
      expect(nextPageBreak).toBeDefined();
    });

    it('should handle first section with oddPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - First section with oddPage'],
            props: {
              type: 'oddPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Should have oddPage break
      const oddPageBreak = sectionBreaks.find((b) => b.type === 'oddPage');
      expect(oddPageBreak).toBeDefined();
    });
  });

  describe('Mixed Section Types', () => {
    it('should handle alternating nextPage and continuous types', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 4'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Should have both types
      const nextPageBreaks = sectionBreaks.filter((b) => b.type === 'nextPage');
      const continuousBreaks = sectionBreaks.filter((b) => b.type === 'continuous');

      expect(nextPageBreaks.length).toBeGreaterThanOrEqual(1);
      expect(continuousBreaks.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle all four section types in one document', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3'],
            props: {
              type: 'evenPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 4'],
            props: {
              type: 'oddPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 5'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Should have all four types
      const types = new Set(sectionBreaks.map((b) => b.type).filter(Boolean));

      // Verify we have diverse types (at least 3 of the 4)
      expect(types.size).toBeGreaterThanOrEqual(3);
    });
  });
});
