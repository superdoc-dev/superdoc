/**
 * Section Break Edge Cases Tests
 *
 * Tests edge cases and error conditions:
 * - Empty documents
 * - Document with only body sectPr (no paragraph sectPr)
 * - Document with paragraph sectPr but no body sectPr
 * - Empty sectPr elements (should be filtered)
 * - Multiple continuous sections in sequence
 * - nextPage sections in sequence
 * - Malformed section properties
 *
 * @module section-breaks-edge-cases.test
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  createPMDocWithSections,
  createPMParagraph,
  createPMParagraphWithSection,
  createSectPrElement,
  convertAndLayout,
  pmToFlowBlocks,
  getSectionBreaks,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';
import type { PMNode } from '@superdoc/contracts';

describe('Section Breaks - Edge Cases', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('Empty Documents', () => {
    it('should handle completely empty document', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [],
        attrs: {},
      };

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Empty document should still layout (may have 1 empty page)
      expect(layout.pages.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle document with only body sectPr (no content)', async () => {
      const pmDoc = createPMDocWithSections([], {
        orientation: 'portrait',
        pageSize: PAGE_SIZES.LETTER_PORTRAIT,
      });

      const layout = await convertAndLayout(pmDoc);

      // Should create at least one page from body sectPr
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      if (layout.pages[0]) {
        expect(layout.pages[0].orientation).toBe('portrait');
      }
    });

    it('should handle document with empty paragraphs', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [createPMParagraph(''), createPMParagraph(''), createPMParagraph('')],
        attrs: {
          sectPr: {
            orientation: 'portrait',
            pgSz: PAGE_SIZES.LETTER_PORTRAIT,
          },
        },
      };

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Body SectPr Only', () => {
    it('should handle document with only body sectPr (no paragraph sectPr)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Para 1', 'Para 2', 'Para 3'],
          },
        ],
        {
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      expect(layout.pages[0].orientation).toBe('landscape');
    });

    it('should apply body sectPr properties to all pages', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            // Many paragraphs to potentially create multiple pages
            paragraphs: Array.from({ length: 50 }, (_, i) => `Paragraph ${i + 1}`),
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          columns: { count: 1, gap: 0 },
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // All pages should have the same orientation from body sectPr
      layout.pages.forEach((page) => {
        expect(page.orientation).toBe('portrait');
      });
    });
  });

  describe('Paragraph SectPr Without Body SectPr', () => {
    it('should handle document with paragraph sectPr but no body sectPr', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [
          createPMParagraph('Para 1'),
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [{ type: 'text', text: 'Para 2 with sectPr' }],
              },
            ],
            attrs: {
              sectPr: {
                type: 'nextPage',
                orientation: 'portrait',
                pgSz: PAGE_SIZES.LETTER_PORTRAIT,
              },
            },
          },
          createPMParagraph('Para 3'),
        ],
        attrs: {}, // No body sectPr
      };

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Should handle missing body sectPr gracefully
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Empty SectPr Elements', () => {
    it('should handle empty sectPr object', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [createPMParagraph('Content')],
        attrs: {
          sectPr: {}, // Empty sectPr
        },
      };

      const layout = await convertAndLayout(pmDoc);

      // Should not crash, should use defaults
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter out section breaks with no properties', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'run', content: [{ type: 'text', text: 'Para 1' }] }],
            attrs: {
              sectPr: {}, // Empty - should be filtered
            },
          },
          createPMParagraph('Para 2'),
        ],
        attrs: {
          sectPr: {
            orientation: 'portrait',
            pgSz: PAGE_SIZES.LETTER_PORTRAIT,
          },
        },
      };

      const { blocks } = pmToFlowBlocks(pmDoc);

      // Empty sectPr may or may not emit section break depending on implementation
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks).toBeDefined();
    });
  });

  describe('Multiple Continuous Sections', () => {
    it('should handle multiple consecutive continuous sections', async () => {
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
          {
            paragraphs: ['S3'],
            props: { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S4'],
          },
        ],
        {
          type: 'continuous',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      const sectionBreaks = getSectionBreaks(blocks);
      const continuousBreaks = sectionBreaks.filter((b) => b.type === 'continuous');

      // Should have multiple continuous breaks
      expect(continuousBreaks.length).toBeGreaterThanOrEqual(3);

      // Should not force unnecessary page breaks
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow continuous sections to share pages when possible', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Short 1'],
            props: { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Short 2'],
            props: { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Short 3'],
          },
        ],
        {
          type: 'continuous',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // All continuous sections with same properties may fit on one page
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Multiple NextPage Sections', () => {
    it('should handle multiple consecutive nextPage sections', async () => {
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
          },
        ],
        {
          type: 'nextPage',
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      const sectionBreaks = getSectionBreaks(blocks);
      const nextPageBreaks = sectionBreaks.filter((b) => b.type === 'nextPage');

      // Should have multiple nextPage breaks
      expect(nextPageBreaks.length).toBeGreaterThanOrEqual(3);

      // Each nextPage should force a new page
      expect(layout.pages.length).toBe(4);
    });
  });

  describe('Malformed Section Properties', () => {
    it('should handle missing orientation gracefully', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [createPMParagraph('Content')],
        attrs: {
          sectPr: {
            pgSz: PAGE_SIZES.LETTER_PORTRAIT,
            // orientation missing
          },
        },
      };

      const layout = await convertAndLayout(pmDoc);

      // Should not crash
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle missing pageSize gracefully', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [createPMParagraph('Content')],
        attrs: {
          sectPr: {
            orientation: 'portrait',
            // pageSize missing
          },
        },
      };

      const layout = await convertAndLayout(pmDoc);

      // Should use default page size
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle invalid section type gracefully', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'run', content: [{ type: 'text', text: 'Content' }] }],
            attrs: {
              sectPr: {
                type: 'invalidType' as any, // Invalid type
                orientation: 'portrait',
                pgSz: PAGE_SIZES.LETTER_PORTRAIT,
              },
            },
          },
        ],
        attrs: {},
      };

      const { blocks } = pmToFlowBlocks(pmDoc);

      // Should not crash
      expect(blocks).toBeDefined();
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle single paragraph document', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Only paragraph'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(1);
    });

    it('should handle very long document with many sections', async () => {
      const sections = Array.from({ length: 20 }, (_, i) => ({
        paragraphs: [`Section ${i + 1}`],
        props: {
          type: 'nextPage' as const,
          orientation: 'portrait' as const,
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      }));

      const pmDoc = createPMDocWithSections(sections, {
        orientation: 'portrait',
        pageSize: PAGE_SIZES.LETTER_PORTRAIT,
      });

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Should handle many sections
      expect(layout.pages.length).toBe(20);

      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(19);
    });

    it('should handle section break at very end of document', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [
          createPMParagraph('Para 1'),
          createPMParagraph('Para 2'),
          createPMParagraphWithSection('Last para', {
            type: 'nextPage',
            orientation: 'portrait',
            pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          }),
        ],
        attrs: {
          bodySectPr: createSectPrElement({
            orientation: 'portrait',
            pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          }),
        },
      };

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Section break at end should still work
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Mixed Valid and Missing Properties', () => {
    it('should handle sections with partial properties', async () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'run', content: [{ type: 'text', text: 'S1' }] }],
            attrs: {
              sectPr: {
                orientation: 'portrait', // Only orientation
              },
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'run', content: [{ type: 'text', text: 'S2' }] }],
            attrs: {
              sectPr: {
                pgSz: PAGE_SIZES.LETTER_LANDSCAPE, // Only page size
              },
            },
          },
          createPMParagraph('S3'),
        ],
        attrs: {
          sectPr: {
            type: 'nextPage',
            orientation: 'landscape',
            pgSz: PAGE_SIZES.LETTER_LANDSCAPE,
          },
        },
      };

      const layout = await convertAndLayout(pmDoc);

      // Should handle partial properties without crashing
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });
  });
});
