import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translateInlineNode } from './translate-inline-node.js';
import { translateImageNode } from '../../helpers/decode-image-node-helpers.js';

vi.mock('@converter/v3/handlers/wp/helpers/decode-image-node-helpers.js', () => ({
  translateImageNode: vi.fn(),
}));

describe('translateInlineNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translateImageNode.mockReturnValue({
      attributes: {},
      elements: [{ name: 'wp:extent' }, { name: 'a:graphic' }],
    });
  });

  it('merges original drawing children based on original order', () => {
    const params = {
      node: {
        attrs: {
          drawingChildOrder: ['wp:simplePos', 'wp:extent', 'a:graphic'],
          originalDrawingChildren: [{ index: 0, xml: { name: 'wp:simplePos' } }],
        },
      },
    };

    const result = translateInlineNode(params);

    expect(result.elements[0]).toMatchObject({ name: 'wp:simplePos' });
    expect(result.elements[1]).toMatchObject({ name: 'wp:extent' });
  });

  it('falls back to generated elements when no order is provided', () => {
    const params = { node: { attrs: {} } };
    const result = translateInlineNode(params);

    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].name).toBe('wp:extent');
  });

  it('prefers original drawing children except for wp:extent', () => {
    translateImageNode.mockReturnValue({
      attributes: {},
      elements: [
        { name: 'wp:extent', attributes: { cx: 10 } },
        { name: 'wp:cNvGraphicFramePr', attributes: { generated: true } },
      ],
    });

    const params = {
      node: {
        attrs: {
          drawingChildOrder: ['wp:extent', 'wp:cNvGraphicFramePr'],
          originalDrawingChildren: [
            { index: 1, xml: { name: 'wp:cNvGraphicFramePr', attributes: { original: true } } },
          ],
        },
      },
    };

    const result = translateInlineNode(params);

    expect(result.elements[0]).toMatchObject({ name: 'wp:extent', attributes: { cx: 10 } });
    expect(result.elements[1]).toMatchObject({ name: 'wp:cNvGraphicFramePr', attributes: { original: true } });
  });
});
