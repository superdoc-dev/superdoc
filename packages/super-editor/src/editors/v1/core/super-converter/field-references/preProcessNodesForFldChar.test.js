// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preProcessNodesForFldChar } from './preProcessNodesForFldChar.js';
import { generateDocxRandomId } from '@helpers/generateDocxRandomId.js';

vi.mock('@helpers/generateDocxRandomId.js', () => ({
  generateDocxRandomId: vi.fn(),
}));

describe('preProcessNodesForFldChar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateDocxRandomId.mockReturnValue('abc12345');
  });

  const mockDocx = {
    'word/_rels/document.xml.rels': {
      elements: [{ name: 'Relationships', elements: [] }],
    },
  };

  it('should process a simple hyperlink field', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
    ];
    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);
    expect(processedNodes).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'r:id': 'rIdabc12345' },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
      },
    ]);
    expect(mockDocx['word/_rels/document.xml.rels'].elements[0].elements).toEqual([
      {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: 'rIdabc12345',
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          Target: 'http://example.com',
          TargetMode: 'External',
        },
      },
    ]);
  });

  it('should handle nested fields (PAGEREF within HYPERLINK)', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK \\l "bookmark"' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'See page ' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'PAGEREF bookmark' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'w:anchor': 'bookmark' },
        elements: [
          { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'See page ' }] }] },
          {
            name: 'sd:pageReference',
            type: 'element',
            attributes: { instruction: 'PAGEREF bookmark' },
            elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }] }],
          },
        ],
      },
    ]);
  });

  it('captures w:tab tokens in INDEX instructions', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'INDEX \\e "' }] }],
      },
      {
        name: 'w:r',
        elements: [
          { name: 'w:tab', elements: [] },
          { name: 'w:instrText', elements: [{ type: 'text', text: '"' }] },
        ],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Entry' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);
    expect(processedNodes).toHaveLength(1);
    expect(processedNodes[0].name).toBe('sd:index');
    expect(processedNodes[0].attributes.instructionTokens).toEqual([
      { type: 'text', text: 'INDEX \\e "' },
      { type: 'tab' },
      { type: 'text', text: '"' },
    ]);
  });

  it('processes TOC fields when begin, instrText, separate, and end share a single run', () => {
    const nodes = [
      {
        name: 'w:r',
        elements: [
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } },
          { name: 'w:instrText', elements: [{ type: 'text', text: 'TOC \\o "1-1" \\h \\z \\u' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
        ],
      },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual([
      {
        name: 'sd:tableOfContents',
        type: 'element',
        attributes: {
          instruction: 'TOC \\o "1-1" \\h \\z \\u',
        },
        elements: [],
      },
    ]);
  });

  it('preserves unknown fields when begin, instrText, separate, and end share a single run', () => {
    const nodes = [
      {
        name: 'w:r',
        elements: [
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } },
          { name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD foo' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
          { name: 'w:t', elements: [{ type: 'text', text: 'value' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
        ],
      },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual(nodes);
  });

  it('does not duplicate later fields when an unknown field and a TOC share one run', () => {
    const nodes = [
      {
        name: 'w:r',
        elements: [
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } },
          { name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD foo' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
          { name: 'w:t', elements: [{ type: 'text', text: 'value' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } },
          { name: 'w:instrText', elements: [{ type: 'text', text: 'TOC \\o "1-1" \\h \\z \\u' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
        ],
      },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual([
      {
        name: 'w:r',
        elements: [
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } },
          { name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD foo' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
          { name: 'w:t', elements: [{ type: 'text', text: 'value' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
        ],
      },
      {
        name: 'sd:tableOfContents',
        type: 'element',
        attributes: {
          instruction: 'TOC \\o "1-1" \\h \\z \\u',
        },
        elements: [],
      },
    ]);
  });

  it('preserves w:drawing and w:pict nodes while collecting field content', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:drawing', elements: [{ name: 'wp:inline', elements: [] }] },
      { name: 'w:pict', elements: [{ name: 'v:shape', elements: [] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'r:id': 'rIdabc12345' },
        elements: [
          { name: 'w:drawing', elements: [{ name: 'wp:inline', elements: [] }] },
          { name: 'w:pict', elements: [{ name: 'v:shape', elements: [] }] },
        ],
      },
    ]);
  });

  it('processes fields that begin and end inside child nodes', () => {
    const nodes = [
      {
        name: 'w:p',
        elements: [
          { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
          {
            name: 'w:r',
            elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
          },
          { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
          { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
          { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
        ],
      },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual([
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:hyperlink',
            type: 'element',
            attributes: { 'r:id': 'rIdabc12345' },
            elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
          },
        ],
      },
    ]);
  });

  it('processes fields that end inside child nodes after starting at the parent level', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      {
        name: 'w:p',
        elements: [
          { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
          { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
        ],
      },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'r:id': 'rIdabc12345' },
        elements: [
          {
            name: 'w:p',
            elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
          },
        ],
      },
    ]);
  });

  it('processes known fields that end inside nested non-tracked wrappers', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:sdt',
            elements: [
              {
                name: 'w:sdtContent',
                elements: [
                  { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
                  { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
                ],
              },
            ],
          },
        ],
      },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'r:id': 'rIdabc12345' },
        elements: [
          {
            name: 'w:p',
            elements: [
              {
                name: 'w:sdt',
                elements: [
                  {
                    name: 'w:sdtContent',
                    elements: [
                      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('preserves a tracked-deletion-wrapped field split across paragraphs without throwing', () => {
    const expectedNodes = [
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:del',
            attributes: { 'w:id': '1', 'w:author': 'Repro', 'w:date': '2026-04-30T00:00:00Z' },
            elements: [
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:instrText',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: ' HYPERLINK \\l "Bookmark" ' }],
                  },
                ],
              },
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:delText',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: 'deleted link text' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:del',
            attributes: { 'w:id': '2', 'w:author': 'Repro', 'w:date': '2026-04-30T00:00:00Z' },
            elements: [
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:delText',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: 'deleted text after field end' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const nodes = structuredClone(expectedNodes);

    let result;
    expect(() => {
      result = preProcessNodesForFldChar(nodes, mockDocx);
    }).not.toThrow();
    expect(result.processedNodes).toEqual(expectedNodes);
    expect(result.unpairedBegin).toBeNull();
    expect(result.unpairedEnd).toBeNull();
  });

  // SD-2973: when a HYPERLINK field is wrapped in a constructive tracked
  // change (w:ins / w:moveTo) and crosses paragraphs, SD-2858's preserveRaw
  // path used to drop the link interpretation entirely — the inserted text
  // rendered with insertion styling but no clickable link, while Word shows
  // both treatments. The fix keeps the raw <w:p> structure intact (so the
  // tracked-change wrappers round-trip) but wraps the visible text run
  // (between separate and end fldChars) in <w:hyperlink> in-place so the
  // downstream importer applies the link mark.
  it('wraps the visible run in w:hyperlink when an inserted HYPERLINK is split across paragraphs', () => {
    const docx = {
      'word/_rels/document.xml.rels': {
        elements: [{ name: 'Relationships', elements: [] }],
      },
    };
    const nodes = [
      {
        name: 'w:p',
        elements: [
          { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Before: ' }] }] },
          {
            name: 'w:ins',
            attributes: { 'w:id': '1', 'w:author': 'Repro', 'w:date': '2026-04-30T00:00:00Z' },
            elements: [
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:instrText',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: ' HYPERLINK "http://example.com" ' }],
                  },
                ],
              },
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:t',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: 'inserted link text' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:ins',
            attributes: { 'w:id': '2', 'w:author': 'Repro', 'w:date': '2026-04-30T00:00:00Z' },
            elements: [
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:t',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: 'inserted text after field end' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = preProcessNodesForFldChar(nodes, docx);

    // Two paragraphs preserved (the structural raw-preservation guarantee
    // from SD-2858 still holds — we are not collapsing the tree).
    expect(result.processedNodes).toHaveLength(2);
    expect(result.processedNodes[0].name).toBe('w:p');
    expect(result.processedNodes[1].name).toBe('w:p');

    // Walk the first paragraph; it must contain a w:hyperlink wrapping the
    // visible text run "inserted link text". The hyperlink sits inside the
    // existing <w:ins> wrapper so insertion track-change styling layers on
    // top of the link styling — matching Word's rendering.
    const findFirst = (node, predicate) => {
      if (!node) return null;
      if (predicate(node)) return node;
      for (const child of node.elements || []) {
        const hit = findFirst(child, predicate);
        if (hit) return hit;
      }
      return null;
    };

    const hyperlink = findFirst(result.processedNodes[0], (n) => n.name === 'w:hyperlink');
    expect(hyperlink).toBeTruthy();
    expect(hyperlink.attributes?.['r:id']).toMatch(/^rId/);

    const visibleText = findFirst(hyperlink, (n) => n.elements?.some((c) => c?.type === 'text'));
    expect(visibleText?.elements?.[0]?.text).toBe('inserted link text');

    // Relationship must have been added pointing at the URL extracted from
    // the field's instrText.
    const relationships = docx['word/_rels/document.xml.rels'].elements.find((el) => el.name === 'Relationships');
    const newRel = relationships.elements.find((el) => el.name === 'Relationship');
    expect(newRel?.attributes?.Target).toBe('http://example.com');
    expect(newRel?.attributes?.Type).toBe(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    );
  });

  it('preserves raw field nodes when an active field ends inside a tracked deletion wrapper', () => {
    const expectedNodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:del',
            attributes: { 'w:id': '1', 'w:author': 'Repro', 'w:date': '2026-04-30T00:00:00Z' },
            elements: [
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:delText',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: 'deleted text after field end' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const nodes = structuredClone(expectedNodes);
    const docx = {
      'word/_rels/document.xml.rels': {
        elements: [{ name: 'Relationships', elements: [] }],
      },
    };
    const { processedNodes, unpairedBegin, unpairedEnd } = preProcessNodesForFldChar(nodes, docx);

    expect(processedNodes).toEqual(expectedNodes);
    expect(unpairedBegin).toBeNull();
    expect(unpairedEnd).toBeNull();
    expect(docx['word/_rels/document.xml.rels'].elements[0].elements).toEqual([]);
  });

  it('preserves raw field nodes when an active field ends inside a tracked move wrapper', () => {
    const expectedNodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:moveFrom',
            attributes: { 'w:id': '1', 'w:author': 'Repro', 'w:date': '2026-04-30T00:00:00Z' },
            elements: [
              { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
              {
                name: 'w:r',
                elements: [
                  {
                    name: 'w:t',
                    attributes: { 'xml:space': 'preserve' },
                    elements: [{ type: 'text', text: 'moved text after field end' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const nodes = structuredClone(expectedNodes);
    const docx = {
      'word/_rels/document.xml.rels': {
        elements: [{ name: 'Relationships', elements: [] }],
      },
    };
    const { processedNodes, unpairedBegin, unpairedEnd } = preProcessNodesForFldChar(nodes, docx);

    expect(processedNodes).toEqual(expectedNodes);
    expect(unpairedBegin).toBeNull();
    expect(unpairedEnd).toBeNull();
    expect(docx['word/_rels/document.xml.rels'].elements[0].elements).toEqual([]);
  });

  it('preserves raw child nodes when an unpaired end bubbles through a non-collecting wrapper', () => {
    const expectedNodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD foo' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'value' }] }] },
      {
        name: 'w:p',
        elements: [
          {
            name: 'w:sdt',
            elements: [
              {
                name: 'w:sdtContent',
                elements: [{ name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] }],
              },
            ],
          },
        ],
      },
    ];
    const nodes = structuredClone(expectedNodes);
    const { processedNodes, unpairedBegin, unpairedEnd } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toEqual(expectedNodes);
    expect(unpairedBegin).toBeNull();
    expect(unpairedEnd).toBeNull();
  });

  it('should handle unpaired begin', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'HYPERLINK "http://example.com"' }] }],
      },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: ' ' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
    ];
    const { processedNodes, unpairedBegin } = preProcessNodesForFldChar(nodes, mockDocx);
    expect(unpairedBegin).toEqual([
      {
        nodes: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
        fieldInfo: {
          instrText: 'HYPERLINK "http://example.com"   ',
          instructionTokens: [
            { type: 'text', text: 'HYPERLINK "http://example.com"' },
            { type: 'text', text: ' ' },
          ],
          afterSeparate: true,
        },
      },
    ]);
    expect(processedNodes).toEqual([
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
    ]); // fldChar nodes are not included
  });

  it('should handle unpaired end', () => {
    const nodes = [{ name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] }];
    const { processedNodes, unpairedEnd } = preProcessNodesForFldChar(nodes, mockDocx);
    expect(unpairedEnd).toBe(true);
    expect(processedNodes).toEqual([]);
  });

  it('should return nodes as is if no fields are present', () => {
    const nodes = [
      {
        name: 'w:p',
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'some text' }] }] }],
      },
    ];
    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);
    expect(processedNodes).toEqual(nodes);
  });

  it('preserves fldChar runs when instruction type is unknown', () => {
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      {
        name: 'w:r',
        elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'CUSTOMFIELD foo' }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'value' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);
    expect(processedNodes).toEqual(nodes);
  });

  it('processes fldSimple XE fields into indexEntry nodes', () => {
    const nodes = [
      {
        name: 'w:fldSimple',
        attributes: { 'w:instr': 'XE "Term"' },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'hidden' }] }] }],
      },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);
    expect(processedNodes).toHaveLength(1);
    expect(processedNodes[0].name).toBe('sd:indexEntry');
    expect(processedNodes[0].attributes.instruction).toBe('XE "Term"');
  });

  it('passes field-sequence rPr into body NUMWORDS fields when cached-result runs have no styling', () => {
    const nodes = [
      {
        name: 'w:r',
        elements: [
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } },
        ],
      },
      {
        name: 'w:r',
        elements: [
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
          { name: 'w:instrText', elements: [{ type: 'text', text: 'NUMWORDS' }] },
        ],
      },
      {
        name: 'w:r',
        elements: [
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
          { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
        ],
      },
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '12' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    expect(processedNodes).toHaveLength(1);
    expect(processedNodes[0].name).toBe('sd:documentStatField');
    expect(processedNodes[0].attributes.instruction).toBe('NUMWORDS');
    expect(processedNodes[0].elements?.[0]).toEqual({
      name: 'w:rPr',
      elements: [{ name: 'w:b' }],
    });
  });
});
