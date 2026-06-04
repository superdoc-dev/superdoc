// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessNumPagesInstruction } from './num-pages-preprocessor.js';

describe('preProcessNumPagesInstruction', () => {
  const mockDocx = {};

  it('should create a sd:totalPageNumber node', () => {
    const nodesToCombine = [];
    const instruction = 'NUMPAGES';
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, { docx: mockDocx });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sd:totalPageNumber');
    expect(result[0].type).toBe('element');
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
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, { docx: mockDocx });
    expect(result[0].elements).toEqual([{ name: 'w:rPr', elements: [{ name: 'w:b' }] }]);
  });

  it('should use fieldRunRPr when content nodes have no rPr', () => {
    const nodesToCombine = [];
    const instruction = 'NUMPAGES';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [
        { name: 'w:rFonts', attributes: { 'w:ascii': 'Times New Roman' } },
        { name: 'w:sz', attributes: { 'w:val': '40' } },
        { name: 'w:b' },
      ],
    };
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, { fieldRunRPr });
    expect(result[0].elements).toEqual([fieldRunRPr]);
  });

  it('should use fieldRunRPr from the generic field pipeline options', () => {
    const nodesToCombine = [];
    const instruction = 'NUMPAGES \\# "00"';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [{ name: 'w:b' }],
    };
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, {
      docx: mockDocx,
      instructionTokens: [],
      fieldRunRPr,
    });
    expect(result[0]).toEqual({
      name: 'sd:totalPageNumber',
      type: 'element',
      attributes: {
        instruction: 'NUMPAGES \\# "00"',
        pageNumberFormat: 'decimal',
        pageNumberZeroPadding: 2,
      },
      elements: [fieldRunRPr],
    });
  });

  it('should use options-object fieldRunRPr without inspecting docx shape', () => {
    const nodesToCombine = [];
    const instruction = 'NUMPAGES \\# "00"';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [{ name: 'w:b' }],
    };
    const docxWithName = { name: 'w:rPr' };
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, {
      docx: docxWithName,
      fieldRunRPr,
    });
    expect(result[0].elements).toEqual([fieldRunRPr]);
  });

  it('should prefer content node rPr over fieldRunRPr', () => {
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
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, { fieldRunRPr });
    expect(result[0].elements).toEqual([contentRPr]);
  });

  it('should ignore invalid fieldRunRPr (not a w:rPr node)', () => {
    const nodesToCombine = [];
    const instruction = 'NUMPAGES';
    const invalidRPr = { name: 'w:r', elements: [] };
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction, { fieldRunRPr: invalidRPr });
    expect(result[0].elements).toBeUndefined();
  });

  it('should extract cached text from content nodes into importedCachedText', () => {
    const nodesToCombine = [
      {
        name: 'w:r',
        elements: [
          { name: 'w:rPr', elements: [{ name: 'w:noProof' }] },
          { name: 'w:t', elements: [{ type: 'text', text: '3' }] },
        ],
      },
    ];
    const instruction = 'NUMPAGES';
    const result = preProcessNumPagesInstruction(nodesToCombine, instruction);
    expect(result[0].attributes.importedCachedText).toBe('3');
  });

  it('should not set importedCachedText when no content text exists', () => {
    const result = preProcessNumPagesInstruction([], 'NUMPAGES');
    expect(result[0].attributes.importedCachedText).toBeUndefined();
  });

  it('preserves NUMPAGES zero-padding switches as normalized attributes', () => {
    const result = preProcessNumPagesInstruction([], 'NUMPAGES \\# "00"');
    expect(result[0].attributes).toEqual({
      instruction: 'NUMPAGES \\# "00"',
      pageNumberFormat: 'decimal',
      pageNumberZeroPadding: 2,
    });
  });
});
