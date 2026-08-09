import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createTestPainter as createDomPainter } from './_test-utils.js';
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

  it('clips a stretched picture fill through the authored preset geometry', () => {
    const geometry: DrawingGeometry = { width: 230, height: 230, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'sd-658-picture-filled-ellipse',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'ellipse',
      imageFill: {
        src: 'data:image/jpeg;base64,DOCTOR',
        mode: 'stretch',
        sourceRect: { left: 15000, top: 5000, right: 10000, bottom: 0 },
        rotateWithShape: true,
      },
      strokeColor: '#5B9BD5',
      strokeWidth: 6.67,
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const ellipse = mount.querySelector(
      '.superdoc-vector-shape svg > path, .superdoc-vector-shape svg > ellipse',
    ) as SVGElement | null;
    const image = mount.querySelector('.superdoc-vector-shape svg defs pattern image') as SVGImageElement | null;
    expect(ellipse?.getAttribute('fill')).toMatch(/^url\(#superdoc-shape-image-fill-/);
    expect(image?.getAttribute('href')).toBe('data:image/jpeg;base64,DOCTOR');
    expect(Number(image?.getAttribute('x'))).toBeCloseTo(-0.2);
    expect(Number(image?.getAttribute('y'))).toBeCloseTo(-0.05263157894736842);
    expect(Number(image?.getAttribute('width'))).toBeCloseTo(1.3333333333333333);
    expect(Number(image?.getAttribute('height'))).toBeCloseTo(1.0526315789473684);
    expect(image?.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('tiles a picture fill from its scaled, centered DrawingML tile rectangle', () => {
    const geometry: DrawingGeometry = { width: 230, height: 230, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'sd-658-tiled-ellipse',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'ellipse',
      imageFill: {
        src: 'data:image/jpeg;base64,DOCTOR',
        mode: 'tile',
        tile: { scaleX: 50000, scaleY: 50000, flip: 'none', alignment: 'ctr' },
      },
      strokeColor: '#5B9BD5',
      strokeWidth: 6.67,
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const pattern = mount.querySelector('.superdoc-vector-shape svg defs pattern') as SVGPatternElement | null;
    const image = pattern?.querySelector('image');
    expect(pattern?.getAttribute('x')).toBe('0.25');
    expect(pattern?.getAttribute('y')).toBe('0.25');
    expect(pattern?.getAttribute('width')).toBe('0.5');
    expect(pattern?.getAttribute('height')).toBe('0.5');
    expect(image?.getAttribute('x')).toBe('0');
    expect(image?.getAttribute('y')).toBe('0');
    expect(image?.getAttribute('width')).toBe('0.5');
    expect(image?.getAttribute('height')).toBe('0.5');
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
    expect(path?.hasAttribute('stroke')).toBe(false);
  });

  it("paints Word's default textbox hairline when the adapter resolves an authored zero-width line", () => {
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'word-default-textbox-hairline',
      drawingKind: 'textboxShape',
      geometry: { width: 144, height: 48, rotation: 0, flipH: false, flipV: false },
      shapeKind: 'rect',
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 1,
      contentBlocks: [
        {
          kind: 'paragraph',
          id: 'word-default-textbox-hairline-paragraph',
          runs: [{ text: 'Just text in a text box' }],
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const outline = mount.querySelector('.superdoc-textbox-shape svg [stroke]') as SVGElement | null;
    expect(outline?.getAttribute('stroke')).toBe('#000000');
    expect(outline?.getAttribute('stroke-width')).toBe('1');
  });

  it('paints a zero-height footer connector at its full stroke weight inside effect extents', () => {
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'footer-connector',
      drawingKind: 'vectorShape',
      geometry: { width: 703, height: 8, rotation: 0, flipH: false, flipV: false },
      effectExtent: { left: 3, top: 3, right: 5, bottom: 4 },
      shapeKind: 'line',
      strokeColor: '#7CE0D3',
      strokeWidth: 6,
      attrs: { inlineBackgroundColor: '#E6E6E6' },
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const line = mount.querySelector('.superdoc-vector-shape svg line') as SVGLineElement | null;
    const svg = line?.ownerSVGElement;
    const content = svg?.parentElement as HTMLElement | null;
    expect(line?.getAttribute('x1')).toBe('0');
    expect(line?.getAttribute('x2')).toBe('695');
    expect(line?.getAttribute('y1')).toBe('0.5');
    expect(line?.getAttribute('y2')).toBe('0.5');
    expect(line?.getAttribute('stroke-width')).toBe('6');
    expect(svg?.style.overflow).toBe('visible');
    expect(content?.style.left).toBe('3px');
    expect(content?.style.top).toBe('3px');
    expect(content?.style.width).toBe('695px');
    expect(content?.style.height).toBe('1px');
    const fragment = mount.querySelector('.superdoc-drawing-fragment') as HTMLElement | null;
    expect(fragment?.style.backgroundColor).toBe('#E6E6E6');
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
    expect(textOverlay?.style.lineHeight).toBe('normal');
  });

  it('paints zero-axis VML group lines through a physical one-pixel viewport', () => {
    const geometry: DrawingGeometry = { width: 200, height: 100, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-zero-axis-lines',
      drawingKind: 'shapeGroup',
      geometry,
      groupTransform: { width: 200, height: 100, childWidth: 200, childHeight: 100 },
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 10,
            y: 20,
            width: 160,
            height: 0,
            kind: 'line',
            fillColor: null,
            strokeColor: '#000000',
            strokeWidth: 0.56,
          },
        },
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 30,
            y: 10,
            width: 0,
            height: 70,
            kind: 'line',
            fillColor: null,
            strokeColor: '#000000',
            strokeWidth: 0.56,
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const children = mount.querySelectorAll<HTMLElement>('.superdoc-shape-group__child');
    const lines = mount.querySelectorAll<SVGLineElement>('.superdoc-shape-group svg line');
    const svgs = mount.querySelectorAll<SVGSVGElement>('.superdoc-shape-group svg');
    expect(children[0]?.style.height).toBe('1px');
    expect(children[1]?.style.width).toBe('1px');
    expect(svgs[0]?.getAttribute('height')).toBe('100%');
    expect(svgs[1]?.getAttribute('width')).toBe('100%');
    expect(lines[0]?.getAttribute('y1')).toBe('0.5');
    expect(lines[0]?.getAttribute('y2')).toBe('0.5');
    expect(lines[1]?.getAttribute('x1')).toBe('0.5');
    expect(lines[1]?.getAttribute('x2')).toBe('0.5');
    expect(lines[0]?.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(lines[1]?.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(lines[0]?.getAttribute('stroke-width')).toBe('1');
    expect(lines[1]?.getAttribute('stroke-width')).toBe('1');
  });

  it('preserves authored paragraph geometry in flattened shape-group text', () => {
    const geometry: DrawingGeometry = { width: 200, height: 100, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-paragraph-geometry',
      drawingKind: 'shapeGroup',
      geometry,
      groupTransform: { width: 200, height: 100, childWidth: 200, childHeight: 100 },
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            kind: 'rect',
            fillColor: null,
            strokeColor: null,
            textAlign: 'left',
            textContent: {
              parts: [
                {
                  text: 'First',
                  formatting: { fontSize: 8, letterSpacing: -0.1 },
                  paragraphProperties: { spacingBefore: 2, leftIndent: 3 },
                },
                { text: '', isLineBreak: true },
                {
                  text: 'Second',
                  paragraphProperties: {
                    horizontalAlign: 'right',
                    spacingBefore: 3.2,
                    line: 1.25,
                    lineUnit: 'multiplier',
                    firstLineIndent: -1,
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const paragraphs = mount.querySelectorAll(
      '.superdoc-shape-group .superdoc-vector-shape div[style*="font-size"] > div',
    );
    const first = paragraphs[0] as HTMLElement | undefined;
    const second = paragraphs[1] as HTMLElement | undefined;
    expect(first?.style.marginTop).toBe('2px');
    expect(first?.style.paddingLeft).toBe('3px');
    expect(second?.style.textAlign).toBe('right');
    expect(second?.style.marginTop).toBe('3.2px');
    expect(second?.style.lineHeight).toBe('1.25');
    expect(second?.style.textIndent).toBe('-1px');
    const firstRun = first?.querySelector('span') as HTMLElement | null;
    expect(firstRun?.style.letterSpacing).toBe('-0.1px');
  });

  it('allows wrap-none shape text to paint past its authored box', () => {
    const geometry: DrawingGeometry = { width: 80, height: 40, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-text-wrap-none',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'rect',
      fillColor: null,
      strokeColor: null,
      textAlign: 'left',
      textLayout: { wrap: 'none', horizontalOverflow: 'overflow', verticalOverflow: 'overflow' },
      textContent: {
        parts: [{ text: 'This text is wider than the shape', formatting: { fontSize: 14 } }],
      },
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const shape = mount.querySelector('.superdoc-vector-shape') as HTMLElement | null;
    const overlay = shape?.querySelector('div[style*="white-space"]') as HTMLElement | null;
    const paragraph = overlay?.querySelector('div') as HTMLElement | null;
    expect(shape?.style.overflow).toBe('visible');
    expect(overlay?.style.whiteSpace).toBe('nowrap');
    expect(paragraph?.style.whiteSpace).toBe('nowrap');
  });

  it('rotates and fits top-level WordArt textboxes with the shared drawing wrapper', () => {
    const geometry: DrawingGeometry = { width: 240, height: 80, rotation: 320, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'wordart-rotation',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'rect',
      fillColor: null,
      strokeColor: null,
      textAlign: 'center',
      textContent: {
        parts: [
          {
            text: 'AUTE',
            formatting: {
              fontFamily: 'Arial',
              fontSize: 24,
              color: 'C0C0C0',
            },
          },
        ],
      },
      attrs: { isWordArt: true, isTextBox: true },
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const drawingInner = mount.querySelector('.superdoc-drawing-inner') as HTMLElement | null;
    const wordArtSvg = mount.querySelector('.superdoc-wordart-text') as SVGSVGElement | null;
    const wordArtText = mount.querySelector('.superdoc-wordart-text text') as SVGTextElement | null;

    expect(drawingInner).toBeTruthy();
    expect(drawingInner?.style.transform).toContain('rotate(320deg)');
    expect(wordArtSvg).toBeTruthy();
    expect(wordArtText).toBeTruthy();
    expect(wordArtText?.textContent).toContain('AUTE');
    expect(wordArtText?.getAttribute('textLength')).toBe('240');
    expect(wordArtText?.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
    expect(Number(wordArtText?.getAttribute('font-size'))).toBeGreaterThan(24);
  });
});
