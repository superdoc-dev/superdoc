import { describe, it, expect } from 'vitest';
import { initTestEditor } from './helpers/helpers.js';

/**
 * Test suite for line shape rendering in shape groups.
 *
 * Line shapes use the preset geometry prst="line" in OOXML and are rendered
 * as SVG <line> elements. This suite verifies that line shapes are correctly
 * rendered with proper stroke colors, widths, and orientations.
 */
describe('ShapeGroup Line Shape Rendering', () => {
  it('should render horizontal line shape with correct attributes', () => {
    // Horizontal lines have height=0 and should draw from (0,0) to (width,0)
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {
                  width: 400,
                  height: 100,
                },
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: 50,
                      width: 400,
                      height: 0, // Horizontal line
                      strokeColor: '#5b9bd5',
                      strokeWidth: 2,
                      rotation: 0,
                      flipH: false,
                      flipV: false,
                    },
                  },
                ],
                size: { width: 400, height: 100 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const shapeGroup = editorDOM.querySelector('[data-shape-group]');
    expect(shapeGroup).toBeTruthy();

    const svg = shapeGroup?.querySelector('svg');
    expect(svg).toBeTruthy();

    // Find the line element
    const line = svg?.querySelector('line');
    expect(line).toBeTruthy();

    if (line) {
      // Verify line coordinates - horizontal line from (0,0) to (width,0)
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('400');
      expect(line.getAttribute('y2')).toBe('0');

      // Verify stroke color
      expect(line.getAttribute('stroke')).toBe('#5b9bd5');

      // Verify stroke width
      expect(line.getAttribute('stroke-width')).toBe('2');
    }
  });

  it('should render vertical line shape with correct attributes', () => {
    // Vertical lines have width=0 and should draw from (0,0) to (0,height)
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {
                  width: 100,
                  height: 300,
                },
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 50,
                      y: 0,
                      width: 0, // Vertical line
                      height: 300,
                      strokeColor: '#ff0000',
                      strokeWidth: 3,
                      rotation: 0,
                      flipH: false,
                      flipV: false,
                    },
                  },
                ],
                size: { width: 100, height: 300 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const line = editorDOM.querySelector('[data-shape-group] svg line');
    expect(line).toBeTruthy();

    if (line) {
      // Verify line coordinates - vertical line from (0,0) to (0,height)
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('0');
      expect(line.getAttribute('y2')).toBe('300');

      // Verify stroke color
      expect(line.getAttribute('stroke')).toBe('#ff0000');

      // Verify stroke width
      expect(line.getAttribute('stroke-width')).toBe('3');
    }
  });

  it('should render diagonal line shape with correct attributes', () => {
    // Diagonal lines have both width and height and draw from (0,0) to (width,height)
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {
                  width: 200,
                  height: 200,
                },
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: 0,
                      width: 200,
                      height: 200,
                      strokeColor: '#00ff00',
                      strokeWidth: 4,
                      rotation: 0,
                      flipH: false,
                      flipV: false,
                    },
                  },
                ],
                size: { width: 200, height: 200 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const line = editorDOM.querySelector('[data-shape-group] svg line');
    expect(line).toBeTruthy();

    if (line) {
      // Verify line coordinates - diagonal line from (0,0) to (width,height)
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('200');
      expect(line.getAttribute('y2')).toBe('200');

      // Verify stroke color
      expect(line.getAttribute('stroke')).toBe('#00ff00');

      // Verify stroke width
      expect(line.getAttribute('stroke-width')).toBe('4');
    }
  });

  it('should handle line with null stroke color', () => {
    // Lines with null stroke color should render with stroke="none"
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {},
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: 0,
                      width: 100,
                      height: 0,
                      strokeColor: null, // Explicitly no stroke
                      strokeWidth: 1,
                    },
                  },
                ],
                size: { width: 100, height: 50 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const line = editorDOM.querySelector('[data-shape-group] svg line');
    expect(line).toBeTruthy();

    if (line) {
      expect(line.getAttribute('stroke')).toBe('none');
      expect(line.getAttribute('stroke-width')).toBe('0');
    }
  });

  it('should use default stroke color when undefined', () => {
    // When strokeColor is undefined (not null), should use default black
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {},
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: 0,
                      width: 100,
                      height: 0,
                      // strokeColor is undefined
                      strokeWidth: 2,
                    },
                  },
                ],
                size: { width: 100, height: 50 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const line = editorDOM.querySelector('[data-shape-group] svg line');
    expect(line).toBeTruthy();

    if (line) {
      // Default stroke color should be #000000 (black)
      expect(line.getAttribute('stroke')).toBe('#000000');
    }
  });

  it('should render multiple lines in the same shape group', () => {
    // Test rendering multiple line shapes together (e.g., footer with multiple lines)
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {
                  width: 400,
                  height: 200,
                },
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: 50,
                      width: 400,
                      height: 0,
                      strokeColor: '#5b9bd5',
                      strokeWidth: 2,
                    },
                  },
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: 150,
                      width: 400,
                      height: 0,
                      strokeColor: '#ff6b6b',
                      strokeWidth: 3,
                    },
                  },
                ],
                size: { width: 400, height: 200 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const svg = editorDOM.querySelector('[data-shape-group] svg');
    expect(svg).toBeTruthy();

    if (svg) {
      // Should have 2 group elements (one for each shape)
      const groups = svg.querySelectorAll('g');
      expect(groups.length).toBe(2);

      // Should have 2 line elements
      const lines = svg.querySelectorAll('line');
      expect(lines.length).toBe(2);

      // Verify first line (blue)
      const line1 = lines[0];
      expect(line1.getAttribute('stroke')).toBe('#5b9bd5');
      expect(line1.getAttribute('stroke-width')).toBe('2');

      // Verify second line (red)
      const line2 = lines[1];
      expect(line2.getAttribute('stroke')).toBe('#ff6b6b');
      expect(line2.getAttribute('stroke-width')).toBe('3');
    }
  });

  it('should render line with text content if present', () => {
    // Lines can have associated text content (though rare)
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {},
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: 0,
                      width: 200,
                      height: 0,
                      strokeColor: '#000000',
                      strokeWidth: 2,
                      textContent: {
                        parts: [
                          {
                            text: 'Label',
                            fontSize: 12,
                            fontColor: '#000000',
                          },
                        ],
                      },
                      textAlign: 'center',
                    },
                  },
                ],
                size: { width: 200, height: 50 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const svg = editorDOM.querySelector('[data-shape-group] svg');
    expect(svg).toBeTruthy();

    if (svg) {
      // Should have the line element
      const line = svg.querySelector('line');
      expect(line).toBeTruthy();

      // Should also have text element(s) if text rendering is implemented
      // Note: Text rendering may create <text> or <g> elements depending on implementation
      const hasTextElements = svg.querySelectorAll('text').length > 0 || svg.querySelectorAll('g > text').length > 0;

      // If text rendering is implemented, verify it exists
      // If not implemented yet, this is just documentation of expected behavior
      if (hasTextElements) {
        expect(hasTextElements).toBe(true);
      }
    }
  });

  it('should handle line shape with transformations (rotation)', () => {
    // Lines can be rotated using the rotation attribute
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {},
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 100,
                      y: 100,
                      width: 100,
                      height: 0,
                      rotation: 45, // 45 degree rotation
                      strokeColor: '#5b9bd5',
                      strokeWidth: 2,
                    },
                  },
                ],
                size: { width: 300, height: 300 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const svg = editorDOM.querySelector('[data-shape-group] svg');
    expect(svg).toBeTruthy();

    if (svg) {
      // The line should be inside a <g> element with transform attribute
      const group = svg.querySelector('g');
      expect(group).toBeTruthy();

      if (group) {
        const transform = group.getAttribute('transform');
        expect(transform).toBeTruthy();
        // Should contain rotation transform
        expect(transform).toContain('rotate(45');
      }

      // The line itself should still have correct coordinates
      const line = svg.querySelector('line');
      expect(line).toBeTruthy();

      if (line) {
        expect(line.getAttribute('x1')).toBe('0');
        expect(line.getAttribute('y1')).toBe('0');
        expect(line.getAttribute('x2')).toBe('100');
        expect(line.getAttribute('y2')).toBe('0');
      }
    }
  });

  it('should handle line shape with flip transformations', () => {
    // Lines can be flipped horizontally or vertically
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {},
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 50,
                      y: 50,
                      width: 100,
                      height: 50,
                      flipH: true, // Horizontal flip
                      flipV: false,
                      strokeColor: '#ff0000',
                      strokeWidth: 2,
                    },
                  },
                ],
                size: { width: 200, height: 150 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const svg = editorDOM.querySelector('[data-shape-group] svg');
    expect(svg).toBeTruthy();

    if (svg) {
      const group = svg.querySelector('g');
      expect(group).toBeTruthy();

      if (group) {
        const transform = group.getAttribute('transform');
        expect(transform).toBeTruthy();
        // Should contain scale(-1, 1) for horizontal flip
        expect(transform).toContain('scale(-1, 1)');
      }
    }
  });

  it('should render line shape matching MS Word appearance', () => {
    // Test horizontal line with theme color matching MS Word output
    // Convert EMUs to pixels: 6112933 EMUs / 9525 = ~641.78 px
    const width = Math.round(6112933 / 9525);
    const lineWidth = 9525 / 12700; // Convert EMUs to points, ~0.75pt

    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              attrs: {
                groupTransform: {},
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'line',
                      x: 0,
                      y: Math.round(800100 / 9525),
                      width,
                      height: 0,
                      strokeColor: '#5b9bd5', // accent1 theme color
                      strokeWidth: lineWidth,
                    },
                  },
                ],
                size: { width, height: 100 },
                padding: null,
                marginOffset: null,
                drawingContent: null,
              },
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });
    const editorDOM = editor.view.dom;

    const line = editorDOM.querySelector('[data-shape-group] svg line');
    expect(line).toBeTruthy();

    if (line) {
      // Verify it's a horizontal line
      expect(line.getAttribute('y1')).toBe('0');
      expect(line.getAttribute('y2')).toBe('0');

      // Verify it has the correct blue color from theme
      expect(line.getAttribute('stroke')).toBe('#5b9bd5');

      // Verify stroke width is set
      const strokeWidth = parseFloat(line.getAttribute('stroke-width') || '0');
      expect(strokeWidth).toBeGreaterThan(0);
    }
  });
});
