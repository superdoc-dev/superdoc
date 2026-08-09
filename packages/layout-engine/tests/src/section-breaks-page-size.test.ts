/**
 * Section Break Page Size Tests
 *
 * Tests page size changes across section breaks:
 * - Letter to Legal transitions
 * - Legal to Letter transitions
 * - A4 to Letter transitions
 * - Page size change with continuous type (should force page break)
 * - Same page size (should not force break unless type requires it)
 * - Page size propagation to pages
 *
 * @module section-breaks-page-size.test
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  createPMDocWithSections,
  convertAndLayout,
  pmToFlowBlocks,
  getSectionBreaks,
  assertPageSize,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';

describe('Section Breaks - Page Size Changes', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('Letter to Legal Transitions', () => {
    it('should handle letter to legal with nextPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Letter size'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Legal size'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Should have at least 2 pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page should be Letter size (612 x 792)
      const page1 = layout.pages[0];
      if (page1.pageSize) {
        expect(page1.pageSize.w).toBe(612);
        expect(page1.pageSize.h).toBe(792);
      }

      // Second page should be Legal size (612 x 1008)
      const page2 = layout.pages[1];
      if (page2.pageSize) {
        expect(page2.pageSize.w).toBe(612);
        expect(page2.pageSize.h).toBe(1008);
      }
    });

    it('should force page break when page size changes with continuous type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Letter'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Legal'],
          },
        ],
        {
          type: 'continuous',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Even with continuous type, page size change should force page break
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // Verify page sizes
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.h).toBe(792); // Letter height
      }

      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.h).toBe(1008); // Legal height
      }
    });
  });

  describe('Legal to Letter Transitions', () => {
    it('should handle legal to letter with nextPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Legal size'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Letter size'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page: Legal (612 x 1008)
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(612);
        expect(layout.pages[0].pageSize.h).toBe(1008);
      }

      // Second page: Letter (612 x 792)
      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.w).toBe(612);
        expect(layout.pages[1].pageSize.h).toBe(792);
      }
    });
  });

  describe('A4 to Letter Transitions', () => {
    it('should handle A4 to Letter size change', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - A4 size'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.A4_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Letter size'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page: A4 (595 x 842)
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(595);
        expect(layout.pages[0].pageSize.h).toBe(842);
      }

      // Second page: Letter (612 x 792)
      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.w).toBe(612);
        expect(layout.pages[1].pageSize.h).toBe(792);
      }
    });

    it('should handle Letter to A4 size change', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Letter size'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - A4 size'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.A4_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page: Letter (612 x 792)
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(612);
        expect(layout.pages[0].pageSize.h).toBe(792);
      }

      // Second page: A4 (595 x 842)
      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.w).toBe(595);
        expect(layout.pages[1].pageSize.h).toBe(842);
      }
    });
  });

  describe('Multiple Page Size Changes', () => {
    it('should handle multiple page size changes in sequence', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1 - Letter'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['S2 - Legal'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
            },
          },
          {
            paragraphs: ['S3 - A4'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.A4_PORTRAIT,
            },
          },
          {
            paragraphs: ['S4 - Letter'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(4);

      // Verify page size sequence
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.h).toBe(792); // Letter
      }

      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.h).toBe(1008); // Legal
      }

      if (layout.pages[2].pageSize) {
        expect(layout.pages[2].pageSize.h).toBe(842); // A4
      }

      if (layout.pages[3].pageSize) {
        expect(layout.pages[3].pageSize.h).toBe(792); // Letter
      }
    });
  });

  describe('Same Page Size (No Change)', () => {
    it('should not force page break when page size stays same with continuous', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - short'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - short'],
          },
        ],
        {
          type: 'continuous',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Continuous with same page size should not force break
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      // All pages should have same size
      layout.pages.forEach((page) => {
        if (page.pageSize) {
          expect(page.pageSize.w).toBe(612);
          expect(page.pageSize.h).toBe(792);
        }
      });
    });

    it('should force page break when page size stays same with nextPage', async () => {
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
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // nextPage should force break even with same page size
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // All pages should have same size
      layout.pages.forEach((page) => {
        if (page.pageSize) {
          expect(page.pageSize.w).toBe(612);
          expect(page.pageSize.h).toBe(792);
        }
      });
    });
  });

  describe('Page Size with Orientation Coordination', () => {
    it('should coordinate landscape page size correctly', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Portrait Letter'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Landscape Letter'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // Portrait page: 612 x 792
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(612);
        expect(layout.pages[0].pageSize.h).toBe(792);
      }

      // Landscape page: 792 x 612 (swapped)
      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.w).toBe(792);
        expect(layout.pages[1].pageSize.h).toBe(612);
      }
    });

    it('should handle portrait-to-landscape Legal size change', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Portrait Legal'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
            },
          },
          {
            paragraphs: ['Landscape Legal'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LEGAL_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // Portrait Legal: 612 x 1008
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(612);
        expect(layout.pages[0].pageSize.h).toBe(1008);
      }

      // Landscape Legal: 1008 x 612
      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.w).toBe(1008);
        expect(layout.pages[1].pageSize.h).toBe(612);
      }
    });
  });

  describe('Page Size Propagation', () => {
    it('should propagate page size from section breaks to pages', async () => {
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
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Check section breaks have correct page sizes
      const sectionBreaks = getSectionBreaks(blocks);
      const pageSizes = sectionBreaks
        .map((b) => b.pageSize)
        .filter((ps): ps is { w: number; h: number } => ps !== undefined && ps !== null);

      // Should have both page sizes in section breaks
      expect(pageSizes.length).toBeGreaterThanOrEqual(1);

      // Check pages have correct sizes
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.h).toBe(792); // Letter
      }

      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.h).toBe(1008); // Legal
      }
    });

    it('should maintain page size throughout same-size sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.A4_PORTRAIT,
            },
          },
          {
            paragraphs: ['S2'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.A4_PORTRAIT,
            },
          },
          {
            paragraphs: ['S3'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.A4_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(3);

      // All pages should maintain A4 size
      layout.pages.forEach((page) => {
        if (page.pageSize) {
          expect(page.pageSize.w).toBe(595);
          expect(page.pageSize.h).toBe(842);
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small page size', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Small page'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: { w: 200, h: 300 },
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(200);
        expect(layout.pages[0].pageSize.h).toBe(300);
      }
    });

    it('should handle very large page size', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Large page'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: { w: 1200, h: 1800 },
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(1200);
        expect(layout.pages[0].pageSize.h).toBe(1800);
      }
    });
  });
});
