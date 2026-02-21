import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHandler = vi.fn();

vi.mock('../../v3/handlers/w/pict/helpers/pict-node-type-strategy', () => ({
  pictNodeTypeStrategy: vi.fn(),
}));

import { handlePictNode } from './pictNodeImporter.js';
import { pictNodeTypeStrategy } from '../../v3/handlers/w/pict/helpers/pict-node-type-strategy';

describe('handlePictNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pictNodeTypeStrategy.mockReturnValue({ type: 'unknown', handler: null });
  });

  it('returns consumed: 0 when nodes array is empty', () => {
    const result = handlePictNode({ nodes: [] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('returns consumed: 0 when params.nodes is missing', () => {
    const result = handlePictNode({});
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('returns consumed: 0 when first node is not w:pict', () => {
    const result = handlePictNode({ nodes: [{ name: 'w:p' }] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('returns consumed: 0 when strategy returns unknown type', () => {
    pictNodeTypeStrategy.mockReturnValue({ type: 'unknown', handler: null });
    const result = handlePictNode({ nodes: [{ name: 'w:pict', elements: [] }] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('returns consumed: 0 when handler returns null', () => {
    mockHandler.mockReturnValue(null);
    pictNodeTypeStrategy.mockReturnValue({ type: 'image', handler: mockHandler });
    const result = handlePictNode({ nodes: [{ name: 'w:pict', elements: [] }] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('calls the strategy handler and returns the result wrapped in nodes array', () => {
    const imageResult = { type: 'image', attrs: { src: 'test.png' } };
    mockHandler.mockReturnValue(imageResult);
    pictNodeTypeStrategy.mockReturnValue({ type: 'image', handler: mockHandler });

    const pictNode = { name: 'w:pict', elements: [] };
    const params = { nodes: [pictNode], filename: 'document.xml' };
    const result = handlePictNode(params);

    expect(mockHandler).toHaveBeenCalledWith({ params, pict: pictNode });
    expect(result).toEqual({ nodes: [imageResult], consumed: 1 });
  });

  it('passes through an array result from the handler without re-wrapping', () => {
    const multiResult = [
      { type: 'image', attrs: { src: 'a.png' } },
      { type: 'image', attrs: { src: 'b.png' } },
    ];
    mockHandler.mockReturnValue(multiResult);
    pictNodeTypeStrategy.mockReturnValue({ type: 'image', handler: mockHandler });

    const result = handlePictNode({ nodes: [{ name: 'w:pict', elements: [] }] });
    expect(result).toEqual({ nodes: multiResult, consumed: 1 });
  });

  it('does not return block shapeContainer nodes from run-level pict parsing', () => {
    const shapeContainerResult = {
      type: 'shapeContainer',
      attrs: { attributes: { id: '_x0000_s1026' } },
      content: [{ type: 'paragraph', content: [] }],
    };
    mockHandler.mockReturnValue(shapeContainerResult);
    pictNodeTypeStrategy.mockReturnValue({ type: 'shapeContainer', handler: mockHandler });

    const result = handlePictNode({
      nodes: [{ name: 'w:pict', elements: [] }],
      path: ['w:document', 'w:body', 'w:p', 'w:r'],
    });

    expect(result).toEqual({ nodes: [], consumed: 0 });
  });
});
