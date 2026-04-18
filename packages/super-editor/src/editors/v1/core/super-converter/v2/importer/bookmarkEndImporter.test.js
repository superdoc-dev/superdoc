import { describe, it, expect } from 'vitest';
import { handleBookmarkEndNode } from './bookmarkEndImporter.js';

const baseParams = {
  docx: {},
  converter: {},
  editor: {},
  nodeListHandler: {
    handler: () => [],
    handlerEntities: [],
  },
  path: [],
};

describe('handleBookmarkEndNode', () => {
  it('returns empty result when node list is empty', () => {
    expect(handleBookmarkEndNode({ ...baseParams, nodes: [] })).toEqual({ nodes: [], consumed: 0 });
  });

  it('encodes bookmark end nodes via translator', () => {
    const bookmarkEndNode = {
      name: 'w:bookmarkEnd',
      attributes: {
        'w:id': '42',
        'w:displacedByCustomXml': 'next',
      },
    };

    const result = handleBookmarkEndNode({ ...baseParams, nodes: [bookmarkEndNode] });

    expect(result).toEqual({
      nodes: [
        {
          type: 'bookmarkEnd',
          attrs: {
            id: '42',
            displacedByCustomXml: 'next',
          },
        },
      ],
      consumed: 1,
    });
  });
});
