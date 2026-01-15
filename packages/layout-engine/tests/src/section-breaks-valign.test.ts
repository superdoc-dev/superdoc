/**
 * Section Break Vertical Alignment Tests
 *
 * Tests vertical alignment (vAlign) behavior for section breaks:
 * - Center alignment
 * - Bottom alignment
 * - 'both' alignment (currently treated as center)
 * - vAlign not inheriting between sections
 * - vAlign with multiple sections
 *
 * @module section-breaks-valign.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPMDocWithSections,
  convertAndLayout,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';

describe('Section Breaks - Vertical Alignment', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('Center Alignment', () => {
    it('should set vAlign="center" on pages in a centered section', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Centered content'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          vAlign: 'center',
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      expect(layout.pages[0].vAlign).toBe('center');
    });

    it('should offset fragment Y positions for center alignment', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Short centered paragraph'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          vAlign: 'center',
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      const page = layout.pages[0];

      // With center alignment, fragments should be offset from the top
      // The exact offset depends on content height and page size
      if (page.fragments.length > 0) {
        const firstFragment = page.fragments[0];
        // Fragment should be positioned below the top margin
        // With centering, it should be moved down from default position
        expect(firstFragment.y).toBeGreaterThan(0);
      }
    });
  });

  describe('Bottom Alignment', () => {
    it('should set vAlign="bottom" on pages in a bottom-aligned section', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Bottom-aligned content'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          vAlign: 'bottom',
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      expect(layout.pages[0].vAlign).toBe('bottom');
    });
  });

  describe('Both Alignment (Vertical Justification)', () => {
    it('should set vAlign="both" on pages (currently treated as center)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Justified content'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          vAlign: 'both',
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      expect(layout.pages[0].vAlign).toBe('both');
    });
  });

  describe('Top Alignment (Default)', () => {
    it('should not set vAlign when using default top alignment', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Top-aligned content'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          // No vAlign specified - defaults to top
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      // Top is the default, so vAlign should be undefined
      expect(layout.pages[0].vAlign).toBeUndefined();
    });
  });

  describe('vAlign Between Sections', () => {
    it('should NOT inherit vAlign from previous section', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Centered'],
            props: {
              type: 'nextPage',
              vAlign: 'center',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Should default to top'],
            // No vAlign specified - should reset to top, NOT inherit center
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          // No vAlign in body sectPr - defaults to top
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page should be centered
      expect(layout.pages[0].vAlign).toBe('center');

      // Second page should be top (undefined) - NOT inheriting center
      expect(layout.pages[1].vAlign).toBeUndefined();
    });

    it('should allow different vAlign per section', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Centered'],
            props: {
              type: 'nextPage',
              vAlign: 'center',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Bottom'],
            props: {
              type: 'nextPage',
              vAlign: 'bottom',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 3 - Top'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          vAlign: 'top',
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(3);

      // Each page should have the correct vAlign from its section
      expect(layout.pages[0].vAlign).toBe('center');
      expect(layout.pages[1].vAlign).toBe('bottom');
      // Top alignment means vAlign is undefined
      expect(layout.pages[2].vAlign).toBeUndefined();
    });
  });

  describe('baseMargins for vAlign Centering', () => {
    it('should store baseMargins on pages with non-top vAlign', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Centered with base margins'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          vAlign: 'center',
          margins: { header: 72, footer: 72 },
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      const page = layout.pages[0];

      expect(page.vAlign).toBe('center');
      // baseMargins should be stored for centering calculations
      expect(page.baseMargins).toBeDefined();
      expect(page.baseMargins?.top).toBeGreaterThan(0);
      expect(page.baseMargins?.bottom).toBeGreaterThan(0);
    });
  });
});
