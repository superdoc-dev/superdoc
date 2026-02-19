import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleImageNode, getVectorShape } from './encode-image-node-helpers.js';
import { emuToPixels, polygonToObj, rotToDegrees } from '@converter/helpers.js';
import { extractFillColor, extractStrokeColor, extractStrokeWidth, extractLineEnds } from './vector-shape-helpers.js';

vi.mock('@converter/helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emuToPixels: vi.fn(),
    polygonToObj: vi.fn(),
    rotToDegrees: vi.fn(),
  };
});

vi.mock('./vector-shape-helpers.js', () => ({
  extractFillColor: vi.fn(),
  extractStrokeColor: vi.fn(),
  extractStrokeWidth: vi.fn(),
  extractLineEnds: vi.fn(),
}));

describe('handleImageNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emuToPixels.mockImplementation((emu) => (emu ? parseInt(emu, 10) / 1000 : 0));
    polygonToObj.mockImplementation((polygon) => {
      if (!polygon) return null;
      const points = [];
      polygon.elements.forEach((element) => {
        if (['wp:start', 'wp:lineTo'].includes(element.name)) {
          const { x, y } = element.attributes;
          points.push([parseInt(x, 10) / 1000, parseInt(y, 10) / 1000]);
        }
      });
      return points;
    });
  });

  const makeNode = (overrides = {}) => ({
    attributes: {
      distT: '1000',
      distB: '2000',
      distL: '3000',
      distR: '4000',
      ...overrides.attributes,
    },
    elements: [
      { name: 'wp:extent', attributes: { cx: '5000', cy: '6000' } },
      {
        name: 'a:graphic',
        elements: [
          {
            name: 'a:graphicData',
            attributes: { uri: 'pic' },
            elements: [
              {
                name: 'pic:pic',
                elements: [
                  {
                    name: 'pic:blipFill',
                    elements: [{ name: 'a:blip', attributes: { 'r:embed': 'rId1' } }],
                  },
                ],
              },
            ],
          },
        ],
      },
      { name: 'wp:docPr', attributes: { id: '42', name: 'MyImage', descr: 'Alt text' } },
    ],
  });

  const makeParams = (relsTarget = 'media/image.png') => ({
    filename: 'document.xml',
    docx: {
      'word/_rels/document.xml.rels': {
        elements: [
          {
            name: 'Relationships',
            elements: [
              {
                name: 'Relationship',
                attributes: { Id: 'rId1', Target: relsTarget },
              },
            ],
          },
        ],
      },
    },
  });

  const shapeUri = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';

  const makeShapeNode = ({ includeTextbox = false, prst = 'ellipse' } = {}) => {
    const wspChildren = [
      {
        name: 'wps:spPr',
        elements: [
          {
            name: 'a:prstGeom',
            attributes: { prst },
          },
        ],
      },
    ];

    if (includeTextbox) {
      wspChildren.push({
        name: 'wps:txbx',
        elements: [
          {
            name: 'w:txbxContent',
            elements: [{ name: 'w:p' }],
          },
        ],
      });
    }

    return {
      attributes: {
        distT: '1000',
        distB: '2000',
        distL: '3000',
        distR: '4000',
      },
      elements: [
        { name: 'wp:extent', attributes: { cx: '5000', cy: '6000' } },
        {
          name: 'a:graphic',
          elements: [
            {
              name: 'a:graphicData',
              attributes: { uri: shapeUri },
              elements: [
                {
                  name: 'wps:wsp',
                  elements: wspChildren,
                },
              ],
            },
          ],
        },
        { name: 'wp:docPr', attributes: { id: '99', name: 'Shape', descr: 'Shape placeholder' } },
        {
          name: 'wp:positionH',
          attributes: { relativeFrom: 'page' },
          elements: [{ name: 'wp:posOffset', elements: [{ text: '7000' }] }],
        },
        {
          name: 'wp:positionV',
          attributes: { relativeFrom: 'paragraph' },
          elements: [{ name: 'wp:posOffset', elements: [{ text: '8000' }] }],
        },
      ],
    };
  };

  it('returns null if picture is missing', () => {
    const node = makeNode();
    node.elements[1].elements[0].elements = [];
    const result = handleImageNode(node, makeParams(), false);
    expect(result).toBeNull();
  });

  it('returns null if r:embed is missing', () => {
    const node = {
      name: 'wp:drawing',
      elements: [
        { name: 'wp:extent', attributes: { cx: '5000', cy: '6000' } },
        {
          name: 'a:graphic',
          elements: [
            {
              name: 'a:graphicData',
              elements: [
                {
                  name: 'pic:pic',
                  elements: [
                    {
                      name: 'pic:blipFill',
                      elements: [
                        {
                          name: 'a:blip',
                          attributes: {}, // r:embed is missing
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      attributes: {}, // optional
    };

    const result = handleImageNode(node, makeParams(), false);
    expect(result).toBeNull();
  });

  it('returns null if no relationship found', () => {
    const node = makeNode();
    const result = handleImageNode(node, { docx: { 'word/_rels/document.xml.rels': { elements: [] } } }, false);
    expect(result).toBeNull();
  });

  it('handles basic image with padding, size, rel target', () => {
    const node = makeNode();
    const result = handleImageNode(node, makeParams(), true);

    expect(result.type).toBe('image');
    expect(result.attrs.src).toBe('word/media/image.png');
    expect(result.attrs.extension).toBe('png');
    expect(result.attrs.id).toBe('42');
    expect(result.attrs.alt).toBe('MyImage');
    expect(result.attrs.title).toBe('Alt text');
    expect(result.attrs.isAnchor).toBe(true);
    expect(result.attrs.size).toEqual({ width: 5, height: 6 }); // emuToPixels mocked
  });

  it('captures unhandled drawing children for passthrough preservation', () => {
    const node = makeNode();
    node.elements.push({
      name: 'wp14:sizeRelH',
      attributes: { relativeFrom: 'margin' },
    });

    const result = handleImageNode(node, makeParams(), false);

    expect(result.attrs.drawingChildOrder).toContain('wp14:sizeRelH');
    expect(result.attrs.originalDrawingChildren.map((c) => c.xml.name)).toEqual(
      expect.arrayContaining(['wp14:sizeRelH', 'a:graphic', 'wp:docPr']),
    );
  });

  it('normalizes targetPath starting with /word', () => {
    const node = makeNode();
    const params = makeParams('/word/media/pic.jpg');
    const result = handleImageNode(node, params, false);
    expect(result.attrs.src).toBe('word/media/pic.jpg');
    expect(result.attrs.extension).toBe('jpg');
  });

  it('normalizes targetPath starting with /media', () => {
    const node = makeNode();
    const params = makeParams('/media/pic.gif');
    const result = handleImageNode(node, params, false);
    // Paths starting with /media are prefixed with word/ to match media storage keys
    expect(result.attrs.src).toBe('word/media/pic.gif');
    expect(result.attrs.extension).toBe('gif');
  });

  it('handles absolute targets and missing dist attributes without crashing', () => {
    const minimalNode = {
      attributes: {},
      elements: [
        { name: 'wp:extent', attributes: { cx: '2000', cy: '4000' } },
        {
          name: 'a:graphic',
          elements: [
            {
              name: 'a:graphicData',
              attributes: { uri: 'pic' },
              elements: [
                {
                  name: 'pic:pic',
                  elements: [
                    {
                      name: 'pic:blipFill',
                      elements: [{ name: 'a:blip', attributes: { 'r:embed': 'rId1' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { name: 'wp:docPr', attributes: { id: '7', name: 'Absolute', descr: 'Abs image' } },
      ],
    };

    const result = handleImageNode(minimalNode, makeParams('/word/media/mId1.jpg'), false);
    expect(result).not.toBeNull();
    expect(result?.attrs?.src).toBe('word/media/mId1.jpg');
    expect(result?.attrs?.padding?.top).toBe(0);
  });

  it('returns alt text for EMF/WMF', () => {
    const node = makeNode();
    const params = makeParams('media/pic.emf');
    const result = handleImageNode(node, params, false);
    expect(result.attrs.alt).toBe('Unable to render EMF/WMF image');
    expect(result.attrs.extension).toBe('emf');
  });

  it('includes simplePos when simplePos="1", wrapSquare, anchorData', () => {
    const node = makeNode({
      attributes: { distT: '111', distB: '222', distL: '333', distR: '444', simplePos: '1' },
    });

    node.elements.push({ name: 'wp:simplePos', attributes: { x: '1', y: '2' } });
    node.elements.push({ name: 'wp:wrapSquare', attributes: { wrapText: 'bothSides' } });
    node.elements.push({
      name: 'wp:positionH',
      attributes: { relativeFrom: 'page' },
      elements: [
        { name: 'wp:posOffset', elements: [{ text: '1000' }] },
        { name: 'wp:align', elements: [{ text: 'center' }] },
      ],
    });
    node.elements.push({
      name: 'wp:positionV',
      attributes: { relativeFrom: 'margin' },
      elements: [
        { name: 'wp:posOffset', elements: [{ text: '2000' }] },
        { name: 'wp:align', elements: [{ text: 'bottom' }] },
      ],
    });

    const result = handleImageNode(node, makeParams(), true);

    expect(result.attrs.simplePos).toEqual({ x: '1', y: '2' });
    expect(result.attrs.wrap.attrs.wrapText).toBe('bothSides');
    expect(result.attrs.anchorData).toEqual({
      hRelativeFrom: 'page',
      vRelativeFrom: 'margin',
      alignH: 'center',
      alignV: 'bottom',
    });
    expect(result.attrs.marginOffset).toEqual({ horizontal: 1, top: 2 });
  });

  describe('simplePos attribute handling', () => {
    it('ignores wp:simplePos element when simplePos="0" attribute is set', () => {
      const node = makeNode({
        attributes: { distT: '111', distB: '222', distL: '333', distR: '444', simplePos: '0' },
      });

      // Add wp:simplePos element with legacy/placeholder coordinates
      node.elements.push({ name: 'wp:simplePos', attributes: { x: '3589020', y: '1859280' } });
      node.elements.push({ name: 'wp:wrapSquare', attributes: { wrapText: 'bothSides' } });
      node.elements.push({
        name: 'wp:positionH',
        attributes: { relativeFrom: 'margin' },
        elements: [{ name: 'wp:align', elements: [{ text: 'left' }] }],
      });
      node.elements.push({
        name: 'wp:positionV',
        attributes: { relativeFrom: 'margin' },
        elements: [{ name: 'wp:align', elements: [{ text: 'top' }] }],
      });

      const result = handleImageNode(node, makeParams(), true);

      // simplePos should NOT be included when simplePos="0"
      expect(result.attrs.simplePos).toBeUndefined();
      // But anchorData should still be present from positionH/positionV
      expect(result.attrs.anchorData).toEqual({
        hRelativeFrom: 'margin',
        vRelativeFrom: 'margin',
        alignH: 'left',
        alignV: 'top',
      });
    });

    it('ignores wp:simplePos element when simplePos attribute is missing', () => {
      const node = makeNode({
        attributes: { distT: '111', distB: '222', distL: '333', distR: '444' },
        // No simplePos attribute
      });

      // Add wp:simplePos element - should be ignored since attribute is not "1"
      node.elements.push({ name: 'wp:simplePos', attributes: { x: '999999', y: '888888' } });
      node.elements.push({
        name: 'wp:positionH',
        attributes: { relativeFrom: 'page' },
        elements: [{ name: 'wp:posOffset', elements: [{ text: '5000' }] }],
      });
      node.elements.push({
        name: 'wp:positionV',
        attributes: { relativeFrom: 'paragraph' },
        elements: [{ name: 'wp:posOffset', elements: [{ text: '6000' }] }],
      });

      const result = handleImageNode(node, makeParams(), true);

      // simplePos should NOT be included
      expect(result.attrs.simplePos).toBeUndefined();
      // marginOffset should come from positionH/positionV
      expect(result.attrs.marginOffset).toEqual({ horizontal: 5, top: 6 });
    });

    it('uses wp:simplePos element when simplePos="1" attribute is set', () => {
      const node = makeNode({
        attributes: { distT: '111', distB: '222', distL: '333', distR: '444', simplePos: '1' },
      });

      node.elements.push({ name: 'wp:simplePos', attributes: { x: '12345', y: '67890' } });
      // positionH/positionV should be ignored when simplePos="1"
      node.elements.push({
        name: 'wp:positionH',
        attributes: { relativeFrom: 'page' },
        elements: [{ name: 'wp:posOffset', elements: [{ text: '999' }] }],
      });
      node.elements.push({
        name: 'wp:positionV',
        attributes: { relativeFrom: 'paragraph' },
        elements: [{ name: 'wp:posOffset', elements: [{ text: '888' }] }],
      });

      const result = handleImageNode(node, makeParams(), true);

      // simplePos SHOULD be included when simplePos="1"
      expect(result.attrs.simplePos).toEqual({ x: '12345', y: '67890' });
    });

    it('uses wp:simplePos element when simplePos=1 (numeric)', () => {
      const node = makeNode({
        attributes: { distT: '111', distB: '222', distL: '333', distR: '444', simplePos: 1 },
      });

      node.elements.push({ name: 'wp:simplePos', attributes: { x: '11111', y: '22222' } });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.simplePos).toEqual({ x: '11111', y: '22222' });
    });
  });

  it('delegates to handleShapeDrawing when uri matches shape', () => {
    const node = makeShapeNode();

    const result = handleImageNode(node, makeParams(), false);
    expect(result.type).toBe('vectorShape');
  });

  it('renders rect shapes as vectorShapes', () => {
    extractFillColor.mockReturnValue('#123456');
    extractStrokeColor.mockReturnValue('#654321');
    extractStrokeWidth.mockReturnValue(2);

    const node = makeShapeNode({ prst: 'rect' });
    const result = handleImageNode(node, makeParams(), false);

    expect(result.type).toBe('vectorShape');
    expect(result.attrs.kind).toBe('rect');
    expect(result.attrs.width).toBe(5);
    expect(result.attrs.height).toBe(6);
    expect(result.attrs.fillColor).toBe('#123456');
    expect(result.attrs.strokeColor).toBe('#654321');
    expect(result.attrs.strokeWidth).toBe(2);
    expect(extractFillColor).toHaveBeenCalled();
    expect(extractStrokeColor).toHaveBeenCalled();
    expect(extractStrokeWidth).toHaveBeenCalled();
  });

  it('renders textbox shapes as vectorShapes with text content', () => {
    const node = makeShapeNode({ includeTextbox: true });
    const result = handleImageNode(node, makeParams(), false);

    // Textbox shapes are now properly handled as vectorShapes (not placeholders)
    expect(result.type).toBe('vectorShape');
    expect(result.attrs.kind).toBe('ellipse');
    // Should have textContent extracted from the textbox
    expect(result.attrs.textContent).toBeDefined();
  });

  describe('wrap types', () => {
    it('handles wrap type None', () => {
      const node = makeNode();
      node.elements.push({ name: 'wp:wrapNone' });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('None');
      expect(result.attrs.wrap.attrs).toEqual({ behindDoc: false });
    });

    it('handles wrap type Square with wrapText only', () => {
      const node = makeNode();
      node.elements.push({
        name: 'wp:wrapSquare',
        attributes: { wrapText: 'bothSides' },
      });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('Square');
      expect(result.attrs.wrap.attrs.wrapText).toBe('bothSides');
    });

    it('handles wrap type Square with distance attributes', () => {
      const node = makeNode();
      node.elements.push({
        name: 'wp:wrapSquare',
        attributes: {
          wrapText: 'largest',
          distT: '1000',
          distB: '2000',
          distL: '3000',
          distR: '4000',
        },
      });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('Square');
      expect(result.attrs.wrap.attrs.wrapText).toBe('largest');
      expect(result.attrs.wrap.attrs.distTop).toBe(1);
      expect(result.attrs.wrap.attrs.distBottom).toBe(2);
      expect(result.attrs.wrap.attrs.distLeft).toBe(3);
      expect(result.attrs.wrap.attrs.distRight).toBe(4);
    });

    it('handles wrap type TopAndBottom without distance attributes', () => {
      const node = makeNode();
      node.elements.push({ name: 'wp:wrapTopAndBottom' });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('TopAndBottom');
      expect(result.attrs.wrap.attrs).toEqual({});
    });

    it('handles wrap type TopAndBottom with distance attributes', () => {
      const node = makeNode();
      node.elements.push({
        name: 'wp:wrapTopAndBottom',
        attributes: {
          distT: '5000',
          distB: '6000',
        },
      });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('TopAndBottom');
      expect(result.attrs.wrap.attrs.distTop).toBe(5);
      expect(result.attrs.wrap.attrs.distBottom).toBe(6);
    });

    it('handles wrap type Tight without polygon', () => {
      const node = makeNode();
      node.elements.push({
        name: 'wp:wrapTight',
        attributes: {
          distL: '2000',
          distR: '3000',
        },
      });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('Tight');
      expect(result.attrs.wrap.attrs.distLeft).toBe(2);
      expect(result.attrs.wrap.attrs.distRight).toBe(3);
    });

    it('handles wrap type Tight with polygon', () => {
      const node = makeNode();
      node.elements.push({
        name: 'wp:wrapTight',
        attributes: {
          distT: '1000',
          distB: '2000',
          wrapText: 'bothSides',
        },
        elements: [
          {
            name: 'wp:wrapPolygon',
            attributes: { edited: '0' },
            elements: [
              { name: 'wp:start', attributes: { x: '1000', y: '2000' } },
              { name: 'wp:lineTo', attributes: { x: '3000', y: '4000' } },
              { name: 'wp:lineTo', attributes: { x: '5000', y: '6000' } },
            ],
          },
        ],
      });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('Tight');
      expect(result.attrs.wrap.attrs.distTop).toBe(1);
      expect(result.attrs.wrap.attrs.distBottom).toBe(2);
      expect(result.attrs.wrap.attrs.wrapText).toBe('bothSides');
      expect(result.attrs.wrap.attrs.polygon).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
      expect(result.attrs.wrap.attrs.polygonEdited).toBe('0');
    });

    it('handles wrap type Through without polygon', () => {
      const node = makeNode();
      node.elements.push({
        name: 'wp:wrapThrough',
        attributes: {
          distL: '1500',
          distR: '2500',
          distT: '500',
          distB: '750',
          wrapText: 'bothSides',
        },
      });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('Through');
      expect(result.attrs.wrap.attrs.distLeft).toBe(1.5);
      expect(result.attrs.wrap.attrs.distRight).toBe(2.5);
      expect(result.attrs.wrap.attrs.distTop).toBe(0.5);
      expect(result.attrs.wrap.attrs.distBottom).toBe(0.75);
      expect(result.attrs.wrap.attrs.wrapText).toBe('bothSides');
    });

    it('handles wrap type Through with polygon', () => {
      const node = makeNode();
      node.elements.push({
        name: 'wp:wrapThrough',
        elements: [
          {
            name: 'wp:wrapPolygon',
            attributes: { edited: '1' },
            elements: [
              { name: 'wp:start', attributes: { x: '10000', y: '20000' } },
              { name: 'wp:lineTo', attributes: { x: '30000', y: '40000' } },
            ],
          },
        ],
      });

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('Through');
      expect(result.attrs.wrap.attrs.polygon).toEqual([
        [10, 20],
        [30, 40],
      ]);
      expect(result.attrs.wrap.attrs.polygonEdited).toBe('1');
    });

    it('defaults to None wrap type when no wrap element found', () => {
      const node = makeNode();
      // No wrap element added

      const result = handleImageNode(node, makeParams(), true);

      expect(result.attrs.wrap.type).toBe('None');
      expect(result.attrs.wrap.attrs).toEqual({ behindDoc: false });
    });
  });

  /**
   * CRITICAL: srcRect/shouldCover tests
   *
   * These tests document the srcRect/shouldCover logic that determines whether images
   * should be clipped (object-fit: cover) or not.
   *
   * In OOXML:
   * - <a:stretch><a:fillRect/></a:stretch>: Scale image to fill extent rectangle
   * - <a:srcRect>: Specifies source cropping/extension
   *
   * srcRect attribute behavior:
   * - Positive values (e.g., r="84800"): Crop percentage from that edge (84.8% from right)
   * - Negative values (e.g., b="-3978"): Word extended the source mapping
   * - Empty/no srcRect: No pre-adjustment
   *
   * shouldCover is set to true when:
   * - stretch+fillRect is present AND
   * - no explicit srcRect clipPath is emitted AND
   * - srcRect has no negative values
   *
   * Real-world examples:
   * - whalar_tables_issue_tbl_only/word/header1.xml: <a:srcRect r="84800"/> → clipPath + shouldCover=false + objectFit=fill
   * - whalar_tables_issue_tbl_only/word/header2.xml: <a:srcRect/> (empty) → shouldCover=true
   * - certn_logo_left/word/header2.xml: <a:srcRect b="-3978"/> → shouldCover=false
   */
  describe('srcRect/shouldCover behavior', () => {
    const makeNodeWithBlipFill = (blipFillElements) => ({
      attributes: {
        distT: '1000',
        distB: '2000',
        distL: '3000',
        distR: '4000',
      },
      elements: [
        { name: 'wp:extent', attributes: { cx: '5000', cy: '6000' } },
        {
          name: 'a:graphic',
          elements: [
            {
              name: 'a:graphicData',
              attributes: { uri: 'pic' },
              elements: [
                {
                  name: 'pic:pic',
                  elements: [
                    {
                      name: 'pic:blipFill',
                      elements: [{ name: 'a:blip', attributes: { 'r:embed': 'rId1' } }, ...blipFillElements],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { name: 'wp:docPr', attributes: { id: '42', name: 'TestImage', descr: 'Test' } },
      ],
    });

    it('sets shouldCover=true when stretch+fillRect with NO srcRect element', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        // No srcRect element
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(true);
    });

    it('sets shouldCover=true when stretch+fillRect with EMPTY srcRect', () => {
      // Example: whalar header2.xml - <a:srcRect/>
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: {}, // Empty srcRect
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(true);
    });

    it('sets shouldCover=false when stretch+fillRect with POSITIVE srcRect values', () => {
      // Example: whalar header1.xml - <a:srcRect r="84800"/>
      // Positive value = crop 84.8% from right
      // Explicit srcRect clipping should replace cover fallback to avoid double-cropping.
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { r: '84800' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
      expect(result.attrs.objectFit).toBe('fill');
    });

    it('sets clipPath when srcRect has positive values', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { r: '84800' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.clipPath).toBe('inset(0% 84.8% 0% 0%)');
    });

    it('disables shouldCover when srcRect emits clipPath cropping', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { r: '50000' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.clipPath).toBe('inset(0% 50% 0% 0%)');
      expect(result.attrs.shouldCover).toBe(false);
      expect(result.attrs.objectFit).toBe('fill');
    });

    it('does not set clipPath when srcRect has negative values', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { b: '-3978' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.clipPath).toBeUndefined();
    });

    it('sets shouldCover=false when stretch+fillRect with multiple positive srcRect values', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { l: '10000', r: '20000', t: '5000', b: '5000' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
      expect(result.attrs.objectFit).toBe('fill');
    });

    it('sets shouldCover=false when stretch+fillRect with NEGATIVE srcRect value', () => {
      // Example: certn_logo_left header2.xml - <a:srcRect b="-3978"/>
      // Negative value = Word extended the source mapping
      // The image should NOT be clipped because Word already adjusted
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { b: '-3978' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });

    it('sets shouldCover=false when ANY srcRect value is negative', () => {
      // Even if some values are positive, a negative value means Word adjusted
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { l: '10000', r: '20000', b: '-1000' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });

    it('sets shouldCover=false when stretch but NO fillRect', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [], // No fillRect
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });

    it('sets shouldCover=false when NO stretch element', () => {
      const node = makeNodeWithBlipFill([
        // No stretch element
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });

    it('handles srcRect with zero values as non-negative (shouldCover=true)', () => {
      // Zero is not negative, so still needs cover mode
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { l: '0', r: '0', t: '0', b: '0' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(true);
    });

    it('handles srcRect with string number values (negative)', () => {
      // OOXML attributes are strings, ensure parsing works
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { b: '-5000' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });

    it('handles srcRect with only left edge negative', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { l: '-500' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });

    it('handles srcRect with only top edge negative', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { t: '-1000' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });

    it('handles srcRect with only right edge negative', () => {
      const node = makeNodeWithBlipFill([
        {
          name: 'a:stretch',
          elements: [{ name: 'a:fillRect' }],
        },
        {
          name: 'a:srcRect',
          attributes: { r: '-2000' },
        },
      ]);

      const result = handleImageNode(node, makeParams(), false);

      expect(result).not.toBeNull();
      expect(result.attrs.shouldCover).toBe(false);
    });
  });
});

describe('getVectorShape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emuToPixels.mockImplementation((emu) => parseInt(emu, 10) / 12700);
    rotToDegrees.mockImplementation((rot) => parseInt(rot, 10) / 60000);
    extractFillColor.mockReturnValue('#70ad47');
    extractStrokeColor.mockReturnValue('#000000');
    extractStrokeWidth.mockReturnValue(1);
    extractLineEnds.mockReturnValue(null);
  });

  const makeGraphicData = (overrides = {}) => ({
    elements: [
      {
        name: 'wps:wsp',
        elements: [
          {
            name: 'wps:spPr',
            elements: [
              {
                name: 'a:prstGeom',
                attributes: { prst: 'ellipse' },
              },
              {
                name: 'a:xfrm',
                attributes: { rot: '0', flipH: '0', flipV: '0' },
                elements: [
                  {
                    name: 'a:ext',
                    attributes: { cx: '914400', cy: '914400' },
                  },
                ],
              },
              ...(overrides.spPrElements || []),
            ],
          },
          {
            name: 'wps:style',
            elements: [],
          },
        ],
      },
    ],
  });

  const makeParams = () => ({
    nodes: [{ name: 'w:drawing', elements: [] }],
  });

  it('returns null when wsp is missing', () => {
    const graphicData = { elements: [] };
    const result = getVectorShape({ params: makeParams(), node: {}, graphicData, size: { width: 100, height: 100 } });
    expect(result).toBeNull();
  });

  it('returns null when spPr is missing', () => {
    const graphicData = {
      elements: [{ name: 'wps:wsp', elements: [] }],
    };
    const result = getVectorShape({ params: makeParams(), node: {}, graphicData, size: { width: 100, height: 100 } });
    expect(result).toBeNull();
  });

  it('uses wp:extent for dimensions (not a:xfrm/a:ext)', () => {
    const graphicData = makeGraphicData();
    // wp:extent says 150x150 (square)
    const wpExtentSize = { width: 150, height: 150 };
    // a:xfrm/a:ext in graphicData says 914400x914400 (this should be ignored)

    const result = getVectorShape({
      params: makeParams(),
      node: {},
      graphicData,
      size: wpExtentSize,
    });

    expect(result.type).toBe('vectorShape');
    expect(result.attrs.kind).toBe('ellipse');
    // Should use wp:extent dimensions, not a:xfrm/a:ext
    expect(result.attrs.width).toBe(150);
    expect(result.attrs.height).toBe(150);
    expect(result.attrs.rotation).toBe(0);
    expect(result.attrs.flipH).toBe(false);
    expect(result.attrs.flipV).toBe(false);
  });

  it('extracts colors and stroke width', () => {
    const graphicData = makeGraphicData();
    const result = getVectorShape({ params: makeParams(), node: {}, graphicData, size: { width: 72, height: 72 } });

    expect(extractFillColor).toHaveBeenCalled();
    expect(extractStrokeColor).toHaveBeenCalled();
    expect(extractStrokeWidth).toHaveBeenCalled();

    expect(result.attrs.fillColor).toBe('#70ad47');
    expect(result.attrs.strokeColor).toBe('#000000');
    expect(result.attrs.strokeWidth).toBe(1);
  });

  it('adds line end markers from helper extraction', () => {
    extractLineEnds.mockReturnValue({
      tail: { type: 'triangle', width: 'med', length: 'lg' },
    });
    const graphicData = makeGraphicData({
      spPrElements: [
        {
          name: 'a:ln',
          elements: [
            {
              name: 'a:tailEnd',
              attributes: { type: 'triangle', w: 'med', len: 'lg' },
            },
          ],
        },
      ],
    });

    const result = getVectorShape({
      params: makeParams(),
      node: {},
      graphicData,
      size: { width: 72, height: 72 },
    });

    expect(extractLineEnds).toHaveBeenCalled();
    expect(result.attrs.lineEnds).toEqual({
      tail: { type: 'triangle', width: 'med', length: 'lg' },
    });
  });

  it('extracts effectExtent from wp:effectExtent', () => {
    const graphicData = makeGraphicData();
    const node = {
      elements: [
        {
          name: 'wp:effectExtent',
          attributes: { l: '12700', t: '25400', r: '38100', b: '0' },
        },
      ],
    };

    const result = getVectorShape({
      params: makeParams(),
      node,
      graphicData,
      size: { width: 72, height: 72 },
    });

    expect(result.attrs.effectExtent).toEqual({
      left: 1,
      top: 2,
      right: 3,
      bottom: 0,
    });
  });

  it('handles rotation and flips from a:xfrm', () => {
    const graphicData = makeGraphicData();
    graphicData.elements[0].elements[0].elements[1].attributes = {
      rot: '5400000', // 90 degrees
      flipH: '1',
      flipV: '1',
    };

    const result = getVectorShape({
      params: makeParams(),
      node: {},
      graphicData,
      size: { width: 72, height: 72 },
    });

    expect(result.attrs.rotation).toBe(90);
    expect(result.attrs.flipH).toBe(true);
    expect(result.attrs.flipV).toBe(true);
  });

  it('uses default size when size parameter is missing', () => {
    const graphicData = makeGraphicData();

    const result = getVectorShape({ params: makeParams(), node: {}, graphicData });

    expect(result.attrs.width).toBe(100);
    expect(result.attrs.height).toBe(100);
  });

  it('stores drawingContent when present', () => {
    const drawingNode = { name: 'w:drawing', elements: [] };
    const params = { nodes: [drawingNode] };
    const graphicData = makeGraphicData();

    const result = getVectorShape({ params, node: {}, graphicData, size: { width: 72, height: 72 } });

    expect(result.attrs.drawingContent).toBe(drawingNode);
  });

  it('handles missing shape kind with warning', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const graphicData = makeGraphicData();
    graphicData.elements[0].elements[0].elements[0].attributes = {}; // No prst

    const result = getVectorShape({ params: makeParams(), node: {}, graphicData, size: { width: 72, height: 72 } });

    expect(consoleWarnSpy).toHaveBeenCalledWith('Shape kind not found');
    expect(result.attrs.kind).toBeUndefined();

    consoleWarnSpy.mockRestore();
  });

  it('correctly prioritizes wp:extent over a:xfrm/a:ext for dimensions', () => {
    const graphicData = makeGraphicData();
    // Override a:xfrm/a:ext to have different dimensions (571500 x 161926 EMU like the actual bug)
    graphicData.elements[0].elements[0].elements[1].elements = [
      {
        name: 'a:ext',
        attributes: { cx: '571500', cy: '161926' },
      },
    ];

    // wp:extent says the shape should be 150x150 (square)
    const wpExtentSize = { width: 150, height: 150 };

    const result = getVectorShape({
      params: makeParams(),
      node: {},
      graphicData,
      size: wpExtentSize,
    });

    // Should use wp:extent (150x150), not a:xfrm/a:ext (571500/12700 x 161926/12700)
    expect(result.attrs.width).toBe(150);
    expect(result.attrs.height).toBe(150);
  });

  it('regression test: picture marker shape with mismatched extents', () => {
    // This test validates the fix for the reported bug where picture marker shapes
    // were being scaled incorrectly because we read the wrong extent values.
    const graphicData = makeGraphicData();

    // Simulate the actual bug scenario:
    // a:xfrm/a:ext has the intrinsic shape dimensions (rectangular)
    graphicData.elements[0].elements[0].elements[1].elements = [
      {
        name: 'a:ext',
        attributes: { cx: '571500', cy: '161926' }, // Rectangular intrinsic size
      },
    ];

    // wp:extent has the final display dimensions (square)
    const wpExtentSize = { width: 150, height: 150 }; // Square display size

    const result = getVectorShape({
      params: makeParams(),
      node: {},
      graphicData,
      size: wpExtentSize,
    });

    // Validate that we use wp:extent (the anchor extent) for the final display size
    expect(result.attrs.width).toBe(150);
    expect(result.attrs.height).toBe(150);

    // The shape should maintain square proportions, not the rectangular intrinsic dimensions
    const aspectRatio = result.attrs.width / result.attrs.height;
    expect(aspectRatio).toBe(1); // Square aspect ratio
  });

  describe('[[sdspace]] placeholder replacement', () => {
    const makeGraphicDataWithTextbox = (text) => ({
      elements: [
        {
          name: 'wps:wsp',
          elements: [
            {
              name: 'wps:spPr',
              elements: [
                {
                  name: 'a:prstGeom',
                  attributes: { prst: 'rect' },
                },
                {
                  name: 'a:xfrm',
                  attributes: { rot: '0', flipH: '0', flipV: '0' },
                  elements: [
                    {
                      name: 'a:ext',
                      attributes: { cx: '914400', cy: '914400' },
                    },
                  ],
                },
              ],
            },
            {
              name: 'wps:style',
              elements: [],
            },
            {
              name: 'wps:txbx',
              elements: [
                {
                  name: 'w:txbxContent',
                  elements: [
                    {
                      name: 'w:p',
                      elements: [
                        {
                          name: 'w:r',
                          elements: [
                            {
                              name: 'w:t',
                              elements: [{ type: 'text', text }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    it('replaces a single [[sdspace]] placeholder with a space', () => {
      const graphicData = makeGraphicDataWithTextbox('Hello[[sdspace]]World');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent).toBeDefined();
      expect(result.attrs.textContent.parts).toHaveLength(1);
      expect(result.attrs.textContent.parts[0].text).toBe('Hello World');
    });

    it('replaces multiple [[sdspace]] placeholders with spaces', () => {
      const graphicData = makeGraphicDataWithTextbox('A[[sdspace]]B[[sdspace]]C[[sdspace]]D');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe('A B C D');
    });

    it('handles text without [[sdspace]] placeholders', () => {
      const graphicData = makeGraphicDataWithTextbox('Hello World');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe('Hello World');
    });

    it('handles [[sdspace]] at the beginning of text', () => {
      const graphicData = makeGraphicDataWithTextbox('[[sdspace]]Hello');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe(' Hello');
    });

    it('handles [[sdspace]] at the end of text', () => {
      const graphicData = makeGraphicDataWithTextbox('Hello[[sdspace]]');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe('Hello ');
    });

    it('handles consecutive [[sdspace]] placeholders', () => {
      const graphicData = makeGraphicDataWithTextbox('A[[sdspace]][[sdspace]]B');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe('A  B');
    });

    it('handles text that is only [[sdspace]] placeholders', () => {
      const graphicData = makeGraphicDataWithTextbox('[[sdspace]][[sdspace]][[sdspace]]');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe('   ');
    });

    it('handles empty text', () => {
      const graphicData = makeGraphicDataWithTextbox('');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe('');
    });

    it('preserves non-[[sdspace]] bracket patterns', () => {
      const graphicData = makeGraphicDataWithTextbox('[[notspace]][[sdspace]][other]');
      const result = getVectorShape({
        params: makeParams(),
        node: {},
        graphicData,
        size: { width: 100, height: 100 },
      });

      expect(result.attrs.textContent.parts[0].text).toBe('[[notspace]] [other]');
    });
  });
});
