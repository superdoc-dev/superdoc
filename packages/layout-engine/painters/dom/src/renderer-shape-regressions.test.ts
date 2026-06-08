import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestPainter as createDomPainter } from './_test-utils.js';
import { getPresetShapeSvg } from '@superdoc/preset-geometry';
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
    expect(renderedPath?.getAttribute('vector-effect')).toBeNull();
  });

  it('generates rightArrow preset geometry with Word-compatible default head proportions', () => {
    const width = 773430;
    const height = 394970;
    const svgMarkup = getPresetShapeSvg({ preset: 'rightArrow', width, height });
    const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
    const path = doc.querySelector('path');

    expect(doc.querySelector('svg')?.getAttribute('viewBox')).toBe(`0 0 ${width} ${height}`);
    expect(path?.getAttribute('d')).toBe(
      'M 0 98742.5 L 575945 98742.5 L 575945 0 L 773430 197485 L 575945 394970 L 575945 296227.5 L 0 296227.5 Z',
    );
  });

  it.each([
    {
      preset: 'bentArrow',
      width: 588010,
      height: 648335,
      expectedStart: 'M 0 648335 L 0 330756 C 0 188679 115177 73502 257254 73502',
    },
    {
      preset: 'bentUpArrow',
      width: 850265,
      height: 731520,
      expectedStart: 'M 0 548640 L 575945 548640 L 575945 182880',
    },
    {
      preset: 'downArrow',
      width: 394970,
      height: 576580,
      expectedStart: 'M 0 379095 L 98743 379095 L 98743 0',
    },
    {
      preset: 'leftArrow',
      width: 662549,
      height: 367128,
      expectedStart: 'M 0 183564 L 183564 0 L 183564 91782',
    },
    {
      preset: 'leftRightArrow',
      width: 985520,
      height: 379730,
      expectedStart: 'M 0 189865 L 189865 0 L 189865 94933',
    },
    {
      preset: 'leftRightUpArrow',
      width: 928370,
      height: 634365,
      expectedStart: 'M 0 475774 L 158591 317183 L 158591 396478',
    },
    {
      preset: 'leftUpArrow',
      width: 850265,
      height: 850265,
      expectedStart: 'M 0 637699 L 212566 425133 L 212566 531416',
    },
    {
      preset: 'quadArrow',
      width: 788670,
      height: 831215,
      expectedStart: 'M 0 415608 L 177451 238157 L 177451 326882',
    },
    {
      preset: 'upArrow',
      width: 367127,
      height: 550008,
      expectedStart: 'M 0 183564 L 183564 0 L 367127 183564',
    },
    {
      preset: 'upDownArrow',
      width: 296545,
      height: 746760,
      expectedStart: 'M 0 148273 L 148273 0 L 296545 148273',
    },
    {
      preset: 'uturnArrow',
      width: 886460,
      height: 661035,
      expectedStart: 'M 0 661035 L 0 289203 C 0 129481 129481 0 289203 0',
    },
  ])('uses Word-expanded XML geometry for $preset', ({ preset, width, height, expectedStart }) => {
    const svgMarkup = getPresetShapeSvg({ preset, width, height });
    const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    const path = doc.querySelector('path');

    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${width} ${height}`);
    expect(path?.getAttribute('d')).toContain(expectedStart);
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

  it('keeps explicit custom-geometry strokes visible for EMU-sized coordinate spaces', () => {
    const geometry: DrawingGeometry = { width: 84, height: 45, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'custom-geometry-emu-stroke',
      drawingKind: 'vectorShape',
      geometry,
      customGeometry: {
        paths: [
          {
            d: 'M 0 98743 L 575945 98743 L 575945 0 L 773430 197485 L 575945 394970 L 575945 296228 L 0 296228 Z',
            w: 773430,
            h: 394970,
          },
        ],
      },
      fillColor: '#5B9BD5',
      strokeColor: '#0E1720',
      strokeWidth: 1,
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const path = mount.querySelector('.superdoc-vector-shape svg path') as SVGPathElement | null;
    expect(path?.getAttribute('stroke-width')).toBe('1');
    expect(path?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
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

  it('paints grouped picture shape masks separately from source crop clipping', () => {
    const geometry: DrawingGeometry = { width: 120, height: 120, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-image-mask-and-crop',
      drawingKind: 'shapeGroup',
      geometry,
      shapes: [
        {
          shapeType: 'image',
          attrs: {
            x: 10,
            y: 12,
            width: 80,
            height: 80,
            src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
            clipPath: 'inset(0.589% 0% 0.589% 0%)',
            shapeClipPath: 'ellipse(50% 50% at 50% 50%)',
            objectFit: 'fill',
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const childWrapper = mount.querySelector('.superdoc-shape-group__child') as HTMLElement | null;
    const clipContainer = childWrapper?.firstElementChild as HTMLElement | null;
    const img = clipContainer?.querySelector('img') as HTMLImageElement | null;

    expect(clipContainer?.style.clipPath).toBe('ellipse(50% 50% at 50% 50%)');
    expect(clipContainer?.style.overflow).toBe('hidden');
    expect(img?.style.clipPath).toBe('inset(0.589% 0% 0.589% 0%)');
    expect(img?.style.objectFit).toBe('fill');
    expect(img?.style.width).toBe('100%');
    expect(img?.style.height).toBe('100%');
    expect(img?.style.transform).toContain('scale');
  });

  it('adds stroke paint room for outlined ellipse children in shape groups', () => {
    const geometry: DrawingGeometry = { width: 120, height: 120, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-ellipse-stroke-room',
      drawingKind: 'shapeGroup',
      geometry,
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            kind: 'ellipse',
            fillColor: null,
            strokeColor: '#0F172A',
            strokeWidth: 4,
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const childWrapper = mount.querySelector('.superdoc-shape-group__child') as HTMLElement | null;
    expect(childWrapper).toBeTruthy();
    expect(childWrapper?.style.left).toBe('-2px');
    expect(childWrapper?.style.top).toBe('-2px');
    expect(childWrapper?.style.width).toBe('104px');
    expect(childWrapper?.style.height).toBe('104px');

    const contentContainer = childWrapper?.querySelector(
      '.superdoc-vector-shape > div[style*="position: absolute"]',
    ) as HTMLElement | null;
    expect(contentContainer).toBeTruthy();
    expect(contentContainer?.style.left).toBe('2px');
    expect(contentContainer?.style.top).toBe('2px');
    expect(contentContainer?.style.width).toBe('100px');
    expect(contentContainer?.style.height).toBe('100px');

    const svg = childWrapper?.querySelector('.superdoc-vector-shape svg') as SVGSVGElement | null;
    expect(svg).toBeTruthy();
    expect(svg?.style.overflow).toBe('visible');
  });

  it('coerces grouped child stroke width consistently when it is a numeric string', () => {
    const geometry: DrawingGeometry = { width: 120, height: 120, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-string-stroke-room',
      drawingKind: 'shapeGroup',
      geometry,
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            kind: 'ellipse',
            fillColor: null,
            strokeColor: '#0F172A',
            strokeWidth: '4' as unknown as number,
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const childWrapper = mount.querySelector('.superdoc-shape-group__child') as HTMLElement | null;
    expect(childWrapper).toBeTruthy();
    expect(childWrapper?.style.left).toBe('-2px');
    expect(childWrapper?.style.top).toBe('-2px');
    expect(childWrapper?.style.width).toBe('104px');
    expect(childWrapper?.style.height).toBe('104px');
  });

  it('insets shape group content by group effect extent so edge strokes fit inside the drawing fragment', () => {
    const geometry: DrawingGeometry = { width: 100, height: 104, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-edge-stroke-effect-room',
      drawingKind: 'shapeGroup',
      geometry,
      effectExtent: { left: 0, top: 2, right: 0, bottom: 2 },
      groupTransform: {
        width: 100,
        height: 100,
        childWidth: 100,
        childHeight: 100,
      },
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 10,
            y: 0,
            width: 50,
            height: 50,
            kind: 'ellipse',
            fillColor: null,
            strokeColor: '#0F172A',
            strokeWidth: 4,
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const drawingFragment = mount.querySelector('.superdoc-drawing-fragment') as HTMLElement | null;
    expect(drawingFragment).toBeTruthy();
    expect(drawingFragment?.style.height).toBe('104px');

    const groupContent = mount.querySelector('.superdoc-shape-group > div') as HTMLElement | null;
    expect(groupContent).toBeTruthy();
    expect(groupContent?.style.top).toBe('2px');
    expect(groupContent?.style.width).toBe('100px');
    expect(groupContent?.style.height).toBe('100px');

    const childWrapper = groupContent?.querySelector('.superdoc-shape-group__child') as HTMLElement | null;
    expect(childWrapper).toBeTruthy();
    expect(childWrapper?.style.top).toBe('-2px');
    expect(childWrapper?.style.height).toBe('54px');
  });

  it('does not add grouped child paint room when stroke is disabled', () => {
    const geometry: DrawingGeometry = { width: 120, height: 120, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-no-stroke-no-paint-room',
      drawingKind: 'shapeGroup',
      geometry,
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 8,
            y: 10,
            width: 90,
            height: 70,
            kind: 'ellipse',
            fillColor: '#E2E8F0',
            strokeColor: null,
            strokeWidth: 4,
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const childWrapper = mount.querySelector('.superdoc-shape-group__child') as HTMLElement | null;
    expect(childWrapper).toBeTruthy();
    expect(childWrapper?.style.left).toBe('8px');
    expect(childWrapper?.style.top).toBe('10px');
    expect(childWrapper?.style.width).toBe('90px');
    expect(childWrapper?.style.height).toBe('70px');
  });

  it('preserves grouped connector marker sizing when line ends are present', () => {
    const geometry: DrawingGeometry = { width: 120, height: 120, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'shape-group-line-end-marker-size',
      drawingKind: 'shapeGroup',
      geometry,
      shapes: [
        {
          shapeType: 'vectorShape',
          attrs: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            kind: 'line',
            fillColor: null,
            strokeColor: '#0F172A',
            strokeWidth: 4,
            lineEnds: {
              head: { type: 'triangle' },
            },
          },
        },
      ],
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const childWrapper = mount.querySelector('.superdoc-shape-group__child') as HTMLElement | null;
    expect(childWrapper).toBeTruthy();
    expect(childWrapper?.style.left).toBe('0px');
    expect(childWrapper?.style.top).toBe('0px');
    expect(childWrapper?.style.width).toBe('100px');
    expect(childWrapper?.style.height).toBe('100px');

    const marker = childWrapper?.querySelector('marker') as SVGMarkerElement | null;
    expect(marker).toBeTruthy();
    expect(marker?.getAttribute('markerUnits')).toBe('strokeWidth');
    expect(marker?.getAttribute('markerWidth')).toBe('4');
    expect(marker?.getAttribute('markerHeight')).toBe('4');
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

  it('paints shape textbox paragraph spacing as wrapper margins', () => {
    const geometry: DrawingGeometry = { width: 200, height: 80, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'textbox-spacing',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'rect',
      fillColor: null,
      strokeColor: null,
      textContent: {
        parts: [{ text: 'First' }, { text: '\n', isLineBreak: true, isParagraphBoundary: true }, { text: 'Second' }],
        paragraphs: [{ spacing: { before: 24, after: 5.333 } }, {}],
      },
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const textOverlay = mount.querySelector('.superdoc-vector-shape div[style*="display: flex"]') as HTMLElement | null;
    expect(textOverlay).toBeTruthy();

    const wrappers = Array.from(textOverlay!.children) as HTMLElement[];
    expect(wrappers[0].style.marginTop).toBe('24px');
    expect(wrappers[0].style.marginBottom).toBe('5.333px');
  });

  it('paints single-paragraph shape textbox spacing on the lone wrapper', () => {
    const geometry: DrawingGeometry = { width: 200, height: 80, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'textbox-single-paragraph-spacing',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'rect',
      fillColor: null,
      strokeColor: null,
      textContent: {
        parts: [{ text: 'Only paragraph' }],
        paragraphs: [{ spacing: { before: 24, after: 5.333 } }],
      },
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const textOverlay = mount.querySelector('.superdoc-vector-shape div[style*="display: flex"]') as HTMLElement | null;
    expect(textOverlay).toBeTruthy();

    const wrappers = Array.from(textOverlay!.children) as HTMLElement[];
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0].style.marginTop).toBe('24px');
    expect(wrappers[0].style.marginBottom).toBe('5.333px');
  });

  it('does not advance shape textbox paragraph spacing for intra-paragraph line breaks', () => {
    const geometry: DrawingGeometry = { width: 200, height: 100, rotation: 0, flipH: false, flipV: false };
    const drawingBlock: DrawingFlowBlock = {
      kind: 'drawing',
      id: 'textbox-spacing-line-break',
      drawingKind: 'vectorShape',
      geometry,
      shapeKind: 'rect',
      fillColor: null,
      strokeColor: null,
      textContent: {
        parts: [
          { text: 'First' },
          { text: '\n', isLineBreak: true },
          { text: 'line' },
          { text: '\n', isLineBreak: true, isParagraphBoundary: true },
          { text: 'Second' },
        ],
        paragraphs: [{ spacing: { before: 24, after: 5.333 } }, { spacing: { before: 40, after: 7 } }],
      },
    };

    const { blocks, measures, layout } = createDrawingFixtures(drawingBlock);
    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const textOverlay = mount.querySelector('.superdoc-vector-shape div[style*="display: flex"]') as HTMLElement | null;
    expect(textOverlay).toBeTruthy();

    const wrappers = Array.from(textOverlay!.children) as HTMLElement[];
    expect(wrappers).toHaveLength(3);
    expect(wrappers[0].style.marginTop).toBe('24px');
    expect(wrappers[0].style.marginBottom).toBe('');
    expect(wrappers[1].style.marginTop).toBe('');
    expect(wrappers[1].style.marginBottom).toBe('5.333px');
    expect(wrappers[2].style.marginTop).toBe('40px');
    expect(wrappers[2].style.marginBottom).toBe('7px');
  });
});
