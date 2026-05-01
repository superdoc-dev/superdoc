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

    expect(processedNodes).toHaveLength(1);
    expect(processedNodes[0].name).toBe('w:hyperlink');
    expect(processedNodes[0].attributes).toEqual({ 'w:anchor': 'bookmark' });
    expect(processedNodes[0].elements).toHaveLength(2);
    expect(processedNodes[0].elements[0]).toEqual({
      name: 'w:r',
      elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'See page ' }] }],
    });
    expect(processedNodes[0].elements[1]).toMatchObject({
      name: 'sd:pageReference',
      type: 'element',
      attributes: { instruction: 'PAGEREF bookmark' },
      elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '5' }] }] }],
    });
    expect(processedNodes[0].elements[1].attributes.fieldInstance).toBeDefined();
    expect(processedNodes[0].elements[1].attributes.fieldInstance.family).toBe('PAGEREF');
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

    expect(processedNodes).toHaveLength(1);
    expect(processedNodes[0]).toMatchObject({
      name: 'sd:tableOfContents',
      type: 'element',
      attributes: { instruction: 'TOC \\o "1-1" \\h \\z \\u' },
      elements: [],
    });
    expect(processedNodes[0].attributes.fieldInstance).toBeDefined();
    expect(processedNodes[0].attributes.fieldInstance.family).toBe('TOC');
  });

  it('wraps unknown fields in sd:rawField when begin, instrText, separate, and end share a single run', () => {
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

    expect(processedNodes).toHaveLength(1);
    expect(processedNodes[0].name).toBe('sd:rawField');
    const fi = processedNodes[0].attributes.fieldInstance;
    expect(fi.representation).toBe('complex');
    expect(fi.family).toBe('CUSTOMFIELD');
    expect(fi.rawInstruction).toBe('CUSTOMFIELD foo');
    expect(fi.dirty).toBe(false);
    expect(fi.locked).toBe(false);
    expect(fi.mutation.imported).toBe(true);
    expect(fi.source.originalXml).toBeDefined();
  });

  it('falls back to raw runs when an unknown field spans paragraph boundaries (rawField is inline-only)', () => {
    // Multi-paragraph IF / unsupported complex fields can include w:p in
    // their result content. Wrapping them in inline-only sd:rawField
    // would produce a PM tree that fails schema validation; fall back
    // to passing the raw runs through unchanged for that case.
    const nodes = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' } }] },
      { name: 'w:r', elements: [{ name: 'w:instrText', elements: [{ type: 'text', text: 'IF \\* MERGEFORMAT' }] }] },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } }] },
      // Block-level content inside the field (legal in OOXML for some
      // unsupported fields but not for an inline rawField PM node).
      {
        name: 'w:p',
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'first' }] }] }],
      },
      {
        name: 'w:p',
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'second' }] }] }],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } }] },
    ];

    const { processedNodes } = preProcessNodesForFldChar(nodes, mockDocx);

    // No sd:rawField wrapper — the runs pass through unchanged so the
    // PM importer can produce valid block content.
    expect(processedNodes.some((n) => n.name === 'sd:rawField')).toBe(false);
    expect(processedNodes.some((n) => n.name === 'w:p')).toBe(true);
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

    expect(processedNodes).toHaveLength(2);
    expect(processedNodes[0].name).toBe('sd:rawField');
    expect(processedNodes[0].attributes.fieldInstance.family).toBe('CUSTOMFIELD');
    expect(processedNodes[1]).toMatchObject({
      name: 'sd:tableOfContents',
      type: 'element',
      attributes: { instruction: 'TOC \\o "1-1" \\h \\z \\u' },
      elements: [],
    });
    expect(processedNodes[1].attributes.fieldInstance).toBeDefined();
    expect(processedNodes[1].attributes.fieldInstance.family).toBe('TOC');
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
          dirty: false,
          locked: false,
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

  it('wraps unknown fields spanning multiple runs in sd:rawField', () => {
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
    expect(processedNodes).toHaveLength(1);
    expect(processedNodes[0].name).toBe('sd:rawField');
    const fi = processedNodes[0].attributes.fieldInstance;
    expect(fi.representation).toBe('complex');
    expect(fi.family).toBe('CUSTOMFIELD');
    expect(fi.rawInstruction).toBe('CUSTOMFIELD foo');
    expect(Array.isArray(fi.source.originalXml)).toBe(true);
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
