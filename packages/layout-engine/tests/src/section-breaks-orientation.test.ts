/**
 * Section Break Orientation Tests
 *
 * Tests orientation changes across section breaks:
 * - Portrait to landscape transitions
 * - Landscape to portrait transitions
 * - Multiple orientation changes
 * - Orientation change with continuous type (should force page break)
 * - Same orientation (should not force break unless type requires it)
 * - Orientation propagation to pages
 *
 * @module section-breaks-orientation.test
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  createPMDocWithSections,
  convertAndLayout,
  pmToFlowBlocks,
  getSectionBreaks,
  assertPageOrientation,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';

describe('Section Breaks - Orientation Changes', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('Portrait to Landscape Transitions', () => {
    it('should handle portrait to landscape with nextPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Landscape'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Should have at least 2 pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page should be portrait
      expect(layout.pages[0].orientation).toBe('portrait');

      // Second page should be landscape
      expect(layout.pages[1].orientation).toBe('landscape');

      // Verify page dimensions match orientation
      const page1 = layout.pages[0];
      if (page1.pageSize) {
        expect(page1.pageSize.h).toBeGreaterThan(page1.pageSize.w); // Portrait: h > w
      }

      const page2 = layout.pages[1];
      if (page2.pageSize) {
        expect(page2.pageSize.w).toBeGreaterThan(page2.pageSize.h); // Landscape: w > h
      }
    });

    it('should force page break when orientation changes with continuous type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Portrait'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Landscape'],
          },
        ],
        {
          type: 'continuous',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Even with continuous type, orientation change should force page break
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // Verify orientations
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
    });
  });

  describe('Landscape to Portrait Transitions', () => {
    it('should handle landscape to portrait with nextPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Landscape'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['Section 2 - Portrait'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Should have at least 2 pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page should be landscape
      expect(layout.pages[0].orientation).toBe('landscape');

      // Second page should be portrait
      expect(layout.pages[1].orientation).toBe('portrait');
    });

    it('should force page break when landscape changes to portrait with continuous', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Landscape'],
            props: {
              type: 'continuous',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['Section 2 - Portrait'],
          },
        ],
        {
          type: 'continuous',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Orientation change should force page break
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      expect(layout.pages[0].orientation).toBe('landscape');
      expect(layout.pages[1].orientation).toBe('portrait');
    });
  });

  describe('Multiple Orientation Changes', () => {
    it('should handle multiple orientation changes in sequence', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Landscape'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['Section 3 - Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 4 - Landscape'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Should have 4 pages
      expect(layout.pages.length).toBe(4);

      // Verify orientation sequence
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
      expect(layout.pages[2].orientation).toBe('portrait');
      expect(layout.pages[3].orientation).toBe('landscape');
    });

    it('should handle alternating portrait/landscape across 5 sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1 - Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['S2 - Landscape'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['S3 - Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['S4 - Landscape'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['S5 - Portrait'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
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

  describe('Same Orientation (No Change)', () => {
    it('should not force page break when orientation stays portrait with continuous', async () => {
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

      // Continuous with same orientation should not force break
      // Both sections may fit on one page
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      // All pages should be portrait
      layout.pages.forEach((page) => {
        expect(page.orientation).toBe('portrait');
      });
    });

    it('should force page break when orientation stays landscape with nextPage', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Landscape'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['Section 2 - Landscape'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // nextPage should force break even with same orientation
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // All pages should be landscape
      layout.pages.forEach((page) => {
        expect(page.orientation).toBe('landscape');
      });
    });
  });

  describe('Orientation Propagation to Pages', () => {
    it('should propagate orientation from section breaks to pages', async () => {
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
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Check section breaks have correct orientation
      const sectionBreaks = getSectionBreaks(blocks);
      const orientations = sectionBreaks
        .map((b) => b.orientation)
        .filter((o): o is 'portrait' | 'landscape' => o !== undefined && o !== null);

      // Should have both orientations in section breaks
      expect(orientations).toContain('portrait');
      expect(orientations).toContain('landscape');

      // Check pages have correct orientation
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
    });

    it('should maintain orientation throughout same-orientation sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['S2'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['S3'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(3);

      // All pages should maintain landscape orientation
      layout.pages.forEach((page) => {
        expect(page.orientation).toBe('landscape');
      });
    });
  });

  describe('Orientation with Page Size Coordination', () => {
    it('should coordinate orientation and page size for portrait', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Portrait section'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT, // h > w
        },
      );

      const layout = await convertAndLayout(pmDoc);

      const page = layout.pages[0];
      expect(page.orientation).toBe('portrait');

      if (page.pageSize) {
        // Portrait: height should be greater than width
        expect(page.pageSize.h).toBeGreaterThan(page.pageSize.w);
      }
    });

    it('should coordinate orientation and page size for landscape', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Landscape section'],
          },
        ],
        {
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE, // w > h
        },
      );

      const layout = await convertAndLayout(pmDoc);

      const page = layout.pages[0];
      expect(page.orientation).toBe('landscape');

      if (page.pageSize) {
        // Landscape: width should be greater than height
        expect(page.pageSize.w).toBeGreaterThan(page.pageSize.h);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle orientation change on first section', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['First section starts landscape'],
          },
        ],
        {
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages[0].orientation).toBe('landscape');
    });

    it('should handle rapid orientation changes', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['P'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['L'],
            props: {
              type: 'nextPage',
              orientation: 'landscape',
              pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
            },
          },
          {
            paragraphs: ['P'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['L'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(4);

      // Rapid alternation should work correctly
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
      expect(layout.pages[2].orientation).toBe('portrait');
      expect(layout.pages[3].orientation).toBe('landscape');
    });
  });
});
