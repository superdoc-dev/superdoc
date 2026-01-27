import { describe, it, expect, vi } from 'vitest';
import { handlePictNode } from './pictNodeImporter.js';

vi.mock('../../v3/handlers/w/pict/pict-translator', () => ({
  translator: {
    encode: vi.fn(),
  },
}));

vi.mock('../../v3/handlers/w/pPr', () => ({
  translator: {
    encode: vi.fn(() => ({ jc: 'center' })),
  },
}));

vi.mock('./importerHelpers.js', () => ({
  parseProperties: vi.fn(() => ({ attributes: { testAttr: 'value' } })),
}));

import { translator as pictTranslator } from '../../v3/handlers/w/pict/pict-translator';

const createPNodeWithPict = (pictResult, pPrElements = [], rsidRDefault = '00AB1234') => ({
  name: 'w:p',
  attributes: { 'w:rsidRDefault': rsidRDefault },
  elements: [
    ...(pPrElements.length ? [{ name: 'w:pPr', elements: pPrElements }] : []),
    {
      name: 'w:r',
      elements: [{ name: 'w:pict', elements: [] }],
    },
  ],
});

describe('handlePictNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when nodes array is empty', () => {
    const result = handlePictNode({ nodes: [] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('returns empty result when first node is not w:p', () => {
    const result = handlePictNode({ nodes: [{ name: 'w:r' }] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('returns empty result when paragraph has no w:pict element', () => {
    const pNode = {
      name: 'w:p',
      elements: [{ name: 'w:r', elements: [{ name: 'w:t' }] }],
    };
    const result = handlePictNode({ nodes: [pNode] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('returns empty result when pictTranslator returns null', () => {
    pictTranslator.encode.mockReturnValue(null);
    const pNode = createPNodeWithPict(null);
    const result = handlePictNode({ nodes: [pNode] });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('wraps image result in a paragraph node', () => {
    const imageResult = { type: 'image', attrs: { src: 'test.png' } };
    pictTranslator.encode.mockReturnValue(imageResult);

    const pNode = createPNodeWithPict(imageResult);
    const result = handlePictNode({ nodes: [pNode], filename: 'document.xml' });

    expect(result.consumed).toBe(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].type).toBe('paragraph');
    expect(result.nodes[0].content).toEqual([imageResult]);
    expect(result.nodes[0].marks).toEqual([]);
    expect(result.nodes[0].attrs.rsidRDefault).toBe('00AB1234');
    expect(result.nodes[0].attrs.filename).toBe('document.xml');
  });

  it('wraps contentBlock result in a paragraph node', () => {
    const contentBlockResult = { type: 'contentBlock', attrs: { id: '123' } };
    pictTranslator.encode.mockReturnValue(contentBlockResult);

    const pNode = createPNodeWithPict(contentBlockResult);
    const result = handlePictNode({ nodes: [pNode] });

    expect(result.nodes[0].type).toBe('paragraph');
    expect(result.nodes[0].content).toEqual([contentBlockResult]);
  });

  it('does not wrap non-inline results (e.g., passthroughBlock)', () => {
    const passthroughResult = { type: 'passthroughBlock', attrs: { originalName: 'w:pict' } };
    pictTranslator.encode.mockReturnValue(passthroughResult);

    const pNode = createPNodeWithPict(passthroughResult);
    const result = handlePictNode({ nodes: [pNode] });

    expect(result.consumed).toBe(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toEqual(passthroughResult);
  });

  it('includes paragraph properties from w:pPr in wrapped paragraph attrs', () => {
    const imageResult = { type: 'image', attrs: { src: 'test.png' } };
    pictTranslator.encode.mockReturnValue(imageResult);

    const pNode = createPNodeWithPict(imageResult, [{ name: 'w:jc', attributes: { 'w:val': 'center' } }]);
    const result = handlePictNode({ nodes: [pNode] });

    expect(result.nodes[0].attrs.paragraphProperties).toEqual({ jc: 'center' });
  });

  it('includes testAttr from parseProperties in wrapped paragraph attrs', () => {
    const imageResult = { type: 'image', attrs: { src: 'test.png' } };
    pictTranslator.encode.mockReturnValue(imageResult);

    const pNode = createPNodeWithPict(imageResult);
    const result = handlePictNode({ nodes: [pNode] });

    expect(result.nodes[0].attrs.testAttr).toBe('value');
  });
});
