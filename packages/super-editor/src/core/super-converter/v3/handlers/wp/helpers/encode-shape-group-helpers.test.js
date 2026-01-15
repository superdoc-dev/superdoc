import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleImageNode } from './encode-image-node-helpers.js';
vi.mock('@converter/helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emuToPixels: vi.fn((emu) => emu / 9525),
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
}));

vi.mock('@core/utilities/carbonCopy.js', () => ({
  carbonCopy: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
}));

describe('handleImageNode - Shape Group Support', () => {
  const GROUP_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createShapeGroupNode = (shapes = []) => {
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
                          elements: [
                            { name: 'a:off', attributes: { x: '0', y: '0' } },
                            { name: 'a:ext', attributes: { cx: '3466440', cy: '1628640' } },
                            { name: 'a:chOff', attributes: { x: '0', y: '0' } },
                            { name: 'a:chExt', attributes: { cx: '3466440', cy: '1628640' } },
                          ],
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

    expect(shape.attrs.rotation).toBeGreaterThan(0);
    expect(shape.attrs.flipH).toBe(true);
    expect(shape.attrs.flipV).toBe(true);
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
