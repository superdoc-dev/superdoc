import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleImageNode } from './encode-image-node-helpers.js';
vi.mock('@converter/helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emuToPixels: vi.fn((emu) => Math.round(emu / 9525)),
    rotToDegrees: vi.fn((rot) => rot / 60000),
    polygonToObj: vi.fn(),
    carbonCopy: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
  };
});

vi.mock('./vector-shape-helpers.js', () => ({
  extractFillColor: vi.fn((spPr) => {
    const solidFill = spPr?.elements?.find((el) => el.name === 'a:solidFill');
    const srgbClr = solidFill?.elements?.find((el) => el.name === 'a:srgbClr');
    return srgbClr ? '#' + srgbClr.attributes?.['val'] : '#5b9bd5';
  }),
  extractStrokeColor: vi.fn((spPr) => {
    const ln = spPr?.elements?.find((el) => el.name === 'a:ln');
    const solidFill = ln?.elements?.find((el) => el.name === 'a:solidFill');
    const srgbClr = solidFill?.elements?.find((el) => el.name === 'a:srgbClr');
    return srgbClr ? '#' + srgbClr.attributes?.['val'] : '#000000';
  }),
  extractStrokeWidth: vi.fn(() => 1),
  extractLineEnds: vi.fn(() => null),
  extractCustomGeometry: vi.fn(() => null),
  extractShapeEffects: vi.fn(() => null),
}));

vi.mock('@core/utilities/carbonCopy.js', () => ({
  carbonCopy: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
}));

