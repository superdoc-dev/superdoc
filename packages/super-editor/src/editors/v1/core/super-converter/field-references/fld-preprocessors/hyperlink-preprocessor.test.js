// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preProcessHyperlinkInstruction } from './hyperlink-preprocessor.js';
import { translator } from '../../v3/handlers/w/hyperlink';
import { generateDocxRandomId } from '@helpers/generateDocxRandomId.js';

vi.mock('@helpers/generateDocxRandomId.js', () => ({
  generateDocxRandomId: vi.fn(),
}));

describe('preProcessHyperlinkInstruction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateDocxRandomId.mockReturnValue('abc12345');
  });

  const mockNodesToCombine = [
    { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] },
  ];

  it('should process a simple hyperlink instruction with a URL and add a relationship', () => {
    const instruction = 'HYPERLINK "http://example.com"';
    const mockDocx = {
      'word/_rels/document.xml.rels': {
        elements: [
          {
            name: 'Relationships',
            elements: [],
          },
        ],
      },
    };

    const result = preProcessHyperlinkInstruction(mockNodesToCombine, instruction, mockDocx);
    expect(result).toEqual([
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

    const encodedNode = translator.encode({
      nodes: [JSON.parse(JSON.stringify(result[0]))],
      nodeListHandler: { handler: (p) => p.nodes },
      docx: mockDocx,
    });

    expect(encodedNode).toEqual([
      {
        name: 'w:r',
        elements: [
          {
            name: 'w:t',
            elements: [
              {
                type: 'text',
                text: 'link text',
              },
            ],
          },
        ],
        marks: [
          {
            type: 'link',
            attrs: {
              rId: 'rIdabc12345',
              href: 'http://example.com',
            },
          },
        ],
      },
    ]);
  });

  it('should process a hyperlink instruction with switches', () => {
    const instruction = `HYPERLINK \l "anchorName" \o "tooltip text" \t "_blank"`;
    const result = preProcessHyperlinkInstruction(mockNodesToCombine, instruction);
    expect(result).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: {
          'w:anchor': 'anchorName',
          'w:tooltip': 'tooltip text',
          'w:tgtFrame': '_blank',
        },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
      },
    ]);
  });

  it('should handle the new window switch', () => {
    const instruction = 'HYPERLINK l "anchorName" \n';
    const result = preProcessHyperlinkInstruction(mockNodesToCombine, instruction);
    expect(result).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: {
          'w:anchor': 'anchorName',
          'w:tgtFrame': '_blank',
        },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
      },
    ]);
  });

  it('should return an empty attributes object if instruction is empty', () => {
    const instruction = '';
    const result = preProcessHyperlinkInstruction(mockNodesToCombine, instruction);
    expect(result).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: {},
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
      },
    ]);
  });

  it('should prefix relationship IDs with rId to ensure valid xsd:ID (SD-1661)', () => {
    // When generateDocxRandomId returns a hex starting with a digit,
    // the ID must still be prefixed with 'rId' to comply with xsd:ID/NCName requirements
    generateDocxRandomId.mockReturnValue('0c7b8f2a');

    const instruction = 'HYPERLINK "http://example.com"';
    const mockDocx = {
      'word/_rels/document.xml.rels': {
        elements: [{ name: 'Relationships', elements: [] }],
      },
    };

    const result = preProcessHyperlinkInstruction(mockNodesToCombine, instruction, mockDocx);

    // The Relationship Id should start with 'rId', not with a digit
    const relationshipId = mockDocx['word/_rels/document.xml.rels'].elements[0].elements[0].attributes.Id;
    expect(relationshipId).toBe('rId0c7b8f2a');
    expect(relationshipId).toMatch(/^[a-zA-Z_]/); // Must start with letter or underscore (NCName rule)

    // The hyperlink r:id should match
    expect(result[0].attributes['r:id']).toBe('rId0c7b8f2a');
  });

  it('should handle missing relationships gracefully for URL hyperlinks', () => {
    const instruction = 'HYPERLINK "http://example.com"';
    const mockDocx = {
      'word/_rels/document.xml.rels': { elements: [] }, // Missing Relationships element
    };
    // Expect it not to crash, but to return w:anchor as before
    const result = preProcessHyperlinkInstruction(mockNodesToCombine, instruction, mockDocx);
    expect(result).toEqual([
      {
        name: 'w:hyperlink',
        type: 'element',
        attributes: { 'w:anchor': 'http://example.com' },
        elements: [
          {
            name: 'w:r',
            elements: [
              {
                name: 'w:t',
                elements: [{ type: 'text', text: 'link text' }],
              },
            ],
          },
        ],
      },
    ]);
  });
});
