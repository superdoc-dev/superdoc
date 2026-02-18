import { describe, expect, it } from 'vitest';
import { resolveMeasurementConstraints } from '../src/incrementalLayout';
import type { FlowBlock, SectionBreakBlock } from '@superdoc/contracts';
import type { LayoutOptions } from '../../layout-engine/src/index';

/**
 * Unit tests for resolveMeasurementConstraints function.
 *
 * This function computes the maximum measurement constraints (width and height) needed
 * for measuring blocks across all sections in a document. It ensures blocks are measured
 * at the widest column width and tallest content height to prevent remeasurement during pagination.
 */
describe('resolveMeasurementConstraints', () => {
  const DEFAULT_PAGE_SIZE = { w: 612, h: 792 }; // US Letter
  const DEFAULT_MARGINS = { top: 72, right: 72, bottom: 72, left: 72 }; // 1 inch

  describe('base constraints without blocks', () => {
    it('computes base content dimensions without blocks', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const result = resolveMeasurementConstraints(options);

      // Content width = 612 - (72 + 72) = 468
      // Content height = 792 - (72 + 72) = 648
      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('accounts for columns in base options', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const result = resolveMeasurementConstraints(options);

      // Content width = 612 - (72 + 72) = 468
      // Column width = (468 - 48) / 2 = 210
      expect(result.measurementWidth).toBe(210);
      expect(result.measurementHeight).toBe(648);
    });

    it('handles single column explicitly (no gap subtraction)', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 1, gap: 0 },
      };

      const result = resolveMeasurementConstraints(options);

      // Single column uses full content width
      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('handles three columns with gap', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 36, right: 36, bottom: 36, left: 36 },
        columns: { count: 3, gap: 24 },
      };

      const result = resolveMeasurementConstraints(options);

      // Content width = 612 - (36 + 36) = 540
      // Total gap = 24 * (3 - 1) = 48
      // Column width = (540 - 48) / 3 = 164
      expect(result.measurementWidth).toBe(164);
      expect(result.measurementHeight).toBe(720); // 792 - (36 + 36)
    });
  });

  describe('section break constraints', () => {
    it('computes max width from section break with wider margins', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 1, gap: 0 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'section-1',
          // Narrower margins = wider content area
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Base: 612 - (72 + 72) = 468
      // Section: 612 - (36 + 36) = 540 (wider)
      expect(result.measurementWidth).toBe(540);
      expect(result.measurementHeight).toBe(720); // max(648, 720)
    });

    it('computes max width from section with columns', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 1, gap: 0 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'section-1',
          columns: { count: 2, gap: 48 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Base: 468 (single column)
      // Section: (468 - 48) / 2 = 210
      // Max should be base (468) since it's wider
      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('handles multiple section breaks and returns max dimensions', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 2, gap: 48 },
      };

      const blocks: FlowBlock[] = [
        // Section 1: single column (wider)
        {
          kind: 'sectionBreak',
          id: 'section-1',
          columns: { count: 1, gap: 0 },
        } as SectionBreakBlock,
        // Section 2: three columns (narrower)
        {
          kind: 'sectionBreak',
          id: 'section-2',
          columns: { count: 3, gap: 24 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Base: (468 - 48) / 2 = 210
      // Section 1: 468 (widest)
      // Section 2: (468 - 48) / 3 = 140
      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('skips sections with invalid dimensions (negative content width)', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'invalid-section',
          // Margins too large, creating negative content width
          margins: { top: 72, right: 400, bottom: 72, left: 400 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Should skip invalid section and use base constraints
      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('handles section with custom page size', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 }, // US Letter
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'section-1',
          pageSize: { w: 842, h: 1191 }, // A4
          margins: { top: 72, right: 72, bottom: 72, left: 72 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Base: 612 - (72 + 72) = 468
      // Section: 842 - (72 + 72) = 698 (wider)
      expect(result.measurementWidth).toBe(698);
      expect(result.measurementHeight).toBe(1047); // max(648, 1047)
    });

    it('ignores non-sectionBreak blocks', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'sectionBreak',
          id: 'section-1',
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Should only consider section break
      expect(result.measurementWidth).toBe(540); // 612 - (36 + 36)
      expect(result.measurementHeight).toBe(720);
    });
  });

  describe('margin normalization', () => {
    it('handles undefined margins with defaults', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        // margins undefined
      };

      const result = resolveMeasurementConstraints(options);

      // Should use default margins (72 on all sides)
      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('handles partially undefined margins', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 50, left: 50 }, // right and bottom undefined
      };

      const result = resolveMeasurementConstraints(options);

      // top: 50, right: 72 (default), bottom: 72 (default), left: 50
      expect(result.measurementWidth).toBe(490); // 612 - (50 + 72)
      expect(result.measurementHeight).toBe(670); // 792 - (50 + 72)
    });

    it('handles section with partially undefined margins', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'section-1',
          margins: { left: 36 }, // only left defined, others inherit from base
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Section margins: top: 72, right: 72, bottom: 72, left: 36
      // Content width = 612 - (36 + 72) = 504
      expect(result.measurementWidth).toBe(504);
      expect(result.measurementHeight).toBe(648);
    });
  });

  describe('column width calculations', () => {
    it('handles zero gap in multi-column layout', () => {
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
        columns: { count: 2, gap: 0 },
      };

      const result = resolveMeasurementConstraints(options);

      // Content width = 500
      // Column width = (500 - 0) / 2 = 250
      expect(result.measurementWidth).toBe(250);
    });

    it('handles undefined gap (defaults to 0)', () => {
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
        columns: { count: 2 }, // gap undefined
      };

      const result = resolveMeasurementConstraints(options);

      // Gap defaults to 0
      expect(result.measurementWidth).toBe(250);
    });

    it('handles negative gap (treated as 0)', () => {
      const options: LayoutOptions = {
        pageSize: { w: 600, h: 800 },
        margins: { top: 50, right: 50, bottom: 50, left: 50 },
        columns: { count: 2, gap: -10 },
      };

      const result = resolveMeasurementConstraints(options);

      // Negative gap clamped to 0
      expect(result.measurementWidth).toBe(250);
    });
  });

  describe('real-world scenarios', () => {
    it('handles document transitioning from single to multi-column', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        columns: { count: 1, gap: 0 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'section-2',
          columns: { count: 2, gap: 48 },
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Base: 612 - (72 + 72) = 468 (single column)
      // Section content: 612 - (36 + 36) = 540
      // Section column width: (540 - 48) / 2 = 246
      // Max column width: 468 (base is wider than section's 246)
      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(720); // Section has taller content height
    });

    it('handles complex multi-section document', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 108, bottom: 72, left: 108 },
        columns: { count: 1, gap: 0 },
      };

      const blocks: FlowBlock[] = [
        // Section 1: Two columns, standard margins
        {
          kind: 'sectionBreak',
          id: 'section-1',
          columns: { count: 2, gap: 36 },
        } as SectionBreakBlock,
        // Section 2: Single column, wide margins
        {
          kind: 'sectionBreak',
          id: 'section-2',
          columns: { count: 1, gap: 0 },
          margins: { top: 72, right: 144, bottom: 72, left: 144 },
        } as SectionBreakBlock,
        // Section 3: Three columns, narrow margins
        {
          kind: 'sectionBreak',
          id: 'section-3',
          columns: { count: 3, gap: 24 },
          margins: { top: 36, right: 36, bottom: 36, left: 36 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Base: 612 - (108 + 108) = 396
      // Section 1: (396 - 36) / 2 = 180
      // Section 2: 612 - (144 + 144) = 324
      // Section 3: 612 - (36 + 36) = 540, (540 - 48) / 3 = 164
      // Max: 540 (section 3 single column equivalent width before column division)
      // Actually for section 3: content width = 540, columns = 3, gap = 24
      // Total gap = 24 * 2 = 48, column width = (540 - 48) / 3 = 164
      // But we need to compare: 396, 180, 324, 164
      expect(result.measurementWidth).toBe(396); // Base is widest single-column
      expect(result.measurementHeight).toBe(720); // Section 3 has tallest content height
    });
  });

  describe('edge cases', () => {
    it('handles empty blocks array', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const result = resolveMeasurementConstraints(options, []);

      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('handles undefined blocks parameter', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const result = resolveMeasurementConstraints(options);

      expect(result.measurementWidth).toBe(468);
      expect(result.measurementHeight).toBe(648);
    });

    it('handles section with very narrow content area', () => {
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'section-1',
          columns: { count: 10, gap: 20 }, // Many columns with gaps
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Base: 468
      // Section: (468 - 180) / 10 = 28.8
      // Max: 468 (base is wider)
      expect(result.measurementWidth).toBe(468);
    });

    it('returns positive dimensions even with tight constraints', () => {
      const options: LayoutOptions = {
        pageSize: { w: 200, h: 200 },
        margins: { top: 90, right: 90, bottom: 90, left: 90 },
      };

      const result = resolveMeasurementConstraints(options);

      // Content: 200 - 180 = 20
      expect(result.measurementWidth).toBe(20);
      expect(result.measurementHeight).toBe(20);
    });
  });

  describe('mixed-orientation documents (SD-1859)', () => {
    it('takes max width across portrait and landscape sections', () => {
      // First section: portrait (612 x 792)
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
      };

      // Second section: landscape (792 x 612)
      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'sb-1',
          pageSize: { w: 792, h: 612 },
          margins: { top: 72, right: 72, bottom: 72, left: 72 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // Portrait content width: 612 - 144 = 468
      // Landscape content width: 792 - 144 = 648
      // Should take MAX: 648 (landscape width)
      expect(result.measurementWidth).toBe(648);
    });

    it('takes max width across sections with different margins', () => {
      // First section: narrow margins (content width = 612 - 100 = 512)
      const options: LayoutOptions = {
        pageSize: { w: 612, h: 792 },
        margins: { top: 72, right: 50, bottom: 72, left: 50 },
      };

      // Second section: wider margins (content width = 612 - 200 = 412)
      const blocks: FlowBlock[] = [
        {
          kind: 'sectionBreak',
          id: 'sb-1',
          pageSize: { w: 612, h: 792 },
          margins: { top: 72, right: 100, bottom: 72, left: 100 },
        } as SectionBreakBlock,
      ];

      const result = resolveMeasurementConstraints(options, blocks);

      // First section content width: 612 - 100 = 512
      // Second section content width: 612 - 200 = 412
      // Should take MAX: 512 (first section is wider)
      expect(result.measurementWidth).toBe(512);
    });
  });
});
