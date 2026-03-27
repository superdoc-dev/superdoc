import { describe, it, expect } from 'vitest';
import { initTestEditor } from './helpers/helpers.js';

describe('ShapeGroup Schema Test', () => {
  it('should allow shapeGroup node in schema', () => {
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'run',
              content: [
                {
                  type: 'shapeGroup',
                  attrs: {
                    groupTransform: {},
                    shapes: [],
                    size: { width: 100, height: 100 },
                    padding: null,
                    marginOffset: null,
                    drawingContent: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });

    const doc = editor.state.doc;
    expect(doc).toBeDefined();
    expect(doc.type.name).toBe('doc');

    // Check if shapeGroup is in the document
    let foundShapeGroup = false;
    doc.descendants((node) => {
      if (node.type.name === 'shapeGroup') {
        foundShapeGroup = true;
      }
    });

    expect(foundShapeGroup).toBe(true);
  });

  it('should allow shapeGroup directly in paragraph (no run)', () => {
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
                shapes: [],
                size: { width: 100, height: 100 },
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

    const doc = editor.state.doc;
    expect(doc).toBeDefined();

    // Check if shapeGroup is in the document
    let foundShapeGroup = false;
    doc.descendants((node) => {
      if (node.type.name === 'shapeGroup') {
        foundShapeGroup = true;
      }
    });

    expect(foundShapeGroup).toBe(true);
  });

  it('should allow image node in run for comparison', () => {
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'run',
              content: [
                {
                  type: 'image',
                  attrs: {
                    src: 'word/media/test.png',
                    alt: 'Test',
                    extension: 'png',
                    id: '1',
                    title: 'Test',
                    inline: true,
                    padding: null,
                    marginOffset: null,
                    size: { width: 100, height: 100 },
                    anchorData: null,
                    isAnchor: false,
                    transformData: {},
                    wrap: { type: 'Inline' },
                    wrapTopAndBottom: false,
                    originalPadding: {},
                    originalAttributes: {},
                    rId: 'rId1',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });

    const doc = editor.state.doc;
    expect(doc).toBeDefined();

    // Try to check the document for validation errors
    try {
      doc.check();
    } catch (error) {
      console.error('Document validation error:', error.message);
    }

    // Check if image is in the document
    let foundImage = false;
    doc.descendants((node) => {
      if (node.type.name === 'image') {
        foundImage = true;
      }
    });

    expect(foundImage).toBe(true);
  });

  it('should allow shapeGroup with minimal attrs', () => {
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
            },
          ],
        },
      ],
    };

    const { editor } = initTestEditor({ loadFromSchema: true, content: testDoc });

    const doc = editor.state.doc;
    expect(doc).toBeDefined();

    // Check if shapeGroup is in the document
    let foundShapeGroup = false;
    doc.descendants((node) => {
      if (node.type.name === 'shapeGroup') {
        foundShapeGroup = true;
      }
    });

    expect(foundShapeGroup).toBe(true);
  });

  it('should allow shapeGroup with explicit content field', () => {
    const testDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'shapeGroup',
              content: [], // Explicitly specify empty content for atom node
              attrs: {
                groupTransform: {},
                shapes: [],
                size: { width: 100, height: 100 },
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

    const doc = editor.state.doc;
    expect(doc).toBeDefined();

    // Check if shapeGroup is in the document
    let foundShapeGroup = false;
    doc.descendants((node) => {
      if (node.type.name === 'shapeGroup') {
        foundShapeGroup = true;
      }
    });

    expect(foundShapeGroup).toBe(true);
  });

  it('should create shapeGroup using schema.nodes directly', () => {
    const { editor } = initTestEditor({});

    // Try creating a shapeGroup node directly using the schema
    try {
      const shapeGroupNode = editor.schema.nodes.shapeGroup.create({
        groupTransform: {},
        shapes: [],
        size: { width: 100, height: 100 },
        padding: null,
        marginOffset: null,
        drawingContent: null,
      });

      expect(shapeGroupNode).toBeDefined();
      expect(shapeGroupNode.type.name).toBe('shapeGroup');

      // Now try to create a paragraph containing it
      const paragraphNode = editor.schema.nodes.paragraph.create(null, [shapeGroupNode]);
      expect(paragraphNode.childCount).toBe(1);
    } catch (error) {
      console.error('Error creating shapeGroup node:', error.message);
      throw error;
    }
  });

  it('should have shapeGroup in schema', () => {
    const { editor } = initTestEditor({});

    expect(editor.schema.nodes.shapeGroup).toBeDefined();
  });

  it('should render shapeGroup with SVG elements in DOM', () => {
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
                  x: 0,
                  y: 0,
                  width: 300,
                  height: 200,
                },
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'ellipse',
                      x: 50,
                      y: 50,
                      width: 100,
                      height: 80,
                      fillColor: '#5b9bd5',
                      strokeColor: '#000000',
                      strokeWidth: 2,
                    },
                  },
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'rect',
                      x: 200,
                      y: 50,
                      width: 80,
                      height: 80,
                      fillColor: '#ff6b6b',
                      strokeColor: '#000000',
                      strokeWidth: 2,
                    },
                  },
                ],
                size: { width: 300, height: 200 },
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

    // Find the shape group element
    const shapeGroupEl = editorDOM.querySelector('[data-shape-group]');
    expect(shapeGroupEl).toBeTruthy();

    if (shapeGroupEl) {
      // Verify SVG element is rendered
      const svg = shapeGroupEl.querySelector('svg');
      expect(svg).toBeTruthy();

      if (svg) {
        // Verify SVG has correct dimensions
        expect(svg.getAttribute('width')).toBe('300');
        expect(svg.getAttribute('height')).toBe('200');
        expect(svg.getAttribute('viewBox')).toBe('0 0 300 200');

        // Verify SVG contains group elements for shapes
        const groups = svg.querySelectorAll('g');
        expect(groups.length).toBeGreaterThan(0);

        // Verify SVG is not hidden (our CSS fix should ensure this)
        const computedStyle = window.getComputedStyle(svg);
        // Display should be either inline-block or block, not none
        expect(computedStyle.display).not.toBe('none');
        // Overflow should allow SVG content to be visible
        // Note: In some environments it might be 'clip' or other values, just ensure it's not 'hidden'
        expect(computedStyle.overflow).not.toBe('hidden');
      }
    }
  });

  it('should render SVG shapes with correct attributes', () => {
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
                      kind: 'ellipse',
                      x: 0,
                      y: 0,
                      width: 100,
                      height: 80,
                      rotation: 0,
                      flipH: false,
                      flipV: false,
                      fillColor: '#729fcf',
                      strokeColor: '#3465a4',
                      strokeWidth: 2,
                    },
                  },
                ],
                size: { width: 100, height: 80 },
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

    const svg = editorDOM.querySelector('svg');
    expect(svg).toBeTruthy();

    if (svg) {
      // Verify SVG has group elements (shapes are wrapped in <g> tags)
      const groups = svg.querySelectorAll('g');
      expect(groups.length).toBeGreaterThan(0);

      // The shape rendering depends on getPresetShapeSvg being available
      // In a test environment, we just verify the structure is there
      // and SVG is not hidden by CSS
      const computedStyle = window.getComputedStyle(svg);
      expect(computedStyle.display).not.toBe('none');
    }
  });

  it('should not be affected by global CSS isolation', () => {
    // This test verifies that SVG rendering works with CSS isolation
    // (regression test for the issue fixed in this PR)

    // Inject aggressive global CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      * { border: 5px solid red !important; }
      svg { display: none !important; }
    `;
    document.head.appendChild(styleEl);

    try {
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
                        kind: 'ellipse',
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 80,
                        fillColor: '#5b9bd5',
                        strokeColor: '#000000',
                        strokeWidth: 2,
                      },
                    },
                  ],
                  size: { width: 100, height: 80 },
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

      const svg = editorDOM.querySelector('svg');
      expect(svg).toBeTruthy();

      if (svg) {
        // SVG should still be visible despite global display: none
        // Our CSS isolation with !important should override the global CSS
        const computedStyle = window.getComputedStyle(svg);
        expect(computedStyle.display).not.toBe('none');

        // Verify group elements exist (shapes wrapped in <g>)
        const groups = svg.querySelectorAll('g');
        expect(groups.length).toBeGreaterThan(0);
      }
    } finally {
      // Clean up
      document.head.removeChild(styleEl);
    }
  });

  it('should render shapes with visible paths (regression test for CSS isolation bug)', () => {
    // REGRESSION TEST: Bug discovered 2025-11-11
    // When 'all: revert' was applied to SVG elements, or 'all: initial/unset',
    // shape paths would not render (invisible shapes, only bounding boxes visible)
    // This test ensures SVG paths within shape groups are always visible

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
                  x: 0,
                  y: 0,
                  width: 200,
                  height: 150,
                },
                shapes: [
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'ellipse',
                      x: 10,
                      y: 10,
                      width: 80,
                      height: 60,
                      fillColor: '#ff0000',
                      strokeColor: '#000000',
                      strokeWidth: 2,
                    },
                  },
                  {
                    shapeType: 'vectorShape',
                    attrs: {
                      kind: 'ellipse',
                      x: 110,
                      y: 10,
                      width: 80,
                      height: 60,
                      fillColor: '#00ff00',
                      strokeColor: '#000000',
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

    const shapeGroup = editorDOM.querySelector('[data-shape-group]');
    expect(shapeGroup).toBeTruthy();

    const svg = shapeGroup?.querySelector('svg');
    expect(svg).toBeTruthy();

    // Check that SVG is visible
    const svgStyle = window.getComputedStyle(svg);
    expect(svgStyle.display).not.toBe('none');
    expect(svgStyle.visibility).not.toBe('hidden');

    // Check for path or shape elements within the SVG
    const paths = svg.querySelectorAll('path');
    const circles = svg.querySelectorAll('circle');
    const ellipses = svg.querySelectorAll('ellipse');
    const rects = svg.querySelectorAll('rect');

    const totalShapes = paths.length + circles.length + ellipses.length + rects.length;

    // Should have at least some shape elements rendered
    // (The exact element type depends on getPresetShapeSvg implementation)
    expect(totalShapes).toBeGreaterThan(0);

    // Verify that paths have fill attributes if they exist
    paths.forEach((path) => {
      const fill = path.getAttribute('fill');
      const computedFill = window.getComputedStyle(path).fill;

      // Either fill attribute should exist, or computed fill should not be 'none'
      expect(fill || computedFill !== 'none').toBeTruthy();
    });
  });

  it('should preserve SVG fill and stroke with CSS isolation enabled', () => {
    // REGRESSION TEST: Ensures SVG presentation attributes are not reset by CSS
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
                      kind: 'ellipse',
                      x: 0,
                      y: 0,
                      width: 100,
                      height: 100,
                      fillColor: '#780373', // Specific purple color
                      strokeColor: '#bbe33d', // Specific lime color
                      strokeWidth: 3,
                    },
                  },
                ],
                size: { width: 100, height: 100 },
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

    // Find any rendered shape element
    const shapeElement =
      svg.querySelector('path') ||
      svg.querySelector('ellipse') ||
      svg.querySelector('circle') ||
      svg.querySelector('rect');

    expect(shapeElement).toBeTruthy();

    if (shapeElement) {
      // Verify fill attribute is set (attributes are what matter for SVG)
      const fillAttr = shapeElement.getAttribute('fill');
      expect(fillAttr).toBeTruthy();
      expect(fillAttr).toBe('#780373'); // The purple color we specified

      // Verify stroke attribute is set
      const strokeAttr = shapeElement.getAttribute('stroke');
      expect(strokeAttr).toBeTruthy();
      expect(strokeAttr).toBe('#bbe33d'); // The lime color we specified

      // The key test: with CSS isolation fixed, SVG attributes should be preserved
      // (previously, 'all: initial/unset' was resetting these)
      expect(shapeElement.hasAttribute('fill')).toBe(true);
      expect(shapeElement.hasAttribute('stroke')).toBe(true);
    }
  });
});
