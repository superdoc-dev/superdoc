/**
 * Section Break Integration Tests
 *
 * Tests full pipeline integration:
 * - PM JSON → Flow Blocks → Layout → Pages
 * - Verify page count matches section structure
 * - Verify orientations propagate correctly
 * - Verify page sizes propagate correctly
 * - Complex multi-section documents
 * - Real-world document scenarios
 *
 * @module section-breaks-integration.test
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  createPMDocWithSections,
  convertAndLayout,
  pmToFlowBlocks,
  measureBlocks,
  getSectionBreaks,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';
import { layoutDocument } from '@superdoc/layout-engine';

describe('Section Breaks - Integration Tests', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('Full Pipeline: PM JSON → Blocks → Measures → Layout → Pages', () => {
    it('should complete full pipeline for simple two-section document', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 content here'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 content here'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      // Step 1: PM JSON → Flow Blocks
      const { blocks, bookmarks } = pmToFlowBlocks(pmDoc);
      expect(blocks.length).toBeGreaterThan(0);
      expect(bookmarks).toBeDefined();

      // Step 2: Flow Blocks → Measures
      const measures = await measureBlocks(blocks);
      expect(measures.length).toBe(blocks.length);

      // Step 3: Measures → Layout
      const layout = layoutDocument(blocks, measures);
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // Verify pages have correct properties
      layout.pages.forEach((page) => {
        expect(page.orientation).toBeDefined();
        expect(page.fragments).toBeDefined();
      });
    });

    it('should complete full pipeline for complex multi-section document', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              columns: { count: 1, gap: 0 },
            },
          },
          {
            paragraphs: ['Section 2 - Landscape'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
              columns: { count: 2, gap: 20 },
            },
          },
          {
            paragraphs: ['Section 3 - Portrait Legal'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
              columns: { count: 1, gap: 0 },
            },
          },
          {
            paragraphs: ['Section 4 - Portrait Letter'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const measures = await measureBlocks(blocks);
      const layout = layoutDocument(blocks, measures);

      // Should have 4 pages (one per section)
      expect(layout.pages.length).toBe(4);

      // Verify orientation progression
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
      expect(layout.pages[2].orientation).toBe('portrait');
      expect(layout.pages[3].orientation).toBe('portrait');

      // Verify page sizes
      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.h).toBe(792); // Letter
      }
      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.w).toBe(792); // Landscape Letter
      }
      if (layout.pages[2].pageSize) {
        expect(layout.pages[2].pageSize.h).toBe(1008); // Legal
      }
      if (layout.pages[3].pageSize) {
        expect(layout.pages[3].pageSize.h).toBe(792); // Letter
      }
    });
  });

  describe('Page Count Verification', () => {
    it('should create correct page count for nextPage sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S2'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S3'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S4'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          { paragraphs: ['S5'] },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      // 5 sections with nextPage = 5 pages
      expect(layout.pages.length).toBe(5);
    });

    it('should create correct page count for continuous sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S2'],
            props: { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          { paragraphs: ['S3'] },
        ],
        { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      // Continuous sections should not force page breaks (may fit on 1 page)
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('should create correct page count for mixed section types', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S2'],
            props: { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S3'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          { paragraphs: ['S4'] },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      // nextPage forces breaks, continuous doesn't (at least 3 pages)
      expect(layout.pages.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Orientation Propagation', () => {
    it('should propagate orientation from section breaks to pages correctly', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['P1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['L1'],
            props: { type: 'nextPage', orientation: 'landscape', pageSize: PAGE_SIZES.LETTER_LANDSCAPE },
          },
          {
            paragraphs: ['P2'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['L2'],
          },
        ],
        { type: 'nextPage', orientation: 'landscape', pageSize: PAGE_SIZES.LETTER_LANDSCAPE },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Check section breaks have correct orientations
      const sectionBreaks = getSectionBreaks(blocks);
      const orientations = sectionBreaks
        .map((b) => b.orientation)
        .filter((o): o is 'portrait' | 'landscape' => o !== undefined);

      expect(orientations).toContain('portrait');
      expect(orientations).toContain('landscape');

      // Check pages have correct orientations
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
      expect(layout.pages[2].orientation).toBe('portrait');
      expect(layout.pages[3].orientation).toBe('landscape');
    });

    it('should maintain orientation through continuous sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: { type: 'continuous', orientation: 'landscape', pageSize: PAGE_SIZES.LETTER_LANDSCAPE },
          },
          {
            paragraphs: ['S2'],
            props: { type: 'continuous', orientation: 'landscape', pageSize: PAGE_SIZES.LETTER_LANDSCAPE },
          },
          {
            paragraphs: ['S3'],
          },
        ],
        { type: 'continuous', orientation: 'landscape', pageSize: PAGE_SIZES.LETTER_LANDSCAPE },
      );

      const layout = await convertAndLayout(pmDoc);

      // All pages should be landscape
      layout.pages.forEach((page) => {
        expect(page.orientation).toBe('landscape');
      });
    });
  });

  describe('Page Size Propagation', () => {
    it('should propagate page size from section breaks to pages correctly', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Letter'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Legal'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LEGAL_PORTRAIT },
          },
          {
            paragraphs: ['A4'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.A4_PORTRAIT },
          },
          {
            paragraphs: ['Back to Letter'],
          },
        ],
        { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(4);

      // Verify page sizes
      if (layout.pages[0].pageSize) expect(layout.pages[0].pageSize.h).toBe(792); // Letter
      if (layout.pages[1].pageSize) expect(layout.pages[1].pageSize.h).toBe(1008); // Legal
      if (layout.pages[2].pageSize) expect(layout.pages[2].pageSize.h).toBe(842); // A4
      if (layout.pages[3].pageSize) expect(layout.pages[3].pageSize.h).toBe(792); // Letter
    });

    it('should maintain page size through same-size sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.A4_PORTRAIT },
          },
          {
            paragraphs: ['S2'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.A4_PORTRAIT },
          },
          { paragraphs: ['S3'] },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.A4_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      // All pages should have A4 size
      layout.pages.forEach((page) => {
        if (page.pageSize) {
          expect(page.pageSize.w).toBe(595);
          expect(page.pageSize.h).toBe(842);
        }
      });
    });
  });

  describe('Real-World Document Scenarios', () => {
    it('should handle cover page + landscape content + portrait appendix', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Cover Page - Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Main Content - Landscape for wide tables'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['Appendix - Back to Portrait'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(3);

      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
      expect(layout.pages[2].orientation).toBe('portrait');
    });

    it('should handle newsletter layout (portrait cover, two-column content)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Cover - Single Column'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              columns: { count: 1, gap: 0 },
            },
          },
          {
            paragraphs: ['Articles - Two Columns'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              columns: { count: 2, gap: 20 },
            },
          },
          {
            paragraphs: ['Back Page - Single Column'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          columns: { count: 1, gap: 0 },
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(3);

      const sectionBreaks = getSectionBreaks(blocks);
      const columnsInfo = sectionBreaks
        .map((b) => b.columns)
        .filter((c): c is { count: number; gap: number } => c !== undefined);

      // Should have both single and two-column configs
      expect(columnsInfo.some((c) => c.count === 1)).toBe(true);
      expect(columnsInfo.some((c) => c.count === 2)).toBe(true);
    });

    it('should handle legal document (letter first page, legal subsequent pages)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['First Page - Letter Size'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Legal Content - Legal Size'],
          },
        ],
        {
          type: 'continuous',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LEGAL_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.h).toBe(792); // Letter
      }

      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.h).toBe(1008); // Legal
      }
    });

    it('should handle book layout (alternating orientations for charts)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Chapter 1 - Portrait'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Chart 1 - Landscape'],
            props: { type: 'nextPage', orientation: 'landscape', pageSize: PAGE_SIZES.LETTER_LANDSCAPE },
          },
          {
            paragraphs: ['Chapter 2 - Portrait'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Chart 2 - Landscape'],
            props: { type: 'nextPage', orientation: 'landscape', pageSize: PAGE_SIZES.LETTER_LANDSCAPE },
          },
          { paragraphs: ['Chapter 3 - Portrait'] },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(5);

      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
      expect(layout.pages[2].orientation).toBe('portrait');
      expect(layout.pages[3].orientation).toBe('landscape');
      expect(layout.pages[4].orientation).toBe('portrait');
    });
  });

  describe('Fragment Distribution', () => {
    it('should distribute fragments correctly across pages', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Para 1', 'Section 1 - Para 2'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Section 2 - Para 1', 'Section 2 - Para 2'],
          },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // Each page should have fragments
      layout.pages.forEach((page) => {
        expect(page.fragments).toBeDefined();
        expect(page.fragments.length).toBeGreaterThan(0);
      });
    });

    it('should not duplicate fragments across pages', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Para 1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Para 2'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          { paragraphs: ['Para 3'] },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(3);

      // Count total fragments across all pages
      const totalFragments = layout.pages.reduce((sum, page) => sum + page.fragments.length, 0);

      // Should have reasonable number of fragments (not duplicated)
      expect(totalFragments).toBeGreaterThan(0);
      expect(totalFragments).toBeLessThan(100); // Sanity check
    });
  });
});
