import { describe, it, expect, vi } from 'vitest';
import {
  normalizeDocPartContent,
  handleDocPartObj,
  tableOfContentsHandler,
  genericDocPartHandler,
} from './handle-doc-part-obj.js';

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

  it('wraps commentRangeStart and commentRangeEnd in paragraphs', () => {
    const nodes = [
      { type: 'commentRangeStart', attrs: { id: '1' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'text' }] },
      { type: 'commentRangeEnd', attrs: { id: '1' } },
    ];
    const normalized = normalizeDocPartContent(nodes);
    expect(normalized).toEqual([
      { type: 'paragraph', content: [nodes[0]] },
      nodes[1],
      { type: 'paragraph', content: [nodes[2]] },
    ]);
  });

  it('wraps permStart and permEnd in paragraphs', () => {
    const nodes = [
      { type: 'permStart', attrs: { id: '1' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'protected' }] },
      { type: 'permEnd', attrs: { id: '1' } },
    ];
    const normalized = normalizeDocPartContent(nodes);
    expect(normalized).toEqual([
      { type: 'paragraph', content: [nodes[0]] },
      nodes[1],
      { type: 'paragraph', content: [nodes[2]] },
    ]);
  });

  it('handles empty input', () => {
    expect(normalizeDocPartContent([])).toEqual([]);
    expect(normalizeDocPartContent()).toEqual([]);
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

describe('genericDocPartHandler', () => {
  it('normalizes inline nodes in non-TOC docPartObj content', () => {
    const handler = vi.fn(() => [
      { type: 'bookmarkStart', attrs: { name: '_GoBack' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Page Numbers' }] },
      { type: 'bookmarkEnd', attrs: { name: '_GoBack' } },
    ]);
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '100' } },
        {
          name: 'w:docPartObj',
          elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Page Numbers (Bottom of Page)' } }],
        },
      ],
    };
    const contentNode = { name: 'w:sdtContent', elements: [] };
    const params = {
      nodes: [contentNode],
      nodeListHandler: { handler },
      extraParams: { sdtPr, docPartGalleryType: 'Page Numbers (Bottom of Page)' },
      path: [],
    };

    const result = genericDocPartHandler(params);

    expect(result.type).toEqual('documentPartObject');
    expect(result.content).toEqual([
      { type: 'paragraph', content: [{ type: 'bookmarkStart', attrs: { name: '_GoBack' } }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Page Numbers' }] },
      { type: 'paragraph', content: [{ type: 'bookmarkEnd', attrs: { name: '_GoBack' } }] },
    ]);
  });

  it('normalizes commentRangeStart/End in non-TOC docPartObj content', () => {
    const handler = vi.fn(() => [
      { type: 'commentRangeStart', attrs: { id: '5' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Bibliography' }] },
      { type: 'commentRangeEnd', attrs: { id: '5' } },
    ]);
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '200' } },
        {
          name: 'w:docPartObj',
          elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Bibliographies' } }],
        },
      ],
    };
    const contentNode = { name: 'w:sdtContent', elements: [] };
    const params = {
      nodes: [contentNode],
      nodeListHandler: { handler },
      extraParams: { sdtPr, docPartGalleryType: 'Bibliographies' },
      path: [],
    };

    const result = genericDocPartHandler(params);

    expect(result.content).toEqual([
      { type: 'paragraph', content: [{ type: 'commentRangeStart', attrs: { id: '5' } }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Bibliography' }] },
      { type: 'paragraph', content: [{ type: 'commentRangeEnd', attrs: { id: '5' } }] },
    ]);
  });

  it('leaves block-only content unchanged', () => {
    const handler = vi.fn(() => [{ type: 'paragraph', content: [{ type: 'text', text: 'Cover Page' }] }]);
    const sdtPr = {
      name: 'w:sdtPr',
      elements: [
        { name: 'w:id', attributes: { 'w:val': '300' } },
        {
          name: 'w:docPartObj',
          elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Cover Pages' } }],
        },
      ],
    };
    const contentNode = { name: 'w:sdtContent', elements: [] };
    const params = {
      nodes: [contentNode],
      nodeListHandler: { handler },
      extraParams: { sdtPr, docPartGalleryType: 'Cover Pages' },
      path: [],
    };

    const result = genericDocPartHandler(params);

    expect(result.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'Cover Page' }] }]);
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

// SD-1333: When an <w:sdt> with <w:docPartObj> appears INSIDE a <w:p> (an
// "inline" SDT — e.g. a Word footer where a Signature SDT wraps a paragraph
// that itself contains an inline `<w:sdt>` PAGE field), the importer must
// emit an INLINE PM node ('structuredContent'), not a block-level
// 'documentPartObject'. Otherwise the parent paragraph translator treats the
// docPartObj as a block sibling, lifts it out of the paragraph, and the
// PAGE field's `page-number` token loses its paragraph wrapper — so the
// resolver never finds it and the page number never renders.
describe('handleDocPartObj — inline context (SD-1333)', () => {
  it('returns an inline structuredContent node when sdtContent has no w:p or w:tbl', () => {
    // Build an inline SDT-with-docPartObj whose sdtContent contains only runs
    // (the shape Word emits for an inline PAGE field inside another SDT).
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [
            { name: 'w:id', attributes: { 'w:val': '42' } },
            {
              name: 'w:docPartObj',
              elements: [
                { name: 'w:docPartGallery', attributes: { 'w:val': 'Page Numbers (Bottom of Page)' } },
                { name: 'w:docPartUnique' },
              ],
            },
          ],
        },
        {
          name: 'w:sdtContent',
          elements: [
            { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
            { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: ' PAGE ' }] }] },
            { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
            { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
          ],
        },
      ],
    };

    const handler = vi.fn(() => [{ type: 'page-number', attrs: { marksAsAttrs: [] } }]);
    const params = { nodes: [node], nodeListHandler: { handler }, path: [{ name: 'w:p' }] };
    const result = handleDocPartObj(params);

    // The whole point of the fix: this is INLINE, not block.
    expect(result.type).toBe('structuredContent');
    // Round-trip metadata must still be there so export can re-emit the
    // <w:sdt><w:docPartObj/></w:sdt> wrapper unchanged.
    expect(result.attrs.docPartGallery).toBe('Page Numbers (Bottom of Page)');
    expect(result.attrs.docPartUnique).toBe(true);
    expect(result.attrs.sdtPr).toBeDefined();
    // Inline content survives.
    expect(result.content).toEqual([{ type: 'page-number', attrs: { marksAsAttrs: [] } }]);
  });

  it('still returns a block documentPartObject when sdtContent contains a w:p (existing behaviour)', () => {
    // Block-level SDT-with-docPartObj wrapping a real paragraph — must keep
    // its existing block semantics so the body cases (SD-1333a body,
    // top-level Page-Number SDTs in footers) keep working.
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [
            { name: 'w:id', attributes: { 'w:val': '7' } },
            {
              name: 'w:docPartObj',
              elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Page Numbers (Top of Page)' } }],
            },
          ],
        },
        {
          name: 'w:sdtContent',
          elements: [{ name: 'w:p', elements: [] }],
        },
      ],
    };

    const handler = vi.fn(() => [{ type: 'paragraph', content: [{ type: 'page-number' }] }]);
    const params = { nodes: [node], nodeListHandler: { handler }, path: [{ name: 'w:body' }] };
    const result = handleDocPartObj(params);

    expect(result.type).toBe('documentPartObject');
  });

  it('returns a block documentPartObject when path is block context, even if sdtContent has only a nested w:sdt', () => {
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [
            { name: 'w:id', attributes: { 'w:val': '99' } },
            {
              name: 'w:docPartObj',
              elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Custom Outer' } }],
            },
          ],
        },
        {
          name: 'w:sdtContent',
          // No direct w:p / w:tbl — only a nested SDT wrapper. The nested
          // SDT itself contains the visible paragraph, so structurally this
          // IS block-level content; only the direct-child shape hides it.
          elements: [
            {
              name: 'w:sdt',
              elements: [
                { name: 'w:sdtPr', elements: [{ name: 'w:id', attributes: { 'w:val': '100' } }] },
                { name: 'w:sdtContent', elements: [{ name: 'w:p', elements: [] }] },
              ],
            },
          ],
        },
      ],
    };

    const handler = vi.fn(() => [{ type: 'documentPartObject', content: [], attrs: {} }]);
    // path explicitly indicates a block context (no w:p ancestor).
    const params = { nodes: [node], nodeListHandler: { handler }, path: [{ name: 'w:body' }] };
    const result = handleDocPartObj(params);

    expect(result.type).toBe('documentPartObject');
  });

  it('defaults id to null (not "") when sdtPr has no w:id element', () => {
    const node = {
      name: 'w:sdt',
      elements: [
        {
          name: 'w:sdtPr',
          elements: [
            // No w:id element on purpose.
            {
              name: 'w:docPartObj',
              elements: [{ name: 'w:docPartGallery', attributes: { 'w:val': 'Page Numbers (Bottom of Page)' } }],
            },
          ],
        },
        {
          name: 'w:sdtContent',
          elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'x' }] }] }],
        },
      ],
    };

    const handler = vi.fn(() => []);
    // Inline context (path has w:p) so inlineDocPartHandler runs.
    const params = { nodes: [node], nodeListHandler: { handler }, path: [{ name: 'w:p' }] };
    const result = handleDocPartObj(params);

    expect(result.type).toBe('structuredContent');
    expect(result.attrs.id).toBeNull();
  });
});
