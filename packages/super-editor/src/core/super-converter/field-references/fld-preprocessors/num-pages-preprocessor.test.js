// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessNumPagesInstruction } from './num-pages-preprocessor.js';

describe('preProcessNumPagesInstruction', () => {
  const mockDocx = {};

  it('should create a sd:totalPageNumber node', () => {
    const nodesToCombine = [];
    const instruction = 'NUMPAGES';
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, mockDocx);
    expect(result).toEqual([
      {
        name: 'sd:totalPageNumber',
        type: 'element',
      },
    ]);
  });

  it('should extract rPr from nodes', () => {
    const nodesToCombine = [
      {
        name: 'w:r',
        elements: [
          { name: 'w:rPr', elements: [{ name: 'w:b' }] },
          { name: 'w:t', elements: [{ type: 'text', text: '1' }] },
        ],
      },
    ];
    const instruction = 'NUMPAGES';
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, mockDocx);
    expect(result).toEqual([
      {
        name: 'sd:totalPageNumber',
        type: 'element',
        elements: [{ name: 'w:rPr', elements: [{ name: 'w:b' }] }],
      },
    ]);
  });

  it('should use fieldRunRPr when content nodes have no rPr', () => {
    // This tests the case where NUMPAGES field has styling on begin/instrText/separate nodes
    // but no <w:t> content between separate and end
    const nodesToCombine = []; // Empty - no content between separate and end
    const instruction = 'NUMPAGES';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [
        { name: 'w:rFonts', attributes: { 'w:ascii': 'Times New Roman' } },
        { name: 'w:sz', attributes: { 'w:val': '40' } },
        { name: 'w:b' },
      ],
    };
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, fieldRunRPr);
    expect(result).toEqual([
      {
        name: 'sd:totalPageNumber',
        type: 'element',
        elements: [fieldRunRPr],
      },
    ]);
  });

  it('should prefer content node rPr over fieldRunRPr', () => {
    // Content between separate and end takes priority over field sequence styling
    const contentRPr = { name: 'w:rPr', elements: [{ name: 'w:i' }] };
    const nodesToCombine = [
      {
        name: 'w:r',
        elements: [contentRPr, { name: 'w:t', elements: [{ type: 'text', text: '1' }] }],
      },
    ];
    const instruction = 'NUMPAGES';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [{ name: 'w:b' }],
    };
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, fieldRunRPr);
    expect(result).toEqual([
      {
        name: 'sd:totalPageNumber',
        type: 'element',
        elements: [contentRPr],
      },
    ]);
  });

  it('should ignore invalid fieldRunRPr (not a w:rPr node)', () => {
    const nodesToCombine = [];
    const instruction = 'NUMPAGES';
    // Pass something that's not a w:rPr node
    const invalidRPr = { name: 'w:r', elements: [] };
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, invalidRPr);
    expect(result).toEqual([
      {
        name: 'sd:totalPageNumber',
        type: 'element',
      },
    ]);
  });
});