describe('handleImageNode - Shape Group Support', () => {
  const GROUP_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createXfrmElements = ({
    x = '0',
    y = '0',
    cx = '3466440',
    cy = '1628640',
    chX = '0',
    chY = '0',
    chCx = cx,
    chCy = cy,
    includeChOff = true,
    includeChExt = true,
  } = {}) => [
    { name: 'a:off', attributes: { x, y } },
    { name: 'a:ext', attributes: { cx, cy } },
    ...(includeChOff ? [{ name: 'a:chOff', attributes: { x: chX, y: chY } }] : []),
    ...(includeChExt ? [{ name: 'a:chExt', attributes: { cx: chCx, cy: chCy } }] : []),
  ];

  const createShapeGroupNode = (shapes = [], xfrm = {}, effectExtent = null) => {
    return {
      attributes: {
        behindDoc: '0',
        distT: '0',
        distB: '0',
        distL: '0',
        distR: '0',
      },
      elements: [
        {
          name: 'wp:extent',
          attributes: {
            cx: '3466465',
            cy: '1628775',
          },
        },
        ...(effectExtent
          ? [
              {
                name: 'wp:effectExtent',
                attributes: effectExtent,
              },
            ]
          : []),
        {
          name: 'a:graphic',
          elements: [
            {
              name: 'a:graphicData',
              attributes: { uri: GROUP_URI },
              elements: [
                {
                  name: 'wpg:wgp',
                  elements: [
                    {
                      name: 'wpg:cNvGrpSpPr',
                    },
                    {
                      name: 'wpg:grpSpPr',
                      elements: [
                        {
                          name: 'a:xfrm',
                          elements: createXfrmElements(xfrm),
                        },
                      ],
                    },
                    ...shapes,
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  };

  const createShape = (id, name, x, y, cx, cy, fillColor = 'ff0000') => {
    return {
      name: 'wps:wsp',
      elements: [
        {
          name: 'wps:cNvPr',
          attributes: { id, name },
        },
        {
          name: 'wps:cNvSpPr',
        },
        {
          name: 'wps:spPr',
          elements: [
            {
              name: 'a:xfrm',
              elements: [
                { name: 'a:off', attributes: { x, y } },
                { name: 'a:ext', attributes: { cx, cy } },
              ],
            },
            {
              name: 'a:prstGeom',
              attributes: { prst: 'ellipse' },
              elements: [{ name: 'a:avLst' }],
            },
            {
              name: 'a:solidFill',
              elements: [
                {
                  name: 'a:srgbClr',
                  attributes: { val: fillColor },
                },
              ],
            },
            {
              name: 'a:ln',
              attributes: { w: '0' },
              elements: [
                {
                  name: 'a:solidFill',
                  elements: [
                    {
                      name: 'a:srgbClr',
                      attributes: { val: '3465a4' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'wps:style',
          elements: [
            { name: 'a:lnRef', attributes: { idx: '0' } },
            { name: 'a:fillRef', attributes: { idx: '0' } },
            { name: 'a:effectRef', attributes: { idx: '0' } },
            { name: 'a:fontRef', attributes: { idx: 'minor' } },
          ],
        },
        {
          name: 'wps:bodyPr',
        },
      ],
    };
  };

  const createTextBoxShape = (id, name, x, y, cx, cy, lines) => {
    const shape = createShape(id, name, x, y, cx, cy);
    shape.elements.push({
      name: 'wps:txbx',
      elements: [
        {
          name: 'w:txbxContent',
          elements: lines.map((line) => ({
            name: 'w:p',
            elements: [
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:t',
                    elements: [{ type: 'text', text: line }],
                  },
                ],
              },
            ],
          })),
        },
      ],
    });
    return shape;
  };

  const createNestedGroup = ({ xfrm = {}, children = [] } = {}) => {
    return {
      name: 'wpg:grpSp',
      elements: [
        {
          name: 'wpg:grpSpPr',
          elements: [
            {
              name: 'a:xfrm',
              elements: createXfrmElements(xfrm),
            },
          ],
        },
        ...children,
      ],
    };
  };

  const createPicture = ({
    id = '10',
    name = 'Picture 10',
    rId = 'rIdImage',
    rEmbed,
    x = '0',
    y = '0',
    cx = '9525',
    cy = '9525',
    prst = 'ellipse',
    srcRectAttrs,
    alphaModFixAmt,
  } = {}) => {
    const blipFillElements = [
      {
        name: 'a:blip',
        attributes: { 'r:embed': rEmbed ?? rId },
        ...(alphaModFixAmt != null
          ? {
              elements: [{ name: 'a:alphaModFix', attributes: { amt: String(alphaModFixAmt) } }],
            }
          : {}),
      },
    ];
    if (srcRectAttrs) {
      blipFillElements.push({
        name: 'a:srcRect',
        attributes: srcRectAttrs,
      });
    }
    blipFillElements.push({
      name: 'a:stretch',
      elements: [{ name: 'a:fillRect' }],
    });

    return {
      name: 'pic:pic',
      elements: [
        {
          name: 'pic:nvPicPr',
          elements: [
            {
              name: 'pic:cNvPr',
              attributes: { id, name },
            },
          ],
        },
        {
          name: 'pic:blipFill',
          elements: blipFillElements,
        },
        {
          name: 'pic:spPr',
          elements: [
            {
              name: 'a:xfrm',
              elements: [
                { name: 'a:off', attributes: { x, y } },
                { name: 'a:ext', attributes: { cx, cy } },
              ],
            },
            {
              name: 'a:prstGeom',
              attributes: { prst },
              elements: [{ name: 'a:avLst' }],
            },
          ],
        },
      ],
    };
  };

  const createParamsWithImageRel = (target = 'media/image5.jpeg', rId = 'rIdImage') => ({
    filename: 'document.xml',
    docx: {
      'word/_rels/document.xml.rels': {
        elements: [
          {
            name: 'Relationships',
            elements: [
              {
                name: 'Relationship',
                attributes: { Id: rId, Target: target },
              },
            ],
          },
        ],
      },
    },
    nodes: [{ name: 'w:drawing' }],
  });

  it('should parse a shape group with multiple shapes', () => {
    const shapes = [
      createShape('2', 'Shape 1', '1260360', '0', '1571760', '1571760', 'ff0000'),
      createShape('3', 'Shape 2', '0', '320760', '1841400', '1308240', '729fcf'),
      createShape('4', 'Shape 3', '2460600', '54000', '1005840', '1212840', '00a933'),
    ];

    const node = createShapeGroupNode(shapes);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);

    expect(result).toBeTruthy();
    expect(result.type).toBe('shapeGroup');
    expect(result.attrs.shapes).toHaveLength(3);
    expect(result.attrs.groupTransform).toBeDefined();
  });

  it('should extract alphaModFix from grouped pictures', () => {
    const node = createShapeGroupNode([createPicture({ id: '9', name: 'Grouped Picture', alphaModFixAmt: 9000 })]);

    const result = handleImageNode(node, createParamsWithImageRel('media/grouped-watermark.png'), true);

    expect(result).toBeTruthy();
    expect(result.type).toBe('shapeGroup');
    expect(result.attrs.shapes).toHaveLength(1);
    expect(result.attrs.shapes[0]).toMatchObject({
      shapeType: 'image',
      attrs: {
        src: 'word/media/grouped-watermark.png',
        imageId: '9',
        imageName: 'Grouped Picture',
        alphaModFix: { amt: 9000 },
      },
    });
  });

  it('should preserve XML paint order across nested groups, shapes, and pictures', () => {
    const nestedPicture = createPicture({ id: '10', name: 'Nested Picture' });
    const directShape = createShape('11', 'Direct Shape', '0', '0', '100', '100');
    const directPicture = createPicture({ id: '12', name: 'Direct Picture' });
    const nestedGroup = createNestedGroup({ children: [nestedPicture] });
    const node = createShapeGroupNode([nestedGroup, directShape, directPicture]);

    const result = handleImageNode(node, createParamsWithImageRel(), true);

    expect(
      result.attrs.shapes.map((shape) => (shape.shapeType === 'image' ? shape.attrs.imageId : shape.attrs.shapeId)),
    ).toEqual(['10', '11', '12']);
  });

  it('should extract group effect extent from wp:effectExtent', () => {
    const node = createShapeGroupNode(
      [createShape('2', 'Shape 1', '0', '0', '100', '100')],
      {},
      { l: '9525', t: '19050', r: '0', b: '28575' },
    );
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);

    expect(result.attrs.effectExtent).toEqual({
      left: 1,
      top: 2,
      right: 0,
      bottom: 3,
    });
  });

  it('should extract group transform properties', () => {
    const shapes = [createShape('2', 'Shape 1', '0', '0', '100', '100')];
    const node = createShapeGroupNode(shapes);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);

    expect(result.attrs.groupTransform).toEqual({
      x: 0,
      y: 0,
      width: expect.any(Number),
      height: expect.any(Number),
      childX: 0,
      childY: 0,
      childOriginXEmu: 0,
      childOriginYEmu: 0,
      childWidth: expect.any(Number),
      childHeight: expect.any(Number),
    });
  });

  it('should extract individual shape properties', () => {
    const shapes = [createShape('2', 'Shape 1', '1260360', '0', '1571760', '1571760', 'ff0000')];
    const node = createShapeGroupNode(shapes);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);

    const shape = result.attrs.shapes[0];
    expect(shape.shapeType).toBe('vectorShape');
    expect(shape.attrs).toMatchObject({
      kind: 'ellipse',
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
      rotation: 0,
      flipH: false,
      flipV: false,
      fillColor: expect.any(String),
      strokeColor: expect.any(String),
      strokeWidth: 1,
      shapeId: '2',
      shapeName: 'Shape 1',
      textContent: null,
      textAlign: 'left',
    });
  });

  it('should handle shape transformations (rotation, flip)', () => {
    const shapeWithTransform = {
      name: 'wps:wsp',
      elements: [
        {
          name: 'wps:cNvPr',
          attributes: { id: '2', name: 'Shape 1' },
        },
        {
          name: 'wps:cNvSpPr',
        },
        {
          name: 'wps:spPr',
          elements: [
            {
              name: 'a:xfrm',
              attributes: {
                rot: '5400000',
                flipH: '1',
                flipV: '1',
              },
              elements: [
                { name: 'a:off', attributes: { x: '0', y: '0' } },
                { name: 'a:ext', attributes: { cx: '100', cy: '100' } },
              ],
            },
            {
              name: 'a:prstGeom',
              attributes: { prst: 'rect' },
            },
          ],
        },
        {
          name: 'wps:style',
          elements: [],
        },
        {
          name: 'wps:bodyPr',
        },
      ],
    };

    const node = createShapeGroupNode([shapeWithTransform]);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);
    const shape = result.attrs.shapes[0];

    expect(shape.attrs.rotation).toBe(270);
    expect(shape.attrs.flipH).toBe(false);
    expect(shape.attrs.flipV).toBe(false);
  });

  it('should preserve group-level rotation and flips on the group transform', () => {
    const shape = createShape('2', 'Shape 1', '0', '0', '100', '100');
    const node = createShapeGroupNode([shape], {
      x: '0',
      y: '0',
      cx: '200',
      cy: '200',
      chX: '0',
      chY: '0',
      chCx: '200',
      chCy: '200',
    });
    const groupXfrm = node.elements[1].elements[0].elements[0].elements[1].elements[0];
    groupXfrm.attributes = {
      rot: '5400000',
      flipH: '1',
      flipV: '1',
    };
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);
    const importedShape = result.attrs.shapes[0];

    expect(result.attrs.groupTransform).toMatchObject({
      rotation: 90,
      flipH: true,
      flipV: true,
    });
    expect(importedShape.attrs.rotation).toBe(0);
    expect(importedShape.attrs.flipH).toBe(false);
    expect(importedShape.attrs.flipV).toBe(false);
  });

  it('should preserve grouped picture srcRect and ellipse geometry as image clipping attrs', () => {
    const picture = createPicture({
      id: '1784104486',
      name: 'Picture 31',
      srcRectAttrs: { t: '589', b: '589' },
    });
    const node = createShapeGroupNode([picture]);

    const result = handleImageNode(node, createParamsWithImageRel(), true);
    const image = result.attrs.shapes[0];

    expect(image.shapeType).toBe('image');
    expect(image.attrs).toMatchObject({
      src: 'word/media/image5.jpeg',
      imageId: '1784104486',
      imageName: 'Picture 31',
      clipPath: 'inset(0.589% 0% 0.589% 0%)',
      shapeClipPath: 'ellipse(50% 50% at 50% 50%)',
      objectFit: 'fill',
    });
  });

  it('should reuse stretch fill cover behavior for grouped pictures without srcRect', () => {
    const picture = createPicture({
      id: '1784104487',
      name: 'Picture 32',
      prst: 'rect',
    });
    const node = createShapeGroupNode([picture]);

    const result = handleImageNode(node, createParamsWithImageRel(), true);
    const image = result.attrs.shapes[0];

    expect(image.shapeType).toBe('image');
    expect(image.attrs).toMatchObject({
      src: 'word/media/image5.jpeg',
      imageId: '1784104487',
      imageName: 'Picture 32',
      objectFit: 'cover',
    });
    expect(image.attrs.clipPath).toBeUndefined();
    expect(image.attrs.shapeClipPath).toBeUndefined();
  });

  it('should preserve drawingContent for round-tripping', () => {
    const shapes = [createShape('2', 'Shape 1', '0', '0', '100', '100')];
    const node = createShapeGroupNode(shapes);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);

    expect(result.attrs.drawingContent).toBeDefined();
    expect(result.attrs.drawingContent.name).toBe('w:drawing');
  });

  it('should handle empty group gracefully', () => {
    const node = createShapeGroupNode([]);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);

    expect(result).toBeTruthy();
    expect(result.type).toBe('shapeGroup');
    expect(result.attrs.shapes).toHaveLength(0);
  });

  it('should flatten shapes inside nested group shapes', () => {
    const nestedGroup = createNestedGroup({
      children: [
        createTextBoxShape('3', 'Nested Text 1', '0', '0', '9525', '9525', ['Brett Ross']),
        createTextBoxShape('4', 'Nested Text 2', '9525', '0', '9525', '9525', ['Kristen Anderson']),
      ],
    });
    const node = createShapeGroupNode([
      createTextBoxShape('2', 'Direct Text', '0', '0', '9525', '9525', ['Joe Roberson']),
      nestedGroup,
    ]);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);
    const textValues = result.attrs.shapes.flatMap(
      (shape) => shape.attrs.textContent?.parts?.map((part) => part.text) || [],
    );

    expect(result.attrs.shapes).toHaveLength(3);
    expect(textValues).toContain('Joe Roberson');
    expect(textValues).toContain('Brett Ross');
    expect(textValues).toContain('Kristen Anderson');
  });

  it('should compose nested group transforms in EMU before converting to pixels', () => {
    const nestedGroup = createNestedGroup({
      xfrm: {
        x: '9525',
        y: '19050',
        cx: '38100',
        cy: '76200',
        chX: '9525',
        chY: '19050',
        chCx: '19050',
        chCy: '38100',
      },
      children: [createShape('3', 'Nested Shape', '19050', '38100', '9525', '19050')],
    });
    const node = createShapeGroupNode([nestedGroup]);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);
    const shape = result.attrs.shapes[0];

    expect(shape.attrs).toMatchObject({
      x: 3,
      y: 6,
      width: 2,
      height: 4,
    });
  });

  it('should round only after composing nested EMU transforms', () => {
    const nestedGroup = createNestedGroup({
      xfrm: {
        x: '3810',
        y: '0',
        cx: '9525',
        cy: '9525',
        chCx: '9525',
        chCy: '9525',
      },
      children: [createShape('3', 'Nested Shape', '0', '0', '9525', '9525')],
    });
    const node = createShapeGroupNode([nestedGroup], {
      x: '3810',
      y: '0',
      cx: '9525',
      cy: '9525',
      chCx: '9525',
      chCy: '9525',
    });
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);
    const shape = result.attrs.shapes[0];

    expect(shape.attrs.x).toBe(1);
    expect(shape.attrs.y).toBe(0);
  });

  it('should preserve negative nested child origins when composing coordinates', () => {
    const nestedGroup = createNestedGroup({
      xfrm: {
        x: '0',
        y: '0',
        cx: '19050',
        cy: '19050',
        chX: '-9525',
        chY: '0',
        chCx: '19050',
        chCy: '19050',
      },
      children: [createShape('3', 'Nested Shape', '-19050', '0', '9525', '9525')],
    });
    const node = createShapeGroupNode([nestedGroup]);
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);
    const shape = result.attrs.shapes[0];

    expect(shape.attrs.x).toBe(-1);
    expect(shape.attrs.y).toBe(0);
    expect(shape.attrs.width).toBe(1);
    expect(shape.attrs.height).toBe(1);
  });

  it('should apply group offset with identity scale when child extents are missing', () => {
    const node = createShapeGroupNode([createShape('2', 'Shape 1', '9525', '0', '9525', '9525')], {
      x: '9525',
      y: '0',
      cx: '9525',
      cy: '9525',
      includeChExt: false,
    });
    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);
    const shape = result.attrs.shapes[0];

    expect(shape.attrs.x).toBe(2);
    expect(shape.attrs.y).toBe(0);
    expect(shape.attrs.width).toBe(1);
    expect(shape.attrs.height).toBe(1);
  });

  it('should handle group without wpg:wgp element', () => {
    const node = {
      attributes: { distT: '0', distB: '0', distL: '0', distR: '0' },
      elements: [
        {
          name: 'wp:extent',
          attributes: { cx: '100', cy: '100' },
        },
        {
          name: 'a:graphic',
          elements: [
            {
              name: 'a:graphicData',
              attributes: { uri: GROUP_URI },
              elements: [],
            },
          ],
        },
      ],
    };

    const params = {
      docx: {},
      nodes: [{ name: 'w:drawing' }],
    };

    const result = handleImageNode(node, params, true);

    // Should return a contentBlock placeholder when wpg:wgp is missing
    expect(result).toBeTruthy();
    expect(result.type).toBe('contentBlock');
  });
});
