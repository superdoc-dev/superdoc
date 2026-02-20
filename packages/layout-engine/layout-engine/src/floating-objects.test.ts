import { describe, expect, it } from 'vitest';
import { createFloatingObjectManager } from './floating-objects.js';
import type { ImageBlock, ImageMeasure } from '@superdoc/contracts';

describe('FloatingObjectManager', () => {
  const mockColumns = { width: 600, gap: 20, count: 1 };

  const createMockImageBlock = (overrides: Partial<ImageBlock> = {}): ImageBlock => ({
    kind: 'image',
    id: 'test-image',
    src: 'test.png',
    width: 200,
    height: 150,
    anchor: {
      isAnchored: true,
      hRelativeFrom: 'column',
      vRelativeFrom: 'paragraph',
      alignH: 'left',
      offsetH: 0,
      offsetV: 0,
    },
    wrap: {
      type: 'Square',
      wrapText: 'right',
      distTop: 0,
      distBottom: 0,
      distLeft: 0,
      distRight: 10,
    },
    ...overrides,
  });

  const createMockMeasure = (overrides: Partial<ImageMeasure> = {}): ImageMeasure => ({
    kind: 'image',
    width: 200,
    height: 150,
    ...overrides,
  });

  describe('registerDrawing', () => {
    it('creates exclusion zone for anchored image with Square wrap', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock();
      const measure = createMockMeasure();

      manager.registerDrawing(imageBlock, measure, 100, 0, 1);

      const zones = manager.getAllFloatsForPage(1);
      expect(zones).toHaveLength(1);
      expect(zones[0]).toMatchObject({
        imageBlockId: 'test-image',
        pageNumber: 1,
        columnIndex: 0,
        bounds: {
          x: 0, // left-aligned
          y: 100, // anchor Y + offsetV(0)
          width: 200,
          height: 150,
        },
        distances: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 10,
        },
        wrapMode: 'left', // wrapText='right' → image on left
      });
    });

    it('skips non-anchored images', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock({
        anchor: undefined,
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      expect(manager.getAllFloatsForPage(1)).toHaveLength(0);
    });

    it('skips images with None wrap type', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock({
        wrap: { type: 'None' },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      expect(manager.getAllFloatsForPage(1)).toHaveLength(0);
    });

    it('skips images with Inline wrap type', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock({
        wrap: { type: 'Inline' },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      expect(manager.getAllFloatsForPage(1)).toHaveLength(0);
    });

    it('computes correct X position for right-aligned image', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          alignH: 'right',
          offsetH: 20,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const zones = manager.getAllFloatsForPage(1);
      expect(zones[0].bounds.x).toBe(600 - 200 - 20); // columnWidth - imageWidth - offsetH
    });

    it('computes correct X position for center-aligned image', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          alignH: 'center',
          offsetH: 10,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const zones = manager.getAllFloatsForPage(1);
      expect(zones[0].bounds.x).toBe((600 - 200) / 2 + 10); // (columnWidth - imageWidth) / 2 + offsetH
    });

    it('applies vertical offset to image Y position', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          offsetV: 50,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const zones = manager.getAllFloatsForPage(1);
      expect(zones[0].bounds.y).toBe(150); // anchorY(100) + offsetV(50)
    });
  });

  describe('getExclusionsForLine', () => {
    it('returns exclusion when line vertically overlaps image', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock();

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      // Line at Y=120 with height=20 overlaps image at Y=100-250
      const exclusions = manager.getExclusionsForLine(120, 20, 0, 1);
      expect(exclusions).toHaveLength(1);
    });

    it('returns empty array when line does not overlap image vertically', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock();

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      // Line at Y=300 (below image ending at Y=250)
      const exclusions = manager.getExclusionsForLine(300, 20, 0, 1);
      expect(exclusions).toHaveLength(0);
    });

    it('considers distance margins in overlap calculation', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock({
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distTop: 10,
          distBottom: 10,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      // Line at Y=95 overlaps distTop margin (image at 100-10=90)
      const exclusions = manager.getExclusionsForLine(95, 5, 0, 1);
      expect(exclusions).toHaveLength(1);

      // Line at Y=255 overlaps distBottom margin (image ends at 250+10=260)
      const exclusions2 = manager.getExclusionsForLine(255, 5, 0, 1);
      expect(exclusions2).toHaveLength(1);
    });

    it('filters by page number', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock();

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const exclusions = manager.getExclusionsForLine(120, 20, 0, 2); // Wrong page
      expect(exclusions).toHaveLength(0);
    });

    it('filters by column index', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);
      const imageBlock = createMockImageBlock();

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const exclusions = manager.getExclusionsForLine(120, 20, 1, 1); // Wrong column
      expect(exclusions).toHaveLength(0);
    });
  });

  describe('computeAvailableWidth', () => {
    it('returns full width when no exclusions', () => {
      const manager = createFloatingObjectManager(mockColumns, { left: 0, right: 0 }, 600);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);
      expect(result).toEqual({ width: 600, offsetX: 0 });
    });

    it('reduces width for left-side image (wrapText=right)', () => {
      const manager = createFloatingObjectManager(mockColumns);
      const imageBlock = createMockImageBlock({
        wrap: {
          type: 'Square',
          wrapText: 'right', // Image on left
          distLeft: 5,
          distRight: 10,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);
      expect(result.width).toBe(600 - 200 - 5 - 10); // baseWidth - imageWidth - distLeft - distRight
      expect(result.offsetX).toBe(200 + 5 + 10); // Image width + distances
    });

    it('reduces width for right-side image (wrapText=left)', () => {
      const manager = createFloatingObjectManager(mockColumns);
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          alignH: 'right',
        },
        wrap: {
          type: 'Square',
          wrapText: 'left', // Image on right
          distLeft: 5,
          distRight: 10,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);
      expect(result.width).toBe(600 - 200 - 5 - 10);
      expect(result.offsetX).toBe(0); // No offset for right-side image
    });

    it('returns full width for TopAndBottom wrap', () => {
      const manager = createFloatingObjectManager(mockColumns);
      const imageBlock = createMockImageBlock({
        wrap: {
          type: 'TopAndBottom',
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);
      expect(result).toEqual({ width: 600, offsetX: 0 });
    });

    it('ensures minimum width of 1px', () => {
      const manager = createFloatingObjectManager(mockColumns);
      const imageBlock = createMockImageBlock({
        width: 700, // Wider than column
        wrap: {
          type: 'Square',
          wrapText: 'right',
        },
      });
      const measure = createMockMeasure({ width: 700 });

      manager.registerDrawing(imageBlock, measure, 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);
      expect(result.width).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getAllFloatsForPage', () => {
    it('returns only floats for specified page', () => {
      const manager = createFloatingObjectManager(mockColumns);
      const image1 = createMockImageBlock({ id: 'img-1' });
      const image2 = createMockImageBlock({ id: 'img-2' });
      const measure = createMockMeasure();

      manager.registerDrawing(image1, measure, 100, 0, 1);
      manager.registerDrawing(image2, measure, 200, 0, 2);

      const page1Floats = manager.getAllFloatsForPage(1);
      expect(page1Floats).toHaveLength(1);
      expect(page1Floats[0].imageBlockId).toBe('img-1');

      const page2Floats = manager.getAllFloatsForPage(2);
      expect(page2Floats).toHaveLength(1);
      expect(page2Floats[0].imageBlockId).toBe('img-2');
    });
  });

  describe('clear', () => {
    it('removes all registered exclusion zones', () => {
      const manager = createFloatingObjectManager(mockColumns);
      const imageBlock = createMockImageBlock();

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);
      expect(manager.getAllFloatsForPage(1)).toHaveLength(1);

      manager.clear();
      expect(manager.getAllFloatsForPage(1)).toHaveLength(0);
    });
  });

  describe('computeAvailableWidth - Multiple Floats', () => {
    it('handles multiple floats on same side (left)', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // First float on left at X=0, width=100
      const float1 = createMockImageBlock({
        id: 'float-1',
        width: 100,
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      });

      // Second float on left at X=0, width=150 (wider, more intrusive)
      const float2 = createMockImageBlock({
        id: 'float-2',
        width: 150,
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 5,
        },
      });

      manager.registerDrawing(float1, createMockMeasure({ width: 100 }), 100, 0, 1);
      manager.registerDrawing(float2, createMockMeasure({ width: 150 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Should use the most intrusive float (float2: 150 + 5 = 155)
      expect(result.width).toBe(600 - 155);
      expect(result.offsetX).toBe(155);
    });

    it('handles multiple floats on same side (right)', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // First float on right
      const float1 = createMockImageBlock({
        id: 'float-1',
        width: 100,
        anchor: {
          isAnchored: true,
          alignH: 'right',
        },
        wrap: {
          type: 'Square',
          wrapText: 'left',
          distLeft: 10,
          distRight: 0,
        },
      });

      // Second float on right (more intrusive)
      const float2 = createMockImageBlock({
        id: 'float-2',
        width: 120,
        anchor: {
          isAnchored: true,
          alignH: 'right',
        },
        wrap: {
          type: 'Square',
          wrapText: 'left',
          distLeft: 15,
          distRight: 0,
        },
      });

      manager.registerDrawing(float1, createMockMeasure({ width: 100 }), 100, 0, 1);
      manager.registerDrawing(float2, createMockMeasure({ width: 120 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Should use the most intrusive float (float2)
      // float2 is at X = 600 - 120 = 480
      // Left boundary = 480 - 15 = 465
      expect(result.width).toBe(465);
      expect(result.offsetX).toBe(0);
    });

    it('handles floats on both sides', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // Float on left
      const leftFloat = createMockImageBlock({
        id: 'left-float',
        width: 100,
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      });

      // Float on right
      const rightFloat = createMockImageBlock({
        id: 'right-float',
        width: 150,
        anchor: {
          isAnchored: true,
          alignH: 'right',
        },
        wrap: {
          type: 'Square',
          wrapText: 'left',
          distLeft: 10,
          distRight: 0,
        },
      });

      manager.registerDrawing(leftFloat, createMockMeasure({ width: 100 }), 100, 0, 1);
      manager.registerDrawing(rightFloat, createMockMeasure({ width: 150 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Left boundary: 0 + 100 + 10 = 110
      // Right boundary: (600 - 150) - 10 = 440
      // Available width: 440 - 110 = 330
      expect(result.width).toBe(330);
      expect(result.offsetX).toBe(110);
    });

    it('returns minimal width when floats completely overlap', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // Two very wide floats that completely overlap the line
      const leftFloat = createMockImageBlock({
        id: 'left-float',
        width: 400,
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 0,
        },
      });

      const rightFloat = createMockImageBlock({
        id: 'right-float',
        width: 300,
        anchor: {
          isAnchored: true,
          alignH: 'right',
        },
        wrap: {
          type: 'Square',
          wrapText: 'left',
          distLeft: 0,
          distRight: 0,
        },
      });

      manager.registerDrawing(leftFloat, createMockMeasure({ width: 400 }), 100, 0, 1);
      manager.registerDrawing(rightFloat, createMockMeasure({ width: 300 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Floats overlap (leftBoundary=400, rightBoundary=300)
      // Should return minimal width
      expect(result.width).toBe(1);
      expect(result.offsetX).toBe(0);
    });

    it('handles mix of wrapping and non-wrapping floats', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // TopAndBottom wrap (no horizontal wrapping)
      const nonWrappingFloat = createMockImageBlock({
        id: 'non-wrapping',
        width: 200,
        wrap: {
          type: 'TopAndBottom',
        },
      });

      // Square wrap (wrapping)
      const wrappingFloat = createMockImageBlock({
        id: 'wrapping',
        width: 100,
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      });

      manager.registerDrawing(nonWrappingFloat, createMockMeasure({ width: 200 }), 100, 0, 1);
      manager.registerDrawing(wrappingFloat, createMockMeasure({ width: 100 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Should only consider the wrapping float
      expect(result.width).toBe(600 - 110);
      expect(result.offsetX).toBe(110);
    });

    it('handles bothSides wrapText for float on left', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // Float with bothSides wrap positioned on left
      const float = createMockImageBlock({
        id: 'both-float',
        width: 100,
        anchor: {
          isAnchored: true,
          alignH: 'left',
        },
        wrap: {
          type: 'Square',
          wrapText: 'bothSides',
          distLeft: 5,
          distRight: 10,
        },
      });

      manager.registerDrawing(float, createMockMeasure({ width: 100 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Float center is at 50, which is < 300 (baseWidth/2), so it's a left float
      // Boundary: 0 + 100 + 5 + 10 = 115 (full exclusion width)
      expect(result.width).toBe(600 - 115);
      expect(result.offsetX).toBe(115);
    });

    it('handles bothSides wrapText for float on right', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // Float with bothSides wrap positioned on right
      const float = createMockImageBlock({
        id: 'both-float',
        width: 100,
        anchor: {
          isAnchored: true,
          alignH: 'right',
        },
        wrap: {
          type: 'Square',
          wrapText: 'bothSides',
          distLeft: 10,
          distRight: 5,
        },
      });

      manager.registerDrawing(float, createMockMeasure({ width: 100 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Float is at X = 600 - 100 = 500, center at 550 > 300, so it's a right float
      // Boundary: 500 - 10 - 5 = 485 (subtract both distances for symmetry)
      expect(result.width).toBe(485);
      expect(result.offsetX).toBe(0);
    });

    it('handles largest wrapText mode', () => {
      const manager = createFloatingObjectManager(mockColumns);

      // Float with largest wrap mode - should determine side by position
      const float = createMockImageBlock({
        id: 'largest-float',
        width: 100,
        anchor: {
          isAnchored: true,
          alignH: 'left',
        },
        wrap: {
          type: 'Square',
          wrapText: 'largest',
          distLeft: 5,
          distRight: 10,
        },
      });

      manager.registerDrawing(float, createMockMeasure({ width: 100 }), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      // Float on left side (center < baseWidth/2)
      // Exclusion width: 0 + 100 + 5 + 10 = 115
      expect(result.width).toBe(600 - 115);
      expect(result.offsetX).toBe(115);
    });

    it('returns full width when all exclusions are non-wrapping', () => {
      const manager = createFloatingObjectManager(mockColumns);

      const float1 = createMockImageBlock({
        id: 'float-1',
        wrap: { type: 'TopAndBottom' },
      });

      const float2 = createMockImageBlock({
        id: 'float-2',
        wrap: { type: 'TopAndBottom' },
      });

      manager.registerDrawing(float1, createMockMeasure(), 100, 0, 1);
      manager.registerDrawing(float2, createMockMeasure(), 100, 0, 1);

      const result = manager.computeAvailableWidth(120, 20, 600, 0, 1);

      expect(result.width).toBe(600);
      expect(result.offsetX).toBe(0);
    });
  });

  describe('setLayoutContext', () => {
    it('updates column context for wrapping calculations', () => {
      const initialColumns = { width: 400, gap: 20, count: 1 };
      const manager = createFloatingObjectManager(initialColumns, { left: 50, right: 50 }, 500);

      // Register an image with initial context
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          alignH: 'left',
          offsetH: 0,
          offsetV: 0,
        },
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      // Initial wrapping calculation
      const initialResult = manager.computeAvailableWidth(120, 20, 400, 0, 1);
      expect(initialResult.width).toBe(400 - 200 - 10); // 190
      expect(initialResult.offsetX).toBe(210); // 200 + 10

      // Update context to multi-column layout
      const newColumns = { width: 200, gap: 24, count: 2 };
      manager.setLayoutContext(newColumns, { left: 36, right: 36 }, 612);

      // Register another image with new context
      const imageBlock2 = createMockImageBlock({
        id: 'test-image-2',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          alignH: 'left',
          offsetH: 0,
          offsetV: 0,
        },
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      });

      manager.registerDrawing(imageBlock2, createMockMeasure(), 200, 1, 1);

      // New wrapping calculation should use updated column width
      const newResult = manager.computeAvailableWidth(220, 20, 200, 1, 1);
      // Column 1 boundary calculation uses new margins
      expect(newResult.width).toBeLessThanOrEqual(200);
    });

    it('updates margins for positioning calculations', () => {
      const initialMargins = { left: 72, right: 72 };
      const initialColumns = { width: 468, gap: 0, count: 1 };
      const manager = createFloatingObjectManager(initialColumns, initialMargins, 612);

      // Register image with margin-relative positioning
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'margin',
          alignH: 'left',
          offsetH: 0,
          offsetV: 0,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const zones = manager.getAllFloatsForPage(1);
      expect(zones[0].bounds.x).toBe(72); // Initial left margin

      // Update context with narrower margins
      const newMargins = { left: 36, right: 36 };
      const newColumns = { width: 540, gap: 0, count: 1 };
      manager.setLayoutContext(newColumns, newMargins, 612);

      // Register new image with updated context
      const imageBlock2 = createMockImageBlock({
        id: 'test-image-2',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'margin',
          alignH: 'left',
          offsetH: 0,
          offsetV: 0,
        },
      });

      manager.registerDrawing(imageBlock2, createMockMeasure(), 200, 0, 1);

      const newZones = manager.getAllFloatsForPage(1);
      const newImageZone = newZones.find((z) => z.imageBlockId === 'test-image-2');
      expect(newImageZone?.bounds.x).toBe(36); // Updated left margin
    });

    it('updates page width for page-relative positioning', () => {
      const initialColumns = { width: 468, gap: 0, count: 1 };
      const manager = createFloatingObjectManager(initialColumns, { left: 72, right: 72 }, 612);

      // Register image with page-relative positioning (origin at physical page edge)
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
          alignH: 'right',
          offsetH: 0,
          offsetV: 0,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 0, 1);

      const zones = manager.getAllFloatsForPage(1);
      // Right-aligned relative to the page edge: 0 + 612 - 200 = 412
      expect(zones[0].bounds.x).toBe(412);

      // Update to A4 page size
      const newColumns = { width: 698, gap: 0, count: 1 };
      manager.setLayoutContext(newColumns, { left: 72, right: 72 }, 842);

      const imageBlock2 = createMockImageBlock({
        id: 'test-image-2',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
          alignH: 'right',
          offsetH: 0,
          offsetV: 0,
        },
      });

      manager.registerDrawing(imageBlock2, createMockMeasure(), 200, 0, 1);

      const newZones = manager.getAllFloatsForPage(1);
      const newImageZone = newZones.find((z) => z.imageBlockId === 'test-image-2');
      // Right-aligned relative to the new page width: 0 + 842 - 200 = 642
      expect(newImageZone?.bounds.x).toBe(642);
    });

    it('handles context update for multi-column to single-column transition', () => {
      const initialColumns = { width: 234, gap: 48, count: 2 };
      const manager = createFloatingObjectManager(initialColumns, { left: 36, right: 36 }, 612);

      // Register image in column 1
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          alignH: 'left',
          offsetH: 0,
          offsetV: 0,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 1, 1);

      const zones = manager.getAllFloatsForPage(1);
      // Column 1 starts at: marginLeft + columnIndex * (width + gap) = 36 + 1 * (234 + 48) = 318
      expect(zones[0].bounds.x).toBe(318);

      // Transition to single column with wider margins
      const newColumns = { width: 468, gap: 0, count: 1 };
      manager.setLayoutContext(newColumns, { left: 72, right: 72 }, 612);

      const imageBlock2 = createMockImageBlock({
        id: 'test-image-2',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          alignH: 'left',
          offsetH: 0,
          offsetV: 0,
        },
      });

      manager.registerDrawing(imageBlock2, createMockMeasure(), 200, 0, 1);

      const newZones = manager.getAllFloatsForPage(1);
      const newImageZone = newZones.find((z) => z.imageBlockId === 'test-image-2');
      // Single column starts at left margin: 72
      expect(newImageZone?.bounds.x).toBe(72);
    });

    it('correctly computes wrapping with updated column gap', () => {
      const initialColumns = { width: 200, gap: 20, count: 2 };
      const manager = createFloatingObjectManager(initialColumns, { left: 50, right: 50 }, 500);

      // Update to wider gap
      const newColumns = { width: 200, gap: 40, count: 2 };
      manager.setLayoutContext(newColumns, { left: 50, right: 50 }, 500);

      // Register image in second column
      const imageBlock = createMockImageBlock({
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          alignH: 'left',
          offsetH: 0,
          offsetV: 0,
        },
        wrap: {
          type: 'Square',
          wrapText: 'right',
          distLeft: 0,
          distRight: 10,
        },
      });

      manager.registerDrawing(imageBlock, createMockMeasure(), 100, 1, 1);

      // The image is positioned at the start of column 1: 50 + 1 * (200 + 40) = 290
      // For text in column 1, the offsetX is column-relative (not absolute)
      // So the offsetX from the column start = image width + distances = 200 + 10 = 210
      const result = manager.computeAvailableWidth(120, 20, 200, 1, 1);

      // The image blocks text, reducing available width
      expect(result.width).toBeLessThanOrEqual(200);
      expect(result.offsetX).toBeGreaterThanOrEqual(0);
    });

    it('preserves existing floats when context is updated', () => {
      const initialColumns = { width: 400, gap: 0, count: 1 };
      const manager = createFloatingObjectManager(initialColumns, { left: 50, right: 50 }, 500);

      // Register two images before context update
      const imageBlock1 = createMockImageBlock({ id: 'image-1' });
      const imageBlock2 = createMockImageBlock({ id: 'image-2' });

      manager.registerDrawing(imageBlock1, createMockMeasure(), 100, 0, 1);
      manager.registerDrawing(imageBlock2, createMockMeasure(), 200, 0, 1);

      expect(manager.getAllFloatsForPage(1)).toHaveLength(2);

      // Update context
      const newColumns = { width: 500, gap: 0, count: 1 };
      manager.setLayoutContext(newColumns, { left: 40, right: 40 }, 600);

      // Existing floats should still be present
      expect(manager.getAllFloatsForPage(1)).toHaveLength(2);

      // New float should use updated context
      const imageBlock3 = createMockImageBlock({ id: 'image-3' });
      manager.registerDrawing(imageBlock3, createMockMeasure(), 300, 0, 1);

      expect(manager.getAllFloatsForPage(1)).toHaveLength(3);
    });
  });
});
