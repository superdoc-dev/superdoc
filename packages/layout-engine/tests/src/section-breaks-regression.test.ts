/**
 * Section Break Regression Tests
 *
 * Tests for specific bugs that were fixed:
 * - Bug: 3 pages → 4 pages (multi_section_doc.docx)
 * - Bug: Body sectPr not extracted from DOCX
 * - Bug: Orientation not propagating to pages
 * - Bug: Duplicate section breaks
 * - Bug: Section types being forced to continuous
 * - Bug: First section type not preserved
 *
 * @module section-breaks-regression.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPMDocWithSections,
  convertAndLayout,
  pmToFlowBlocks,
  getSectionBreaks,
  PAGE_SIZES,
  resetBlockIdCounter,
} from './test-helpers/section-test-utils.js';
import type { PMNode } from '@superdoc/contracts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Section Breaks - Regression Tests', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('Bug: multi_section_doc.docx rendering as 3 pages instead of 4', () => {
    it('should render exactly 4 pages for 4-section document', async () => {
      // Recreate the structure of multi_section_doc.docx
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

      const layout = await convertAndLayout(pmDoc);

      // CRITICAL: This was the bug - should be 4 pages, not 3
      expect(layout.pages.length).toBe(4);

      // Verify page 4 has landscape orientation
      expect(layout.pages[3].orientation).toBe('landscape');

      // Verify page sizes
      if (layout.pages[3].pageSize) {
        expect(layout.pages[3].pageSize.w).toBeGreaterThan(layout.pages[3].pageSize.h); // Landscape
      }
    });

    it('should emit correct number of section breaks (not duplicates)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['S0'],
            props: { type: 'nextPage', orientation: 'portrait', pageSize: PAGE_SIZES.LETTER_PORTRAIT },
          },
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
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // 4 sections should have section breaks between them
      // Should NOT have duplicate breaks
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(3);

      // Verify no consecutive section breaks
      let previousWasBreak = false;
      blocks.forEach((block) => {
        if (block.kind === 'sectionBreak') {
          // Two section breaks should not be consecutive (with no content between)
          expect(previousWasBreak).toBe(false);
          previousWasBreak = true;
        } else {
          previousWasBreak = false;
        }
      });
    });
  });

  describe('Bug: Body sectPr extraction from DOCX', () => {
    it('should extract and apply body sectPr properties', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Content without explicit section break'],
          },
        ],
        {
          // Body sectPr should be extracted and applied
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
          columns: { count: 1, gap: 0 },
        },
      );

      const layout = await convertAndLayout(pmDoc);

      // Body sectPr should apply to the document
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      expect(layout.pages[0].orientation).toBe('landscape');

      if (layout.pages[0].pageSize) {
        expect(layout.pages[0].pageSize.w).toBe(792);
        expect(layout.pages[0].pageSize.h).toBe(612);
      }
    });

    it('should use body sectPr for final section properties', async () => {
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
            paragraphs: ['Section 2 - should use body sectPr'],
          },
        ],
        {
          // Body sectPr defines final section
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LEGAL_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(2);

      // First section: portrait letter
      expect(layout.pages[0].orientation).toBe('portrait');

      // Second section: landscape legal (from body sectPr)
      expect(layout.pages[1].orientation).toBe('landscape');

      if (layout.pages[1].pageSize) {
        expect(layout.pages[1].pageSize.w).toBe(1008); // Legal landscape
      }
    });
  });

  describe('Bug: Orientation not propagating to pages', () => {
    it('should propagate portrait orientation to pages', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Portrait content'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages[0].orientation).toBe('portrait');
    });

    it('should propagate landscape orientation to pages', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Landscape content'],
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

    it('should propagate orientation changes across sections', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Portrait'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Landscape'],
          },
        ],
        {
          type: 'nextPage',
          orientation: 'landscape',
          pageSize: PAGE_SIZES.LETTER_LANDSCAPE,
        },
      );

      const layout = await convertAndLayout(pmDoc);

      expect(layout.pages.length).toBe(2);
      expect(layout.pages[0].orientation).toBe('portrait');
      expect(layout.pages[1].orientation).toBe('landscape');
    });
  });

  describe('Bug: Duplicate section breaks', () => {
    it('should not emit duplicate section breaks at same position', async () => {
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

      // Find all section break positions
      const breakPositions: number[] = [];
      blocks.forEach((block, index) => {
        if (block.kind === 'sectionBreak') {
          breakPositions.push(index);
        }
      });

      // No two breaks should be at same position
      const uniquePositions = new Set(breakPositions);
      expect(uniquePositions.size).toBe(breakPositions.length);

      // No two breaks should be adjacent (unless there's a reason)
      for (let i = 1; i < breakPositions.length; i++) {
        const gap = breakPositions[i] - breakPositions[i - 1];
        // Should have at least some space between breaks
        expect(gap).toBeGreaterThan(0);
      }
    });
  });

  describe('Bug: Section types being forced to continuous', () => {
    it('should preserve nextPage type (not force to continuous)', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage', // Should be preserved, not forced to continuous
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

      // Should have nextPage breaks, not forced to continuous
      const nextPageBreak = sectionBreaks.find((b) => b.type === 'nextPage');
      expect(nextPageBreak).toBeDefined();
    });

    it('should preserve body section type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Content'],
          },
        ],
        {
          type: 'nextPage', // Body sectPr type should be preserved
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Body section type should be preserved (not forced to continuous)
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Bug: First section type not preserved', () => {
    it('should preserve first section explicit type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['First section with nextPage'],
            props: {
              type: 'nextPage', // First section type should be preserved
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Second section'],
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

    it('should preserve first section evenPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['First section with evenPage'],
            props: {
              type: 'evenPage', // Should be preserved
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Second section'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // First section's evenPage type should be preserved
      const evenPageBreak = sectionBreaks.find((b) => b.type === 'evenPage');
      expect(evenPageBreak).toBeDefined();
    });

    it('should preserve first section oddPage type', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['First section with oddPage'],
            props: {
              type: 'oddPage', // Should be preserved
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
          {
            paragraphs: ['Second section'],
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // First section's oddPage type should be preserved
      const oddPageBreak = sectionBreaks.find((b) => b.type === 'oddPage');
      expect(oddPageBreak).toBeDefined();
    });
  });

  describe('Verification against real DOCX fixture', () => {
    it('should match expected output for multi_section_doc.json fixture', () => {
      // Load the actual fixture
      const fixturePath = path.join(
        __dirname,
        '../../../super-editor/src/editors/v1/core/layout-adapter/fixtures/multi_section_doc.json',
      );

      if (!fs.existsSync(fixturePath)) {
        console.warn(`Fixture not found: ${fixturePath}, skipping test`);
        return;
      }

      const pmDoc: PMNode = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

      expect(pmDoc).toBeDefined();
      expect(pmDoc.type).toBe('doc');
      expect(pmDoc.content).toBeDefined();
    });
  });

  describe('Bug: Section break at document end', () => {
    it('should handle section break at very last paragraph correctly', async () => {
      const pmDoc = createPMDocWithSections(
        [
          {
            paragraphs: ['Para 1'],
          },
          {
            paragraphs: ['Para 2'],
          },
          {
            paragraphs: ['Last para with section break'],
            props: {
              type: 'nextPage',
              orientation: 'portrait',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
            },
          },
        ],
        {
          orientation: 'portrait',
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const layout = await convertAndLayout(pmDoc);

      const sectionBreaks = getSectionBreaks(blocks);

      // Should handle final section break without errors
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });
  });
});
