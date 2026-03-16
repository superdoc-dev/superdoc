import { describe, it, expect, vi } from 'vitest';
import { normalizeDocPartContent, handleDocPartObj, tableOfContentsHandler } from './handle-doc-part-obj.js';

describe('normalizeDocPartContent', () => {
  it('wraps inline bookmark nodes in paragraphs', () => {
    const nodes = [
      { type: 'bookmarkStart', attrs: { name: 'bm1' } },
      { type: 'bookmarkEnd', attrs: { name: 'bm1' } },
    ];
    const normalized = normalizeDocPartContent(nodes);
    expect(normalized).toEqual([
      { type: 'paragraph', content: [nodes[0]] },
      { type: 'paragraph', content: [nodes[1]] },
    ]);
  });

  it('leaves existing block nodes untouched', () => {
    const nodes = [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }];
    const normalized = normalizeDocPartContent(nodes);
    expect(normalized).toEqual(nodes);
  });

  it('mixes block nodes and wrapped inline nodes', () => {
    const nodes = [
      { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
      { type: 'bookmarkStart', attrs: { name: 'bm1' } },
    ];
    const normalized = normalizeDocPartContent(nodes);
    expect(normalized).toEqual([nodes[0], { type: 'paragraph', content: [nodes[1]] }]);
  });
});

describe('handleDocPartObj', () => {
  const mockNodeListHandler = {
    handler: vi.fn(() => [{ type: 'paragraph', content: [{ type: 'text', text: 'TOC Content' }] }]),
  };

  const createSdtNode = (docPartGalleryType) => ({
    name: 'w:sdt',
    elements: [
      {
        name: 'w:sdtPr',
        elements: [
          {
            name: 'w:docPartObj',
            elements: [
              {
                name: 'w:docPartGallery',
                attributes: { 'w:val': docPartGalleryType },
              },
            ],
          },
          { name: 'w:id', attributes: { 'w:val': '123' } },
        ],
      },
      {
        name: 'w:sdtContent',
        elements: [{ name: 'w:p', elements: [] }],
      },
    ],
  });

  it('should return null if nodes array is empty', () => {
    const params = { nodes: [] };
    const result = handleDocPartObj(params);
    expect(result).toBeNull();
  });

  it('should return null if the first node is not w:sdt', () => {
    const params = { nodes: [{ name: 'w:p', elements: [] }] };
    const result = handleDocPartObj(params);
    expect(result).toBeNull();
  });

  it('should use generic handler for unsupported docPartGalleryType', () => {
    const node = createSdtNode('UnsupportedType');
    const params = { nodes: [node], nodeListHandler: mockNodeListHandler, path: [] };
    const result = handleDocPartObj(params);

    // Generic handler processes unsupported types for round-trip preservation
    expect(result.type).toEqual('documentPartObject');
    expect(result.attrs.docPartGallery).toEqual('UnsupportedType');
    expect(result.attrs.sdtPr).toBeDefined(); // Passthrough for round-trip
    expect(result.attrs.sdtPr).toHaveProperty('elements');
  });

  it('should call the correct handler for a supported docPartGalleryType', () => {
    const node = createSdtNode('Table of Contents');
    const params = { nodes: [node], nodeListHandler: mockNodeListHandler, path: [] };
    const result = handleDocPartObj(params);
    expect(mockNodeListHandler.handler).toHaveBeenCalled();
    expect(result.type).toEqual('documentPartObject');
    expect(result.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'TOC Content' }] }]);
    expect(result.attrs.id).toEqual('123');
    expect(result.attrs.docPartGallery).toEqual('Table of Contents');
    expect(result.attrs.docPartUnique).toEqual(false); // No w:docPartUnique element in mock
    expect(result.attrs.sdtPr).toBeDefined(); // Passthrough for round-trip
    expect(result.attrs.sdtPr).toHaveProperty('elements');
  });

  it('should set docPartGallery to null when missing and preserve sdtPr', () => {
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [
            { name: 'w:docPartObj', elements: [] },
            { name: 'w:id', attributes: { 'w:val': '123' } },
          ],
        },
        { name: 'w:sdtContent', elements: [{ name: 'w:p', elements: [] }] },
      ],
    };

    const params = { nodes: [node], nodeListHandler: mockNodeListHandler, path: [] };
    const result = handleDocPartObj(params);

    expect(result.attrs.docPartGallery).toBeNull();
    expect(result.attrs.sdtPr).toBeDefined();
    expect(result.attrs.sdtPr.elements.find((el) => el.name === 'w:docPartObj')).toBeDefined();
  });
});

