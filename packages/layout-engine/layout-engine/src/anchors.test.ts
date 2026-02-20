import { describe, it, expect } from 'vitest';
import { isPageRelativeAnchor, collectPreRegisteredAnchors, collectAnchoredDrawings } from './anchors.js';
import type { FlowBlock, ImageBlock, DrawingBlock, Measure, ImageMeasure, DrawingMeasure } from '@superdoc/contracts';

describe('anchors', () => {
  describe('isPageRelativeAnchor', () => {
    it('should return true for vRelativeFrom="page"', () => {
      const block: ImageBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          vRelativeFrom: 'page',
        },
      };
      expect(isPageRelativeAnchor(block)).toBe(true);
    });

    it('should return true for vRelativeFrom="margin"', () => {
      const block: ImageBlock = {
        kind: 'image',
        id: 'img-2',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          vRelativeFrom: 'margin',
        },
      };
      expect(isPageRelativeAnchor(block)).toBe(true);
    });

    it('should return false for vRelativeFrom="paragraph"', () => {
      const block: ImageBlock = {
        kind: 'image',
        id: 'img-3',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          vRelativeFrom: 'paragraph',
        },
      };
      expect(isPageRelativeAnchor(block)).toBe(false);
    });

    it('should return false when vRelativeFrom is undefined', () => {
      const block: ImageBlock = {
        kind: 'image',
        id: 'img-4',
        src: 'test.png',
        anchor: {
          isAnchored: true,
        },
      };
      expect(isPageRelativeAnchor(block)).toBe(false);
    });

    it('should return false when anchor is undefined', () => {
      const block: ImageBlock = {
        kind: 'image',
        id: 'img-5',
        src: 'test.png',
      };
      expect(isPageRelativeAnchor(block)).toBe(false);
    });

    it('should handle drawing blocks with vRelativeFrom="page"', () => {
      const block: DrawingBlock = {
        kind: 'drawing',
        id: 'drawing-1',
        drawingKind: 'vectorShape',
        geometry: { width: 100, height: 100 },
        anchor: {
          isAnchored: true,
          vRelativeFrom: 'page',
        },
      };
      expect(isPageRelativeAnchor(block)).toBe(true);
    });

    it('should handle drawing blocks with vRelativeFrom="paragraph"', () => {
      const block: DrawingBlock = {
        kind: 'drawing',
        id: 'drawing-2',
        drawingKind: 'vectorShape',
        geometry: { width: 100, height: 100 },
        anchor: {
          isAnchored: true,
          vRelativeFrom: 'paragraph',
        },
      };
      expect(isPageRelativeAnchor(block)).toBe(false);
    });
  });

  describe('collectPreRegisteredAnchors', () => {
    it('should collect images with vRelativeFrom="page"', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'page',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(1);
      expect(result[0].block.id).toBe('img-1');
      expect(result[0].measure.width).toBe(100);
    });

    it('should collect images with vRelativeFrom="margin"', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-2',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'margin',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 200,
          height: 150,
        } as ImageMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(1);
      expect(result[0].block.id).toBe('img-2');
    });

    it('should exclude images with vRelativeFrom="paragraph"', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-3',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(0);
    });

    it('should exclude non-anchored images', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-4',
          src: 'test.png',
          anchor: {
            isAnchored: false,
            vRelativeFrom: 'page',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(0);
    });

    it('should exclude images without anchor property', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-5',
          src: 'test.png',
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(0);
    });

    it('should collect multiple page-relative anchors', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-1',
          src: 'test1.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'page',
          },
        } as ImageBlock,
        {
          kind: 'image',
          id: 'img-2',
          src: 'test2.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'margin',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
        {
          kind: 'image',
          width: 200,
          height: 150,
        } as ImageMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(2);
      expect(result[0].block.id).toBe('img-1');
      expect(result[1].block.id).toBe('img-2');
    });

    it('should handle mixed block types and only collect page-relative anchors', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'page',
          },
        } as ImageBlock,
        {
          kind: 'image',
          id: 'img-2',
          src: 'test2.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
        {
          kind: 'image',
          width: 200,
          height: 150,
        } as ImageMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(1);
      expect(result[0].block.id).toBe('img-1');
    });

    it('should handle drawing blocks with page-relative anchors', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'vectorShape',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'page',
          },
        } as DrawingBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'drawing',
          width: 100,
          height: 100,
        } as DrawingMeasure,
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(1);
      expect(result[0].block.id).toBe('drawing-1');
    });

    it('should handle empty blocks array', () => {
      const result = collectPreRegisteredAnchors([], []);
      expect(result).toHaveLength(0);
    });

    it('should handle mismatched blocks and measures lengths', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'page',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(0);
    });

    it('should handle mismatched measure kind', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'page',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
      ];

      const result = collectPreRegisteredAnchors(blocks, measures);
      expect(result).toHaveLength(0);
    });
  });

  describe('collectAnchoredDrawings', () => {
    it('should map paragraph-relative anchored image to nearest preceding paragraph', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(1);
      expect(result.has(0)).toBe(true);
      const anchorsForPara0 = result.get(0);
      expect(anchorsForPara0).toHaveLength(1);
      expect(anchorsForPara0?.[0].block.id).toBe('img-1');
    });

    it('should map anchored image to nearest following paragraph when no preceding paragraph exists', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(1);
      expect(result.has(1)).toBe(true);
      const anchorsForPara1 = result.get(1);
      expect(anchorsForPara1).toHaveLength(1);
      expect(anchorsForPara1?.[0].block.id).toBe('img-1');
    });

    it('should exclude page-relative anchors', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'page',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(0);
    });

    it('should exclude margin-relative anchors', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'margin',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(0);
    });

    it('should exclude non-anchored images', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(0);
    });

    it('should handle multiple anchored images for the same paragraph', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test1.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
        {
          kind: 'image',
          id: 'img-2',
          src: 'test2.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
        {
          kind: 'image',
          width: 200,
          height: 150,
        } as ImageMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(1);
      const anchorsForPara0 = result.get(0);
      expect(anchorsForPara0).toHaveLength(2);
      expect(anchorsForPara0?.[0].block.id).toBe('img-1');
      expect(anchorsForPara0?.[1].block.id).toBe('img-2');
    });

    it('should handle drawing blocks with paragraph-relative anchors', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'drawing',
          id: 'drawing-1',
          drawingKind: 'vectorShape',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as DrawingBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'drawing',
          width: 100,
          height: 100,
        } as DrawingMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(1);
      expect(result.has(0)).toBe(true);
      const anchorsForPara0 = result.get(0);
      expect(anchorsForPara0).toHaveLength(1);
      expect(anchorsForPara0?.[0].block.id).toBe('drawing-1');
    });

    it('should return empty map when no paragraphs exist', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(0);
    });

    it('should handle empty blocks array', () => {
      const result = collectAnchoredDrawings([], []);
      expect(result.size).toBe(0);
    });

    it('should handle anchored images with undefined vRelativeFrom (defaults to paragraph)', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        {
          kind: 'paragraph',
          lines: [],
          totalHeight: 0,
        },
        {
          kind: 'image',
          width: 100,
          height: 100,
        } as ImageMeasure,
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(1);
      expect(result.has(0)).toBe(true);
    });

    it('should handle complex document structure with multiple paragraphs and anchors', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test1.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
        {
          kind: 'paragraph',
          id: 'para-2',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-2',
          src: 'test2.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
        {
          kind: 'paragraph',
          id: 'para-3',
          runs: [],
        },
      ];
      const measures: Measure[] = [
        { kind: 'paragraph', lines: [], totalHeight: 0 },
        { kind: 'image', width: 100, height: 100 } as ImageMeasure,
        { kind: 'paragraph', lines: [], totalHeight: 0 },
        { kind: 'image', width: 200, height: 150 } as ImageMeasure,
        { kind: 'paragraph', lines: [], totalHeight: 0 },
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(2);

      const anchorsForPara0 = result.get(0);
      expect(anchorsForPara0).toHaveLength(1);
      expect(anchorsForPara0?.[0].block.id).toBe('img-1');

      const anchorsForPara2 = result.get(2);
      expect(anchorsForPara2).toHaveLength(1);
      expect(anchorsForPara2?.[0].block.id).toBe('img-2');
    });

    it('should handle mismatched measure kind gracefully', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [],
        },
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
          anchor: {
            isAnchored: true,
            vRelativeFrom: 'paragraph',
          },
        } as ImageBlock,
      ];
      const measures: Measure[] = [
        { kind: 'paragraph', lines: [], totalHeight: 0 },
        { kind: 'paragraph', lines: [], totalHeight: 0 }, // Wrong measure type
      ];

      const result = collectAnchoredDrawings(blocks, measures);
      expect(result.size).toBe(0);
    });
  });
});
