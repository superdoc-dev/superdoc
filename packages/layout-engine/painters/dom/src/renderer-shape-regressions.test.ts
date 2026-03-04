import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { DrawingGeometry, FlowBlock, Layout, Measure, SolidFillWithAlpha } from '@superdoc/contracts';

type DrawingFlowBlock = Extract<FlowBlock, { kind: 'drawing' }>;

function createDrawingFixtures(block: DrawingFlowBlock): { blocks: FlowBlock[]; measures: Measure[]; layout: Layout } {
  const geometry = block.geometry;
  const measure: Measure = {
    kind: 'drawing',
    drawingKind: block.drawingKind,
    width: geometry.width,
    height: geometry.height,
    scale: 1,
    naturalWidth: geometry.width,
    naturalHeight: geometry.height,
    geometry,
    groupTransform: block.drawingKind === 'shapeGroup' ? block.groupTransform : undefined,
  };

  const layout: Layout = {
    pageSize: { w: 600, h: 800 },
    pages: [
      {
        number: 1,
        fragments: [
          {
            kind: 'drawing',
            blockId: block.id,
            drawingKind: block.drawingKind,
            x: 20,
            y: 20,
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

  return {
    blocks: [block],
    measures: [measure],
    layout,
  };
}

describe('DomPainter shape regressions', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  it('prefers custom geometry paths over preset lookups when both are present', () => {
    const geometry: DrawingGeometry = { width: 120, height: 120, rotation: 0, flipH: false, flipV: false };
    const customPath = 'M 0 100 L 50 0 L 100 100 Z';

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'custom-over-preset',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'rect',
      customGeometry: {
        paths: [{ d: customPath, w: 100, h: 100 }],
      },
      fillColor: '#0EA5E9',
      strokeColor: '#0F172A',
      strokeWidth: 1,
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const renderedPath = mount.querySelector(`.superdoc-vector-shape svg path[d="${customPath}"]`);
    expect(renderedPath).toBeTruthy();
  });

  it('keeps custom-geometry object fills paintable for solidWithAlpha fills', () => {
    const geometry: DrawingGeometry = { width: 120, height: 120, rotation: 0, flipH: false, flipV: false };
    const alphaFill: SolidFillWithAlpha = { type: 'solidWithAlpha', color: '#22C55E', alpha: 0.4 };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'custom-geometry-solid-alpha',
      drawingKind: 'vectorShape',
      geometry,
      customGeometry: {
        paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z', w: 100, h: 100 }],
      },
      fillColor: alphaFill,
      strokeColor: null,
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const path = mount.querySelector('.superdoc-vector-shape svg path') as SVGPathElement | null;
    expect(path).toBeTruthy();
    expect(path?.getAttribute('fill')).toBe(alphaFill.color);
    expect(path?.getAttribute('fill-opacity')).toBe(String(alphaFill.alpha));
  });

  it('does not inverse-scale shape-group text when child geometry is already pre-scaled', () => {
    const geometry: DrawingGeometry = { width: 200, height: 100, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-text-no-inverse-scale',
      drawingKind: 'shapeGroup',
      geometry,
      groupTransform: {
        width: 200,
        height: 100,
        childWidth: 100,
        childHeight: 50,
      },
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            kind: 'rect',
            fillColor: '#E2E8F0',
            textAlign: 'left',
            textContent: {
              parts: [{ text: 'Grouped text' }],
            },
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const textOverlay = mount.querySelector(
      '.superdoc-shape-group .superdoc-vector-shape div[style*="display: flex"]',
    ) as HTMLElement | null;
    expect(textOverlay).toBeTruthy();
    expect(textOverlay?.style.transform).toBe('');
    expect(textOverlay?.style.width).toBe('100%');
    expect(textOverlay?.style.height).toBe('100%');
  });
});