describe('tableOfContentsHandler', () => {
  const mockNodeListHandler = {
    handler: vi.fn(() => [{ type: 'paragraph', content: [{ type: 'text', text: 'TOC Content' }] }]),
  };

  it('should process a Table of Contents node correctly', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '456' } },
        {
          name: 'w:docPartObj',
          elements: [
            { name: 'w:docPartGallery', attributes: { 'w:val': 'Table of Contents' } },
            { name: 'w:docPartUnique' },
          ],
        },
      ],
    };
    const contentNode = {
      name: 'w:sdtContent',
      elements: [{ name: 'w:p', elements: [] }],
    };
    const params = {
      nodes: [contentNode],
      nodeListHandler: mockNodeListHandler,
      extraParams: { sdtPr },
      path: [],
    };

    const result = tableOfContentsHandler(params);

    expect(mockNodeListHandler.handler).toHaveBeenCalledWith({
      ...params,
      nodes: contentNode.elements,
      path: [contentNode],
    });
    expect(result.type).toEqual('documentPartObject');
    expect(result.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'TOC Content' }] }]);
    expect(result.attrs.id).toEqual('456');
    expect(result.attrs.docPartGallery).toEqual('Table of Contents');
    expect(result.attrs.docPartUnique).toEqual(true);
    expect(result.attrs.sdtPr).toBeDefined(); // Passthrough for round-trip
    expect(result.attrs.sdtPr).toHaveProperty('elements');
  });

  it('hoists nested sd:tableOfContents blocks out of wrapper paragraphs', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '456' } },
        {
          name: 'w:docPartObj',
          elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Table of Contents' } }],
        },
      ],
    };
    const contentNode = {
      name: 'w:sdtContent',
      elements: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Table of Contents' }] }] },
          ],
        },
        {
          name: 'w:p',
          elements: [
            { name: 'sd:tableOfContents', attributes: { instruction: 'TOC \\o "1-1" \\h \\z \\u' }, elements: [] },
          ],
        },
      ],
    };
    const handler = vi.fn(({ nodes }) => {
      const node = nodes[0];
      if (node.name === 'sd:tableOfContents') {
        return [{ type: 'tableOfContents', attrs: { instruction: node.attributes.instruction }, content: [] }];
      }
      return [{ type: 'paragraph', content: [{ type: 'text', text: 'Table of Contents' }] }];
    });
    const params = {
      nodes: [contentNode],
      nodeListHandler: { handler },
      extraParams: { sdtPr },
      path: [],
    };

    const result = tableOfContentsHandler(params);

    expect(result.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Table of Contents' }] },
      { type: 'tableOfContents', attrs: { instruction: 'TOC \\o "1-1" \\h \\z \\u' }, content: [] },
    ]);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [{ name: 'sd:tableOfContents', attributes: { instruction: 'TOC \\o "1-1" \\h \\z \\u' }, elements: [] }],
      }),
    );
  });

  it('does not emit an empty paragraph when the wrapper only contains pPr and sd:tableOfContents', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '456' } },
        {
          name: 'w:docPartObj',
          elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Table of Contents' } }],
        },
      ],
    };
    const contentNode = {
      name: 'w:sdtContent',
      elements: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:pPr', elements: [] },
            { name: 'sd:tableOfContents', attributes: { instruction: 'TOC \\o "1-1" \\h \\z \\u' }, elements: [] },
          ],
        },
      ],
    };
    const handler = vi.fn(({ nodes }) => {
      const node = nodes[0];
      if (node.name === 'sd:tableOfContents') {
        return [{ type: 'tableOfContents', attrs: { instruction: node.attributes.instruction }, content: [] }];
      }
      return [{ type: 'paragraph', content: [] }];
    });
    const params = {
      nodes: [contentNode],
      nodeListHandler: { handler },
      extraParams: { sdtPr },
      path: [],
    };

    const result = tableOfContentsHandler(params);

    expect(result.content).toEqual([
      { type: 'tableOfContents', attrs: { instruction: 'TOC \\o "1-1" \\h \\z \\u' }, content: [] },
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('preserves paragraph content when a wrapper paragraph contains text and sd:tableOfContents', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '456' } },
        {
          name: 'w:docPartObj',
          elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Table of Contents' } }],
        },
      ],
    };
    const contentNode = {
      name: 'w:sdtContent',
      elements: [
        {
          name: 'w:p',
          elements: [
            { name: 'w:pPr', elements: [] },
            { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Intro text' }] }] },
            { name: 'sd:tableOfContents', attributes: { instruction: 'TOC \\o "1-1" \\h \\z \\u' }, elements: [] },
          ],
        },
      ],
    };
    const handler = vi.fn(({ nodes }) => {
      const node = nodes[0];
      if (node.name === 'sd:tableOfContents') {
        return [{ type: 'tableOfContents', attrs: { instruction: node.attributes.instruction }, content: [] }];
      }
      return [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro text' }] }];
    });
    const params = {
      nodes: [contentNode],
      nodeListHandler: { handler },
      extraParams: { sdtPr },
      path: [],
    };

    const result = tableOfContentsHandler(params);

    expect(result.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro text' }] },
      { type: 'tableOfContents', attrs: { instruction: 'TOC \\o "1-1" \\h \\z \\u' }, content: [] },
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should handle empty sdtPr.elements array', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [],
    };
    const contentNode = {
      name: 'w:sdtContent',
      elements: [{ name: 'w:p', elements: [] }],
    };
    const params = {
      nodes: [contentNode],
      nodeListHandler: mockNodeListHandler,
      extraParams: { sdtPr },
      path: [],
    };

    const result = tableOfContentsHandler(params);

    expect(result.type).toEqual('documentPartObject');
    expect(result.attrs.id).toEqual('');
    expect(result.attrs.docPartUnique).toEqual(false); // Default to false per OOXML spec
    expect(result.attrs.sdtPr).toBeDefined();
  });

  it('should handle null/undefined docPartObj gracefully', () => {
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [{ name: 'w:id', attributes: { 'w:val': '789' } }],
    };
    const contentNode = {
      name: 'w:sdtContent',
      elements: [{ name: 'w:p', elements: [] }],
    };
    const params = {
      nodes: [contentNode],
      nodeListHandler: mockNodeListHandler,
      extraParams: { sdtPr },
      path: [],
    };

    const result = tableOfContentsHandler(params);

    expect(result.type).toEqual('documentPartObject');
    expect(result.attrs.id).toEqual('789');
    expect(result.attrs.docPartUnique).toEqual(false); // Default to false when docPartObj is missing
    expect(result.attrs.sdtPr).toBeDefined();
  });
});
