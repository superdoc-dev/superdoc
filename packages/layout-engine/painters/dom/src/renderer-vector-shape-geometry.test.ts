/**
 * Tests for vector shape rendering with effect extents
 *
 * Specifically tests the fix for horizontal rules where fragment.geometry
 * differs from block.geometry. The getEffectExtentMetrics function must use
 * the passed geometry parameter, not always block.geometry.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout, DrawingGeometry } from '@superdoc/contracts';

describe('DomPainter vector shape geometry', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  describe('effect extent metrics with different geometries', () => {
    it('should use fragment geometry instead of block geometry for effect extent calculations', () => {
      // Block has one geometry (e.g., the original shape dimensions)
      const blockGeometry: DrawingGeometry = {
        width: 200,
        height: 100,
        rotation: 0,
        flipH: false,
        flipV: false,
      };

      // Fragment has different geometry (e.g., after layout scaling for horizontal rules)
      const fragmentGeometry: DrawingGeometry = {
        width: 400,
        height: 50,
        rotation: 0,
        flipH: false,
        flipV: false,
      };

      // Effect extent that will be subtracted from the geometry
      const effectExtent = { left: 10, top: 5, right: 10, bottom: 5 };

      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'hr-drawing-1',
        drawingKind: 'vectorShape',
        geometry: blockGeometry,
        shapeKind: 'rect',
        effectExtent,
        fillColor: '#000000',
      };

      const drawingMeasure: Measure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: fragmentGeometry.width,
        height: fragmentGeometry.height,
        scale: 1,
        naturalWidth: blockGeometry.width,
        naturalHeight: blockGeometry.height,
        geometry: fragmentGeometry,
      };

      const layout: Layout = {
        pageSize: { w: 600, h: 800 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'drawing',
                blockId: drawingBlock.id,
                drawingKind: 'vectorShape',
                x: 50,
                y: 100,
                width: fragmentGeometry.width,
                height: fragmentGeometry.height,
                geometry: fragmentGeometry, // This differs from block.geometry
                scale: 1,
                isAnchored: false,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({
        blocks: [drawingBlock],
        measures: [drawingMeasure],
      });

      painter.paint(layout, mount);

      // Find the vector shape container
      const vectorShape = mount.querySelector('.superdoc-vector-shape') as HTMLElement;
      expect(vectorShape).toBeTruthy();

      // Find the content container (first child div with absolute positioning)
      const contentContainer = vectorShape.querySelector('div[style*="position: absolute"]') as HTMLElement;
      expect(contentContainer).toBeTruthy();

      // The content container dimensions should be based on fragment.geometry (400x50),
      // NOT block.geometry (200x100)
      // innerWidth = fragmentGeometry.width - left - right = 400 - 10 - 10 = 380
      // innerHeight = fragmentGeometry.height - top - bottom = 50 - 5 - 5 = 40
      expect(contentContainer.style.width).toBe('380px');
      expect(contentContainer.style.height).toBe('40px');

      // Verify offset positions from effect extent
      expect(contentContainer.style.left).toBe('10px');
      expect(contentContainer.style.top).toBe('5px');
    });

    it('should fall back to block geometry when fragment geometry is not provided', () => {
      const blockGeometry: DrawingGeometry = {
        width: 200,
        height: 100,
        rotation: 0,
        flipH: false,
        flipV: false,
      };

      const effectExtent = { left: 5, top: 5, right: 5, bottom: 5 };

      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'shape-fallback-1',
        drawingKind: 'vectorShape',
        geometry: blockGeometry,
        shapeKind: 'rect',
        effectExtent,
        fillColor: '#FF0000',
      };

      const drawingMeasure: Measure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: blockGeometry.width,
        height: blockGeometry.height,
        scale: 1,
        naturalWidth: blockGeometry.width,
        naturalHeight: blockGeometry.height,
        geometry: blockGeometry,
      };

      const layout: Layout = {
        pageSize: { w: 600, h: 800 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'drawing',
                blockId: drawingBlock.id,
                drawingKind: 'vectorShape',
                x: 50,
                y: 100,
                width: blockGeometry.width,
                height: blockGeometry.height,
                geometry: blockGeometry, // Same as block.geometry
                scale: 1,
                isAnchored: false,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({
        blocks: [drawingBlock],
        measures: [drawingMeasure],
      });

      painter.paint(layout, mount);

      const vectorShape = mount.querySelector('.superdoc-vector-shape') as HTMLElement;
      expect(vectorShape).toBeTruthy();

      const contentContainer = vectorShape.querySelector('div[style*="position: absolute"]') as HTMLElement;
      expect(contentContainer).toBeTruthy();

      // innerWidth = 200 - 5 - 5 = 190
      // innerHeight = 100 - 5 - 5 = 90
      expect(contentContainer.style.width).toBe('190px');
      expect(contentContainer.style.height).toBe('90px');
    });

    it('should handle vector shape without effect extent', () => {
      const geometry: DrawingGeometry = {
        width: 150,
        height: 75,
        rotation: 0,
        flipH: false,
        flipV: false,
      };

      const drawingBlock: FlowBlock = {
        kind: 'drawing',
        id: 'shape-no-extent',
        drawingKind: 'vectorShape',
        geometry,
        shapeKind: 'rect',
        fillColor: '#0000FF',
        // No effectExtent
      };

      const drawingMeasure: Measure = {
        kind: 'drawing',
        drawingKind: 'vectorShape',
        width: geometry.width,
        height: geometry.height,
        scale: 1,
        naturalWidth: geometry.width,
        naturalHeight: geometry.height,
        geometry,
      };

      const layout: Layout = {
        pageSize: { w: 600, h: 800 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'drawing',
                blockId: drawingBlock.id,
                drawingKind: 'vectorShape',
                x: 50,
                y: 100,
                width: geometry.width,
                height: geometry.height,
                geometry,
                scale: 1,
                isAnchored: false,
              },
            ],
          },
        ],
      };

      const painter = createDomPainter({
        blocks: [drawingBlock],
        measures: [drawingMeasure],
      });

      painter.paint(layout, mount);

      const vectorShape = mount.querySelector('.superdoc-vector-shape') as HTMLElement;
      expect(vectorShape).toBeTruthy();

      const contentContainer = vectorShape.querySelector('div[style*="position: absolute"]') as HTMLElement;
      expect(contentContainer).toBeTruthy();

      // Without effect extent, dimensions should equal geometry dimensions
      expect(contentContainer.style.width).toBe('150px');
      expect(contentContainer.style.height).toBe('75px');
      expect(contentContainer.style.left).toBe('0px');
      expect(contentContainer.style.top).toBe('0px');
    });
  });
});
