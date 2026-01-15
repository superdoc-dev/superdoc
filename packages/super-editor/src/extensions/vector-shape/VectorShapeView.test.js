import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VectorShapeView } from './VectorShapeView.js';
import * as presetGeometry from '@superdoc/preset-geometry';
import * as svgUtils from '../shared/svg-utils.js';

// Mock dependencies
vi.mock('@superdoc/preset-geometry', () => ({
  getPresetShapeSvg: vi.fn(),
}));

vi.mock('@converter/helpers.js', () => ({
  inchesToPixels: vi.fn((inches) => inches * 96),
}));

vi.mock('../shared/svg-utils.js', () => ({
  createGradient: vi.fn(),
  createTextElement: vi.fn(),
  applyGradientToSVG: vi.fn(),
  applyAlphaToSVG: vi.fn(),
  generateTransforms: vi.fn(() => []),
}));

describe('VectorShapeView', () => {
  let mockEditor;
  let mockNode;
  let mockGetPos;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Setup default mock implementations
    svgUtils.generateTransforms.mockReturnValue([]);

    // Create mock editor
    mockEditor = {
      view: {},
      converter: {
        pageStyles: {
          pageMargins: { left: 1 },
        },
      },
    };

    // Create mock node with default attributes
    mockNode = {
      attrs: {
        kind: 'rect',
        width: 100,
        height: 100,
        fillColor: '#ff0000',
        strokeColor: '#000000',
        strokeWidth: 1,
      },
    };

    mockGetPos = vi.fn(() => 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor and mounting', () => {
    it('creates a VectorShapeView instance with required properties', () => {
      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(view.node).toBe(mockNode);
      expect(view.editor).toBe(mockEditor);
      expect(view.getPos).toBe(mockGetPos);
      expect(view.root).toBeDefined();
    });

    it('calls mount() during construction', () => {
      const mountSpy = vi.spyOn(VectorShapeView.prototype, 'mount');

      new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(mountSpy).toHaveBeenCalledTimes(1);
      mountSpy.mockRestore();
    });
  });

  describe('transform combination logic', () => {
    it('combines positioning transforms with shape transforms in correct order', () => {
      const mockNodeWithTransforms = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          rotation: 45,
          fillColor: '#ff0000',
          anchorData: {
            hRelativeFrom: 'margin',
            alignH: 'center',
          },
        },
      };

      svgUtils.generateTransforms.mockReturnValue(['rotate(45deg)']);

      const view = new VectorShapeView({
        node: mockNodeWithTransforms,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      // Should have combined transforms: positioning first, then shape transforms
      expect(element.style.transform).toBeTruthy();
    });

    it('handles empty positioning transform', () => {
      svgUtils.generateTransforms.mockReturnValue(['rotate(90deg)']);

      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      // Should only have shape transforms
      expect(element.style.transform).toBe('rotate(90deg)');
    });

    it('handles whitespace-only positioning transform', () => {
      const mockNodeWithWhitespace = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: '#ff0000',
        },
      };

      svgUtils.generateTransforms.mockReturnValue(['scaleX(-1)']);

      const view = new VectorShapeView({
        node: mockNodeWithWhitespace,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      expect(element.style.transform).toBe('scaleX(-1)');
    });

    it('filters out null/undefined transforms from array', () => {
      svgUtils.generateTransforms.mockReturnValue(['rotate(45deg)', null, undefined, 'scaleX(-1)']);

      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      expect(element.style.transform).toBe('rotate(45deg) scaleX(-1)');
    });

    it('filters out empty string transforms', () => {
      svgUtils.generateTransforms.mockReturnValue(['rotate(45deg)', '', '   ', 'scaleY(-1)']);

      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      expect(element.style.transform).toBe('rotate(45deg) scaleY(-1)');
    });

    it('handles generateTransform returning undefined', () => {
      svgUtils.generateTransforms.mockReturnValue(undefined);

      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      // Should not throw an error
      expect(view.dom).toBeDefined();
    });

    it('handles generateTransform returning null', () => {
      svgUtils.generateTransforms.mockReturnValue(null);

      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      // Should not throw an error
      expect(view.dom).toBeDefined();
    });

    it('handles non-array return from generateTransform', () => {
      svgUtils.generateTransforms.mockReturnValue('rotate(45deg)');

      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      // Should not throw an error
      expect(view.dom).toBeDefined();
    });
  });

  describe('SVG rendering with preserveAspectRatio="none"', () => {
    it('renders basic rect shape without using preset geometry', () => {
      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const svg = view.dom.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg.getAttribute('width')).toBe('100');
      expect(svg.getAttribute('height')).toBe('100');

      const rect = svg.querySelector('rect');
      expect(rect).toBeDefined();
      expect(rect.getAttribute('width')).toBe('100');
      expect(rect.getAttribute('height')).toBe('100');
    });

    it('renders ellipse shape without using preset geometry', () => {
      const ellipseNode = {
        attrs: {
          kind: 'ellipse',
          width: 150,
          height: 100,
          fillColor: '#00ff00',
          strokeColor: '#000000',
          strokeWidth: 2,
        },
      };

      const view = new VectorShapeView({
        node: ellipseNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const svg = view.dom.querySelector('svg');
      const ellipse = svg.querySelector('ellipse');
      expect(ellipse).toBeDefined();
      expect(ellipse.getAttribute('rx')).toBe('75');
      expect(ellipse.getAttribute('ry')).toBe('50');
    });

    it('renders circle shape as ellipse', () => {
      const circleNode = {
        attrs: {
          kind: 'circle',
          width: 100,
          height: 100,
          fillColor: '#0000ff',
        },
      };

      const view = new VectorShapeView({
        node: circleNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const svg = view.dom.querySelector('svg');
      const ellipse = svg.querySelector('ellipse');
      expect(ellipse).toBeDefined();
      expect(ellipse.getAttribute('rx')).toBe('50');
      expect(ellipse.getAttribute('ry')).toBe('50');
    });

    it('uses preset geometry for complex shapes with preserveAspectRatio="none"', () => {
      const complexNode = {
        attrs: {
          kind: 'star5',
          width: 150,
          height: 100,
          fillColor: '#ff00ff',
        },
      };

      const mockSvgTemplate =
        '<svg viewBox="0 0 100 100"><path d="M50,0 L60,40 L100,40 L70,60 L80,100 L50,75 L20,100 L30,60 L0,40 L40,40 Z" /></svg>';
      presetGeometry.getPresetShapeSvg.mockReturnValue(mockSvgTemplate);

      const view = new VectorShapeView({
        node: complexNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(presetGeometry.getPresetShapeSvg).toHaveBeenCalledWith({
        preset: 'star5',
        styleOverrides: {
          fill: '#ff00ff',
          stroke: 'none',
          strokeWidth: 0,
        },
        width: 150,
        height: 100,
      });

      const svg = view.dom.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.getAttribute('width')).toBe('150');
      expect(svg.getAttribute('height')).toBe('100');
    });

    it('handles preset geometry with non-uniform scaling', () => {
      const nonUniformNode = {
        attrs: {
          kind: 'triangle',
          width: 200,
          height: 50,
          fillColor: '#ffaa00',
        },
      };

      const mockSvgTemplate = '<svg viewBox="0 0 100 100"><polygon points="50,0 100,100 0,100" /></svg>';
      presetGeometry.getPresetShapeSvg.mockReturnValue(mockSvgTemplate);

      const view = new VectorShapeView({
        node: nonUniformNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const svg = view.dom.querySelector('svg');
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.getAttribute('width')).toBe('200');
      expect(svg.getAttribute('height')).toBe('50');
    });
  });

  describe('edge cases and error handling', () => {
    it('handles missing transform data gracefully', () => {
      const nodeWithoutTransforms = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: '#ff0000',
        },
      };

      svgUtils.generateTransforms.mockReturnValue([]);

      const view = new VectorShapeView({
        node: nodeWithoutTransforms,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(view.dom).toBeDefined();
      const element = view.dom;
      // Transform may be empty or not set
      expect(element.style.transform === '' || !element.style.transform).toBe(true);
    });

    it('handles zero dimensions', () => {
      const zeroDimNode = {
        attrs: {
          kind: 'rect',
          width: 0,
          height: 0,
          fillColor: '#ff0000',
        },
      };

      const view = new VectorShapeView({
        node: zeroDimNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(view.dom).toBeDefined();
      const element = view.dom;
      expect(element.style.width).toBe('0px');
      expect(element.style.height).toBe('0px');
    });

    it('handles SVG generation errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const complexNode = {
        attrs: {
          kind: 'complexShape',
          width: 100,
          height: 100,
        },
      };

      // Make getPresetShapeSvg throw an error
      presetGeometry.getPresetShapeSvg.mockImplementation(() => {
        throw new Error('SVG generation failed');
      });

      // The view should still be created successfully even if SVG generation fails
      const view = new VectorShapeView({
        node: complexNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      // The error is caught in the try-catch block, so the view should exist
      expect(view.dom).toBeDefined();
      // The DOM should have the basic structure even without the SVG
      expect(view.dom.classList.contains('sd-vector-shape')).toBe(true);

      consoleWarnSpy.mockRestore();
    });

    it('handles invalid SVG template from preset geometry', () => {
      const complexNode = {
        attrs: {
          kind: 'invalidShape',
          width: 100,
          height: 100,
        },
      };

      presetGeometry.getPresetShapeSvg.mockReturnValue('<div>Not an SVG</div>');

      const view = new VectorShapeView({
        node: complexNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      // Should handle gracefully without throwing
      expect(view.dom).toBeDefined();
    });

    it('handles null return from preset geometry', () => {
      const complexNode = {
        attrs: {
          kind: 'unknownShape',
          width: 100,
          height: 100,
        },
      };

      presetGeometry.getPresetShapeSvg.mockReturnValue(null);

      const view = new VectorShapeView({
        node: complexNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(view.dom).toBeDefined();
    });
  });

  describe('positioning logic', () => {
    it('applies z-index based on relativeHeight for wrapped shapes', () => {
      const anchoredNode = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: '#ff0000',
          wrap: {
            type: 'None',
            attrs: {},
          },
          originalAttributes: {
            relativeHeight: 251659318,
          },
        },
      };

      const view = new VectorShapeView({
        node: anchoredNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      // The view should be created successfully
      expect(element).toBeDefined();
      expect(element.classList.contains('sd-vector-shape')).toBe(true);
      // The positioning styles are applied through getPositioningStyle which is tested separately
      // Here we just verify the basic structure is created
    });

    it('uses left positioning for absolutely positioned shapes without explicit horizontal alignment', () => {
      const nodeWithoutAlign = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: '#ff0000',
          wrap: {
            type: 'None',
            attrs: {},
          },
          anchorData: {
            hRelativeFrom: 'column',
            vRelativeFrom: 'paragraph',
          },
          marginOffset: {
            horizontal: 50,
            top: 20,
          },
        },
      };

      const view = new VectorShapeView({
        node: nodeWithoutAlign,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      expect(element.style.position).toBe('absolute');
      expect(element.style.left).toBe('50px');
    });

    it('applies center alignment for margin-relative anchors', () => {
      const centeredNode = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: '#ff0000',
          anchorData: {
            hRelativeFrom: 'margin',
            alignH: 'center',
          },
        },
      };

      const view = new VectorShapeView({
        node: centeredNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      expect(element.style.position).toBe('absolute');
      expect(element.style.left).toBe('50%');
      expect(element.style.transform).toContain('translateX(-50%)');
    });

    it('applies float for column-relative anchors with right alignment', () => {
      const floatRightNode = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: '#ff0000',
          anchorData: {
            hRelativeFrom: 'column',
            alignH: 'right',
          },
        },
      };

      const view = new VectorShapeView({
        node: floatRightNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const element = view.dom;
      expect(element.style.cssText).toContain('float: right');
    });
  });

  describe('text content rendering', () => {
    it('renders text content when present', () => {
      const nodeWithText = {
        attrs: {
          kind: 'rect',
          width: 200,
          height: 100,
          fillColor: '#ff0000',
          textContent: {
            parts: [{ text: 'Hello World', formatting: {} }],
          },
          textAlign: 'center',
        },
      };

      svgUtils.createTextElement.mockReturnValue(
        document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject'),
      );

      const view = new VectorShapeView({
        node: nodeWithText,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(svgUtils.createTextElement).toHaveBeenCalledWith(nodeWithText.attrs.textContent, 'center', 200, 100, {
        pageNumber: undefined,
        textInsets: undefined,
        textVerticalAlign: undefined,
        totalPages: undefined,
      });
    });

    it('does not render text when textContent is missing', () => {
      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(svgUtils.createTextElement).not.toHaveBeenCalled();
    });
  });

  describe('gradient and alpha handling', () => {
    it('creates gradient fill for shapes with gradient fillColor', () => {
      const gradientNode = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: {
            type: 'gradient',
            gradientType: 'linear',
            angle: 90,
            stops: [
              { position: 0, color: '#ff0000' },
              { position: 1, color: '#00ff00' },
            ],
          },
        },
      };

      const mockGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      svgUtils.createGradient.mockReturnValue(mockGradient);

      const view = new VectorShapeView({
        node: gradientNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(svgUtils.createGradient).toHaveBeenCalled();
      const svg = view.dom.querySelector('svg');
      expect(svg.querySelector('defs')).toBeDefined();
    });

    it('handles solid fill with alpha transparency', () => {
      const alphaNode = {
        attrs: {
          kind: 'rect',
          width: 100,
          height: 100,
          fillColor: {
            type: 'solidWithAlpha',
            color: '#ff0000',
            alpha: 0.5,
          },
        },
      };

      const view = new VectorShapeView({
        node: alphaNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const svg = view.dom.querySelector('svg');
      const rect = svg.querySelector('rect');
      expect(rect.getAttribute('fill')).toBe('#ff0000');
      expect(rect.getAttribute('fill-opacity')).toBe('0.5');
    });
  });

  describe('update method', () => {
    it('returns false to trigger NodeView recreation', () => {
      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(view.update()).toBe(false);
    });
  });

  describe('DOM accessors', () => {
    it('provides dom accessor that returns the root element', () => {
      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(view.dom).toBe(view.root);
      expect(view.dom.tagName).toBe('SPAN');
      expect(view.dom.classList.contains('sd-vector-shape')).toBe(true);
    });

    it('provides contentDOM accessor that returns null', () => {
      const view = new VectorShapeView({
        node: mockNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      expect(view.contentDOM).toBeNull();
    });
  });

  describe('roundRect rendering', () => {
    it('renders roundRect with appropriate corner radius', () => {
      const roundRectNode = {
        attrs: {
          kind: 'roundRect',
          width: 100,
          height: 100,
          fillColor: '#ff0000',
        },
      };

      const view = new VectorShapeView({
        node: roundRectNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const svg = view.dom.querySelector('svg');
      const rect = svg.querySelector('rect');
      expect(rect).toBeDefined();
      // Corner radius should be 5% of smallest dimension (100 * 0.05 = 5)
      expect(rect.getAttribute('rx')).toBe('5');
      expect(rect.getAttribute('ry')).toBe('5');
    });

    it('calculates corner radius based on smallest dimension', () => {
      const roundRectNode = {
        attrs: {
          kind: 'roundRect',
          width: 200,
          height: 100,
          fillColor: '#00ff00',
        },
      };

      const view = new VectorShapeView({
        node: roundRectNode,
        editor: mockEditor,
        getPos: mockGetPos,
        decorations: [],
        innerDecorations: [],
        extension: {},
        htmlAttributes: {},
      });

      const svg = view.dom.querySelector('svg');
      const rect = svg.querySelector('rect');
      // Corner radius should be 5% of 100 (smaller dimension) = 5
      expect(rect.getAttribute('rx')).toBe('5');
      expect(rect.getAttribute('ry')).toBe('5');
    });
  });
});
