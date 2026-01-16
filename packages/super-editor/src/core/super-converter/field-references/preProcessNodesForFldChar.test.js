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
    generateDocxRandomId.mockReturnValue('rId123');
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
        attributes: { 'r:id': 'rId123' },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'link text' }] }] }],
      },
    ]);
    expect(mockDocx['word/_rels/document.xml.rels'].elements[0].elements).toEqual([
      {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: 'rId123',
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
});
