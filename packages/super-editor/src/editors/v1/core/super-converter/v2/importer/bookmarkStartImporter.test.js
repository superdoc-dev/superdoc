import { describe, it, expect, vi } from 'vitest';
import { handleBookmarkStartNode } from './bookmarkStartImporter.js';

const baseParams = () => ({
  docx: {},
  converter: {},
  editor: {
    extensionService: {
      extensions: [],
    },
  },
  nodeListHandler: {
    handler: vi.fn(),
    handlerEntities: [],
  },
  path: [],
});

describe('handleBookmarkStartNode', () => {
  it('encodes regular bookmark start nodes', () => {
    const params = baseParams();
    const node = {
      name: 'w:bookmarkStart',
      attributes: {
        'w:id': '10',
        'w:name': 'bookmark-1',
      },
    };

    const result = handleBookmarkStartNode({ ...params, nodes: [node] });

    expect(result).toEqual({
      nodes: [
        {
          type: 'bookmarkStart',
          attrs: {
            id: '10',
            name: 'bookmark-1',
          },
        },
      ],
      consumed: 1,
    });
  });

  it('delegates to legacy custom mark handling when bookmark represents a custom mark', () => {
    const params = baseParams();
    const customMark = { name: 'highlightRange', isExternal: true };
    params.editor.extensionService.extensions = [customMark];

    const textRun = { name: 'w:r', elements: [], attributes: {} };
    params.nodeListHandler.handler.mockImplementation(({ nodes }) => {
      expect(nodes).toEqual([textRun]);
      return [
        {
          type: 'text',
          text: 'example',
          marks: [],
        },
      ];
    });

    const bookmarkStart = {
      name: 'w:bookmarkStart',
      attributes: {
        'w:id': '5000',
        'w:name': 'highlightRange;color=yellow;',
      },
    };
    const bookmarkEnd = {
      name: 'w:bookmarkEnd',
      attributes: {
        'w:id': '5000',
      },
    };

    const result = handleBookmarkStartNode({
      ...params,
      nodes: [bookmarkStart, textRun, bookmarkEnd],
    });

    expect(result.consumed).toBe(3);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      type: 'text',
      marks: [
        {
          type: 'highlightRange',
          attrs: { color: 'yellow' },
        },
      ],
    });
  });

  it('treats bookmarks without custom mark payload as regular bookmarks even if name matches extension', () => {
    const params = baseParams();
    const customMark = { name: 'highlightRange', isExternal: true };
    params.editor.extensionService.extensions = [customMark];

    const node = {
      name: 'w:bookmarkStart',
      attributes: {
        'w:id': '10',
        'w:name': 'highlightRange',
      },
    };

    const result = handleBookmarkStartNode({ ...params, nodes: [node] });

    expect(result).toEqual({
      nodes: [
        {
          type: 'bookmarkStart',
          attrs: {
            id: '10',
            name: 'highlightRange',
          },
        },
      ],
      consumed: 1,
    });
  });
});
