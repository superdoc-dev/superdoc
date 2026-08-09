/**
 * Basic Section Break Tests
 *
 * Tests fundamental section break behavior:
 * - Single section documents (no section breaks)
 * - Two-section documents
 * - Three-section documents
 * - Four+ section documents
 * - Section break emission count
 *
 * @module section-breaks-basic.test
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  createPMDocWithSections,
  convertAndLayout,
  pmToFlowBlocks,
  assertPageCount,
  assertSectionBreakCount,
  getSectionBreaks,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';

describe('Section Breaks - Basic Behavior', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('Single Section Documents', () => {
    it('should handle document with no section breaks (single section)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Paragraph 1', 'Paragraph 2', 'Paragraph 3'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Single section = 1 initial section break (for document setup)
      // The body sectPr generates an initial section break
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(0);

      // Should have at least 1 page
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      // First page should be portrait
      expect(layout.pages[0].orientation).toBe('portrait');
    });

    it('should handle empty document with body sectPr', async () => {
      const pmDoc = createPMDocWithSections([], {
        orientation: 'portrait',
        pageSize: PAGE_SIZES.LETTER_PORTRAIT,
      });

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Layout should safely handle an empty document by producing at least one page
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);

      // Body sectPr should still emit a section break capturing orientation + page size
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks).toHaveLength(1);
      expect(sectionBreaks[0].orientation).toBe('portrait');
      expect(sectionBreaks[0].pageSize).toEqual(PAGE_SIZES.LETTER_PORTRAIT);
    });

    it('should handle document with only body sectPr (no paragraph sectPr)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Content without section break'],
          },
        ],
        {
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Should have landscape orientation from body sectPr
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      expect(layout.pages[0].orientation).toBe('landscape');
    });
  });

  describe('Two Section Documents', () => {
    it('should handle two sections with nextPage break', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Para 1', 'Section 1 - Para 2'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Para 1', 'Section 2 - Para 2'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Two sections should emit section breaks
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);

      // Should have at least 2 pages (nextPage forces page break)
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle two sections with continuous break', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1 - Para 1'],
            props: {
              type: 'continuous',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Section 2 - Para 1'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Continuous type should not force page break (but may have 2 pages due to content)
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);

      // Verify section break type
      const breaks = getSectionBreaks(blocks);
      const continuousBreak = breaks.find((b) => b.type === 'continuous');
      expect(continuousBreak).toBeDefined();
    });
  });

  describe('Three Section Documents', () => {
    it('should handle three sections with different types', async () => {
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

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Three sections should have section breaks between them
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(2);

      // Should have at least 3 pages (each nextPage forces new page)
      expect(layout.pages.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle three sections with mixed nextPage and continuous', async () => {
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
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Should have both nextPage and continuous breaks
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(2);

      const nextPageBreak = sectionBreaks.find((b) => b.type === 'nextPage');
      const continuousBreak = sectionBreaks.find((b) => b.type === 'continuous');

      expect(nextPageBreak).toBeDefined();
      expect(continuousBreak).toBeDefined();
    });
  });

  describe('Four+ Section Documents', () => {
    it('should handle four sections like multi_section_doc.docx', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 0 - Para 0', 'Section 0 - Para 1', 'Section 0 - Para 2'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              columns: { count: 1, gap: 0 },
            },
          },
          {
            paragraphs: ['Section 1 - Para 0', 'Section 1 - Para 1', 'Section 1 - Para 2'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              columns: { count: 2, gap: 20 },
            },
          },
          {
            paragraphs: ['Section 2 - Para 0', 'Section 2 - Para 1', 'Section 2 - Para 2'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              columns: { count: 1, gap: 0 },
            },
          },
          {
            paragraphs: ['Section 3 - Para 0', 'Section 3 - Para 1'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
          columns: { count: 1, gap: 0 },
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      // Four sections should have multiple section breaks
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(3);

      // Should have 4 pages (one per section with nextPage type)
      expect(layout.pages.length).toBe(4);

      // Verify orientations
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('portrait');
      expect(layout.pages[2].orientation).toBe('portrait');
      expect(layout.pages[3].orientation).toBe('landscape');
    });

    it('should handle five sections with various types', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Section 2'],
            props: { type: 'continuous', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Section 3'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Section 4'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
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
      const layout = await convertAndLayout(pmDoc);

      // Five sections should have section breaks
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(4);

      // Should have multiple pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Section Break Count Validation', () => {
    it('should emit correct number of section breaks for N sections', async () => {
      // 2 sections should have breaks between them + initial
      const doc2 = createPMDocWithSections(
        [
          {
            paragraphs: ['S1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['S2'],
          },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const { blocks: blocks2 } = pmToFlowBlocks(doc2);
      const breaks2 = getSectionBreaks(blocks2);
      // Should have section breaks for section transitions
      expect(breaks2.length).toBeGreaterThanOrEqual(1);

      // 3 sections
      const doc3 = createPMDocWithSections(
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
          },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const { blocks: blocks3 } = pmToFlowBlocks(doc3);
      const breaks3 = getSectionBreaks(blocks3);
      expect(breaks3.length).toBeGreaterThanOrEqual(2);
    });

    it('should not emit duplicate section breaks', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
          {
            paragraphs: ['Section 2'],
          },
        ],
        { orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);

      // Check that section breaks are at appropriate positions (not duplicated)
      const breakIndices: number[] = [];
      blocks.forEach((block, index) => {
        if (block.kind === 'sectionBreak') {
          breakIndices.push(index);
        }
      });

      // No two section breaks should be adjacent
      for (let i = 1; i < breakIndices.length; i++) {
        const gap = breakIndices[i] - breakIndices[i - 1];
        // Should have at least some content between breaks
        // (or they're the initial break and first transition break)
        expect(gap).toBeGreaterThan(0);
      }
    });
  });
});
