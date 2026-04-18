import { translateAnchorNode } from './translate-anchor-node.js';
import { translateImageNode } from '../../helpers/decode-image-node-helpers.js';
import { pixelsToEmu, objToPolygon } from '../../../../../helpers.js';

vi.mock('@converter/v3/handlers/wp/helpers/decode-image-node-helpers.js', () => ({
  translateImageNode: vi.fn(),
}));

vi.mock('@converter/helpers.js', () => ({
  pixelsToEmu: vi.fn(),
  objToPolygon: vi.fn(),
}));

describe('translateAnchorNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // default mock for translateImageNode — must include wp:extent so the guard passes
    translateImageNode.mockReturnValue({
      attributes: { fakeAttr: 'val' },
      elements: [{ name: 'wp:extent' }, { name: 'wp:effectExtent' }, { name: 'pic:fake' }],
    });

    // default mock for pixelsToEmu
    pixelsToEmu.mockImplementation((px) => px * 1000);

    // default mock for objToPolygon
    objToPolygon.mockImplementation((points) => ({
      name: 'wp:wrapPolygon',
      type: 'wp:wrapPolygon',
      attributes: { edited: '0' },
      elements:
        points?.map((point, index) => {
          const tagName = index === 0 ? 'wp:start' : 'wp:lineTo';
          return {
            name: tagName,
            type: tagName,
            attributes: { x: point[0] * 1000, y: point[1] * 1000 },
          };
        }) || [],
    }));
  });

  it('should add wp:simplePos with coordinates and set simplePos attribute', () => {
    const params = { node: { attrs: { simplePos: { x: '111', y: '222' } } } };

    const result = translateAnchorNode(params);

    expect(result.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'wp:simplePos',
          attributes: { x: '111', y: '222' },
        }),
      ]),
    );
    expect(result.attributes.simplePos).toBe('1');
  });

  it('should keep simplePos="0" and still emit wp:simplePos', () => {
    const params = {
      node: {
        attrs: {
          simplePos: { x: '0', y: '0' },
          originalAttributes: { simplePos: '0' },
        },
      },
    };

    const result = translateAnchorNode(params);

    expect(result.attributes.simplePos).toBe('0');
    const simplePos = result.elements.find((el) => el.name === 'wp:simplePos');
    expect(simplePos).toBeDefined();
    expect(simplePos.attributes).toMatchObject({ x: '0', y: '0' });
  });

  // originalXml passthrough removed; preserved children path handles round-trip now

  it('should add wp:positionH with posOffset when marginOffset.horizontal is defined', () => {
    const params = {
      node: {
        attrs: {
          anchorData: { hRelativeFrom: 'margin' },
          marginOffset: { horizontal: 10 },
        },
      },
    };

    const result = translateAnchorNode(params);

    const posH = result.elements.find((e) => e.name === 'wp:positionH');
    expect(posH.attributes.relativeFrom).toBe('margin');
    expect(posH.elements[0].name).toBe('wp:posOffset');
    expect(posH.elements[0].elements[0].text).toBe('10000'); // 10 * 1000
    expect(pixelsToEmu).toHaveBeenCalledWith(10);
  });

  it('should add wp:positionV with posOffset and alignV', () => {
    const params = {
      node: {
        attrs: {
          anchorData: { vRelativeFrom: 'page', alignV: 'bottom' },
          marginOffset: { top: 20 },
        },
      },
    };

    const result = translateAnchorNode(params);

    const posV = result.elements.find((e) => e.name === 'wp:positionV');
    expect(posV.attributes.relativeFrom).toBe('page');
    expect(posV.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'wp:posOffset',
        }),
        expect.objectContaining({
          name: 'wp:align',
          elements: [expect.objectContaining({ text: 'bottom', type: 'text' })],
        }),
      ]),
    );
  });

  it('should add wp:wrapSquare if wrapText is provided', () => {
    const params = { node: { attrs: { wrap: { type: 'Square', attrs: { wrapText: 'bothSides' } } } } };

    const result = translateAnchorNode(params);

    expect(result.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'wp:wrapSquare',
          attributes: { wrapText: 'bothSides' },
        }),
      ]),
    );
  });

  it('should add wp:wrapTopAndBottom if wrapTopAndBottom is true', () => {
    const params = { node: { attrs: { wrap: { type: 'TopAndBottom' } } } };

    const result = translateAnchorNode(params);

    expect(result.elements).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'wp:wrapTopAndBottom' })]));
  });

  it('should fallback to wp:wrapNone if no wrapping is set', () => {
    const params = { node: { attrs: {} } };

    const result = translateAnchorNode(params);

    expect(result.elements).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'wp:wrapNone' })]));
  });

  it('should include originalAttributes in inlineAttrs', () => {
    const params = {
      node: {
        attrs: {
          originalAttributes: {
            simplePos: 'orig',
            locked: false,
            layoutInCell: true,
            allowOverlap: true,
          },
        },
      },
    };

    const result = translateAnchorNode(params);

    expect(result.attributes).toMatchObject({
      fakeAttr: 'val',
      simplePos: 'orig',
      relativeHeight: 1,
      locked: false,
      layoutInCell: true,
      allowOverlap: true,
    });
  });

  it('merges original drawing children back into the anchor output', () => {
    translateImageNode.mockReturnValue({
      attributes: {},
      elements: [{ name: 'wp:extent' }, { name: 'wp:docPr' }, { name: 'a:graphic' }],
    });

    const params = {
      node: {
        attrs: {
          drawingChildOrder: ['wp:extent', 'wp14:sizeRelH', 'wp:docPr', 'a:graphic'],
          originalDrawingChildren: [{ index: 1, xml: { name: 'wp14:sizeRelH', attributes: { relativeFrom: 'page' } } }],
        },
      },
    };

    const result = translateAnchorNode(params);

    expect(result.elements[1]).toMatchObject({ name: 'wp14:sizeRelH' });
  });

  it('reuses original drawing children (except wp:extent) when exporting', () => {
    translateImageNode.mockReturnValue({
      attributes: {},
      elements: [
        { name: 'wp:extent', attributes: { cx: 1, cy: 2 } },
        { name: 'wp:docPr', attributes: { id: 'generated' } },
        { name: 'a:graphic', attributes: { new: 'value' } },
      ],
    });

    const params = {
      node: {
        attrs: {
          drawingChildOrder: ['wp:extent', 'wp:docPr', 'a:graphic'],
          originalDrawingChildren: [
            { index: 1, xml: { name: 'wp:docPr', attributes: { id: 'original' } } },
            { index: 2, xml: { name: 'a:graphic', attributes: { from: 'original' } } },
          ],
        },
      },
    };

    const result = translateAnchorNode(params);

    expect(result.elements[0]).toMatchObject({ name: 'wp:extent', attributes: { cx: 1, cy: 2 } });
    expect(result.elements[1]).toMatchObject({ name: 'wp:docPr', attributes: { id: 'original' } });
    expect(result.elements[2]).toMatchObject({ name: 'a:graphic', attributes: { from: 'original' } });
  });

  describe('wrap types', () => {
    it('should add wp:wrapSquare with distance attributes', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Square',
              attrs: {
                wrapText: 'largest',
                distTop: 10,
                distBottom: 20,
                distLeft: 30,
                distRight: 40,
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapSquare',
            attributes: {
              wrapText: 'largest',
              distT: 10000,
              distB: 20000,
              distL: 30000,
              distR: 40000,
            },
          }),
        ]),
      );
      expect(pixelsToEmu).toHaveBeenCalledWith(10);
      expect(pixelsToEmu).toHaveBeenCalledWith(20);
      expect(pixelsToEmu).toHaveBeenCalledWith(30);
      expect(pixelsToEmu).toHaveBeenCalledWith(40);
    });

    it('should add wp:wrapTopAndBottom with distance attributes', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'TopAndBottom',
              attrs: {
                distTop: 15,
                distBottom: 25,
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapTopAndBottom',
            attributes: {
              distT: 15000,
              distB: 25000,
            },
          }),
        ]),
      );
      expect(pixelsToEmu).toHaveBeenCalledWith(15);
      expect(pixelsToEmu).toHaveBeenCalledWith(25);
    });

    it('should add wp:wrapTopAndBottom without attributes when no distance specified', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'TopAndBottom',
              attrs: {},
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapTopAndBottom',
          }),
        ]),
      );
      // Should not have attributes property when no distances specified
      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapTopAndBottom');
      expect(wrapElement.attributes).toBeUndefined();
    });

    it('should add wp:wrapTight with distance attributes', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Tight',
              attrs: {
                distLeft: 12,
                distRight: 18,
                distTop: 5,
                distBottom: 8,
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapTight',
            attributes: expect.objectContaining({
              distL: 12000,
              distR: 18000,
              distT: 5000,
              distB: 8000,
              wrapText: 'bothSides',
            }),
          }),
        ]),
      );
    });

    it('should add wp:wrapTight without attributes when no distance specified', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Tight',
              attrs: {},
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapTight',
          }),
        ]),
      );
      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapTight');
      expect(wrapElement.attributes).toEqual({ wrapText: 'bothSides' });
    });

    it('should add wp:wrapThrough with distance attributes', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Through',
              attrs: {
                distLeft: 7,
                distRight: 14,
                distTop: 3,
                distBottom: 6,
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapThrough',
            attributes: expect.objectContaining({
              distL: 7000,
              distR: 14000,
              distT: 3000,
              distB: 6000,
              wrapText: 'bothSides',
            }),
          }),
        ]),
      );
    });

    it('should add wp:wrapThrough without attributes when no distance specified', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Through',
              attrs: {},
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapThrough',
          }),
        ]),
      );
      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapThrough');
      expect(wrapElement.attributes).toEqual({ wrapText: 'bothSides' });
    });

    it('should add wp:wrapNone when wrap type is None', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'None',
              attrs: {},
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapNone',
          }),
        ]),
      );
    });

    it('should handle unknown wrap type by defaulting to None', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'UnknownType',
              attrs: {},
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'wp:wrapUnknownType',
          }),
        ]),
      );
    });

    it('should handle Tight wrap with polygon', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Tight',
              attrs: {
                distLeft: 5,
                distRight: 10,
                polygon: [
                  [1, 2],
                  [3, 4],
                  [5, 6],
                ],
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(objToPolygon).toHaveBeenCalledWith([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);

      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapTight');
      expect(wrapElement.attributes).toEqual({
        distL: 5000,
        distR: 10000,
        wrapText: 'bothSides',
      });
      expect(wrapElement.elements).toEqual([
        {
          name: 'wp:wrapPolygon',
          type: 'wp:wrapPolygon',
          attributes: { edited: '0' },
          elements: [
            { name: 'wp:start', type: 'wp:start', attributes: { x: 1000, y: 2000 } },
            { name: 'wp:lineTo', type: 'wp:lineTo', attributes: { x: 3000, y: 4000 } },
            { name: 'wp:lineTo', type: 'wp:lineTo', attributes: { x: 5000, y: 6000 } },
          ],
        },
      ]);
    });

    it('should handle Through wrap with polygon', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Through',
              attrs: {
                distTop: 8,
                distBottom: 12,
                polygon: [
                  [10, 20],
                  [30, 40],
                ],
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(objToPolygon).toHaveBeenCalledWith([
        [10, 20],
        [30, 40],
      ]);

      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapThrough');
      expect(wrapElement.attributes).toEqual({
        distT: 8000,
        distB: 12000,
        wrapText: 'bothSides',
      });
      expect(wrapElement.elements).toEqual([
        {
          name: 'wp:wrapPolygon',
          type: 'wp:wrapPolygon',
          attributes: { edited: '0' },
          elements: [
            { name: 'wp:start', type: 'wp:start', attributes: { x: 10000, y: 20000 } },
            { name: 'wp:lineTo', type: 'wp:lineTo', attributes: { x: 30000, y: 40000 } },
          ],
        },
      ]);
    });

    it('should honor provided wrapText value for tight wrap', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Tight',
              attrs: {
                wrapText: 'left',
                polygon: [
                  [1, 1],
                  [2, 2],
                ],
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapTight');
      expect(wrapElement.attributes).toEqual({
        wrapText: 'left',
      });
    });

    it('should preserve wp14 anchor metadata from original attributes', () => {
      const params = {
        node: {
          attrs: {
            originalAttributes: {
              'wp14:anchorId': '52C3A784',
              'wp14:editId': '36FE4467',
              relativeHeight: '251651584',
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.attributes['wp14:anchorId']).toBe('52C3A784');
      expect(result.attributes['wp14:editId']).toBe('36FE4467');
      expect(result.attributes.relativeHeight).toBe(251651584);
    });

    it('prefers live relativeHeight when it is a valid unsigned integer', () => {
      const params = {
        node: {
          attrs: {
            relativeHeight: 500,
            originalAttributes: {
              relativeHeight: '251651584',
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.attributes.relativeHeight).toBe(500);
    });

    it('falls back to original relativeHeight when live value is invalid', () => {
      const params = {
        node: {
          attrs: {
            relativeHeight: 1.5,
            originalAttributes: {
              relativeHeight: '251651584',
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.attributes.relativeHeight).toBe(251651584);
    });

    it('falls back to default relativeHeight=1 when both values are invalid', () => {
      const params = {
        node: {
          attrs: {
            relativeHeight: -1,
            originalAttributes: {
              relativeHeight: 'not-an-int',
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(result.attributes.relativeHeight).toBe(1);
    });

    it('should apply polygonEdited value when provided', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Tight',
              attrs: {
                polygon: [
                  [1, 2],
                  [3, 4],
                ],
                polygonEdited: '1',
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapTight');
      expect(wrapElement.elements?.[0].attributes).toEqual({ edited: '1' });
    });

    it('should not call objToPolygon for wrap types that do not support polygons', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Square',
              attrs: {
                wrapText: 'bothSides',
                polygon: [
                  [1, 2],
                  [3, 4],
                ], // polygon should be ignored for Square
              },
            },
          },
        },
      };

      translateAnchorNode(params);

      expect(objToPolygon).not.toHaveBeenCalled();
    });

    it('should handle case where objToPolygon returns null', () => {
      objToPolygon.mockReturnValueOnce(null);

      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Tight',
              attrs: {
                distLeft: 5,
                polygon: [
                  [1, 2],
                  [3, 4],
                ],
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      expect(objToPolygon).toHaveBeenCalledWith([
        [1, 2],
        [3, 4],
      ]);

      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapTight');
      expect(wrapElement.elements).toBeUndefined();
    });

    it('should handle Tight wrap with polygon but no distance attributes', () => {
      const params = {
        node: {
          attrs: {
            wrap: {
              type: 'Tight',
              attrs: {
                polygon: [
                  [5, 10],
                  [15, 20],
                ],
              },
            },
          },
        },
      };

      const result = translateAnchorNode(params);

      const wrapElement = result.elements.find((el) => el.name === 'wp:wrapTight');
      expect(wrapElement.attributes).toEqual({
        wrapText: 'bothSides',
      });
      expect(wrapElement.elements).toEqual([
        {
          name: 'wp:wrapPolygon',
          type: 'wp:wrapPolygon',
          attributes: { edited: '0' },
          elements: [
            { name: 'wp:start', type: 'wp:start', attributes: { x: 5000, y: 10000 } },
            { name: 'wp:lineTo', type: 'wp:lineTo', attributes: { x: 15000, y: 20000 } },
          ],
        },
      ]);
    });
  });
});
