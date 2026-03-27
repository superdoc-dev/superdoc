import { describe, expect, it } from 'vitest';
import { mergeDrawingChildren } from './merge-drawing-children.js';

describe('mergeDrawingChildren', () => {
  describe('wp:extent handling', () => {
    it('always uses generated wp:extent even when original exists', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr'],
        generated: [{ name: 'wp:extent', attributes: { cx: 100, cy: 200 } }],
        original: [{ index: 0, xml: { name: 'wp:extent', attributes: { cx: 999, cy: 999 } } }],
      });

      expect(result[0]).toMatchObject({ name: 'wp:extent', attributes: { cx: 100, cy: 200 } });
    });

    it('uses generated wp:extent at correct position in order', () => {
      const result = mergeDrawingChildren({
        order: ['wp:simplePos', 'wp:extent', 'a:graphic'],
        generated: [
          { name: 'wp:simplePos', attributes: {} },
          { name: 'wp:extent', attributes: { cx: 50 } },
          { name: 'a:graphic', attributes: {} },
        ],
        original: [],
      });

      expect(result[0].name).toBe('wp:simplePos');
      expect(result[1]).toMatchObject({ name: 'wp:extent', attributes: { cx: 50 } });
      expect(result[2].name).toBe('a:graphic');
    });
  });

  describe('original children preference', () => {
    it('prefers original children at their recorded index', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr', 'a:graphic'],
        generated: [
          { name: 'wp:extent', attributes: { cx: 100 } },
          { name: 'wp:docPr', attributes: { id: 'generated' } },
          { name: 'a:graphic', attributes: { new: 'value' } },
        ],
        original: [
          { index: 1, xml: { name: 'wp:docPr', attributes: { id: 'original' } } },
          { index: 2, xml: { name: 'a:graphic', attributes: { from: 'original' } } },
        ],
      });

      expect(result[0]).toMatchObject({ name: 'wp:extent', attributes: { cx: 100 } });
      expect(result[1]).toMatchObject({ name: 'wp:docPr', attributes: { id: 'original' } });
      expect(result[2]).toMatchObject({ name: 'a:graphic', attributes: { from: 'original' } });
    });

    it('drops generated elements when original exists at same index', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr'],
        generated: [
          { name: 'wp:extent', attributes: {} },
          { name: 'wp:docPr', attributes: { generated: true } },
        ],
        original: [{ index: 1, xml: { name: 'wp:docPr', attributes: { original: true } } }],
      });

      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({ name: 'wp:docPr', attributes: { original: true } });
    });
  });

  describe('unhandled children preservation', () => {
    it('preserves unhandled original children not in generated', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp14:sizeRelH', 'wp:docPr'],
        generated: [
          { name: 'wp:extent', attributes: {} },
          { name: 'wp:docPr', attributes: {} },
        ],
        original: [{ index: 1, xml: { name: 'wp14:sizeRelH', attributes: { relativeFrom: 'page' } } }],
      });

      expect(result[1]).toMatchObject({ name: 'wp14:sizeRelH', attributes: { relativeFrom: 'page' } });
    });

    it('appends extra generated elements not in order', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent'],
        generated: [
          { name: 'wp:extent', attributes: {} },
          { name: 'wp:effectExtent', attributes: { l: 0, r: 0 } },
        ],
        original: [],
      });

      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({ name: 'wp:effectExtent' });
    });
  });

  describe('edge cases', () => {
    it('handles empty order array', () => {
      const result = mergeDrawingChildren({
        order: [],
        generated: [{ name: 'wp:extent', attributes: {} }],
        original: [],
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('wp:extent');
    });

    it('handles empty generated array', () => {
      const result = mergeDrawingChildren({
        order: ['wp:docPr'],
        generated: [],
        original: [{ index: 0, xml: { name: 'wp:docPr', attributes: { id: 1 } } }],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: 'wp:docPr', attributes: { id: 1 } });
    });

    it('handles empty original array', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr'],
        generated: [
          { name: 'wp:extent', attributes: {} },
          { name: 'wp:docPr', attributes: {} },
        ],
        original: [],
      });

      expect(result).toHaveLength(2);
    });

    it('handles undefined/null entries in original gracefully', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr'],
        generated: [{ name: 'wp:extent', attributes: {} }],
        original: [null, undefined, { index: 1, xml: { name: 'wp:docPr', attributes: {} } }],
      });

      expect(result).toHaveLength(2);
    });

    it('handles generated elements with no name', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent'],
        generated: [{ name: 'wp:extent', attributes: {} }, null, { attributes: {} }, undefined],
        original: [],
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('wp:extent');
    });

    it('handles all parameters undefined', () => {
      const result = mergeDrawingChildren({
        order: undefined,
        generated: undefined,
        original: undefined,
      });

      expect(result).toEqual([]);
    });
  });

  describe('order preservation', () => {
    it('maintains original order when merging', () => {
      const result = mergeDrawingChildren({
        order: ['wp:simplePos', 'wp:positionH', 'wp:positionV', 'wp:extent', 'wp:docPr', 'a:graphic'],
        generated: [
          { name: 'wp:simplePos', attributes: {} },
          { name: 'wp:positionH', attributes: {} },
          { name: 'wp:positionV', attributes: {} },
          { name: 'wp:extent', attributes: { cx: 100 } },
          { name: 'wp:docPr', attributes: {} },
          { name: 'a:graphic', attributes: {} },
        ],
        original: [],
      });

      expect(result.map((el) => el.name)).toEqual([
        'wp:simplePos',
        'wp:positionH',
        'wp:positionV',
        'wp:extent',
        'wp:docPr',
        'a:graphic',
      ]);
    });

    it('inserts preserved children at correct positions', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp14:sizeRelH', 'wp14:sizeRelV', 'wp:docPr'],
        generated: [
          { name: 'wp:extent', attributes: {} },
          { name: 'wp:docPr', attributes: {} },
        ],
        original: [
          { index: 1, xml: { name: 'wp14:sizeRelH', attributes: { relativeFrom: 'margin' } } },
          { index: 2, xml: { name: 'wp14:sizeRelV', attributes: { relativeFrom: 'margin' } } },
        ],
      });

      expect(result.map((el) => el.name)).toEqual(['wp:extent', 'wp14:sizeRelH', 'wp14:sizeRelV', 'wp:docPr']);
    });
  });

  describe('zero drawing ID fix', () => {
    it('patches wp:docPr id=0 using the generated ID', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr', 'a:graphic'],
        generated: [
          { name: 'wp:extent', attributes: { cx: 100 } },
          { name: 'wp:docPr', attributes: { id: 42, name: 'Picture 1' } },
          { name: 'a:graphic', attributes: {} },
        ],
        original: [
          { index: 1, xml: { name: 'wp:docPr', attributes: { id: 0, name: 'Picture 1', descr: 'alt text' } } },
          { index: 2, xml: { name: 'a:graphic', attributes: {} } },
        ],
      });

      const docPr = result.find((el) => el.name === 'wp:docPr');
      expect(docPr.attributes.id).toBe(42);
      expect(docPr.attributes.descr).toBe('alt text');
    });

    it('patches pic:cNvPr id=0 inside original a:graphic subtree', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr', 'a:graphic'],
        generated: [
          { name: 'wp:extent', attributes: { cx: 100 } },
          { name: 'wp:docPr', attributes: { id: 7 } },
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
                        name: 'pic:nvPicPr',
                        elements: [{ name: 'pic:cNvPr', attributes: { id: 7 } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        original: [
          { index: 1, xml: { name: 'wp:docPr', attributes: { id: 0 } } },
          {
            index: 2,
            xml: {
              name: 'a:graphic',
              elements: [
                {
                  name: 'a:graphicData',
                  elements: [
                    {
                      name: 'pic:pic',
                      elements: [
                        {
                          name: 'pic:nvPicPr',
                          elements: [{ name: 'pic:cNvPr', attributes: { id: 0, name: 'Original' } }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      });

      const graphic = result.find((el) => el.name === 'a:graphic');
      const cNvPr = graphic.elements[0].elements[0].elements[0].elements[0];
      expect(cNvPr.attributes.id).toBe(7);
      expect(cNvPr.attributes.name).toBe('Original');
    });

    it('does not overwrite valid positive IDs on originals', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr'],
        generated: [
          { name: 'wp:extent', attributes: {} },
          { name: 'wp:docPr', attributes: { id: 99 } },
        ],
        original: [{ index: 1, xml: { name: 'wp:docPr', attributes: { id: 5 } } }],
      });

      const docPr = result.find((el) => el.name === 'wp:docPr');
      expect(docPr.attributes.id).toBe(5);
    });

    it('handles missing generated wp:docPr gracefully', () => {
      const result = mergeDrawingChildren({
        order: ['wp:extent', 'wp:docPr'],
        generated: [{ name: 'wp:extent', attributes: {} }],
        original: [{ index: 1, xml: { name: 'wp:docPr', attributes: { id: 0 } } }],
      });

      const docPr = result.find((el) => el.name === 'wp:docPr');
      expect(docPr.attributes.id).toBe(0);
    });
  });

  describe('deep copy behavior', () => {
    it('returns deep copies, not references to original objects', () => {
      const originalXml = { name: 'wp:docPr', attributes: { id: 1 } };
      const result = mergeDrawingChildren({
        order: ['wp:docPr'],
        generated: [],
        original: [{ index: 0, xml: originalXml }],
      });

      result[0].attributes.id = 999;
      expect(originalXml.attributes.id).toBe(1);
    });

    it('returns deep copies of generated elements', () => {
      const generatedEl = { name: 'wp:extent', attributes: { cx: 100 } };
      const result = mergeDrawingChildren({
        order: ['wp:extent'],
        generated: [generatedEl],
        original: [],
      });

      result[0].attributes.cx = 999;
      expect(generatedEl.attributes.cx).toBe(100);
    });
  });
});
