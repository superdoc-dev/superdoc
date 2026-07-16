// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessPageInstruction } from './page-preprocessor.js';

describe('preProcessPageInstruction', () => {
  const mockDocx = {};

  it('should create a sd:autoPageNumber node', () => {
    const nodesToCombine = [];
    const instruction = 'PAGE';
    const result = preProcessPageInstruction(nodesToCombine, instruction, { docx: mockDocx });
    expect(result).toEqual([
      {
        name: 'sd:autoPageNumber',
        type: 'element',
        attributes: { instruction: 'PAGE' },
      },
    ]);
  });

  it.each([
    ['PAGE', undefined],
    ['PAGE \\* roman', 'lowerRoman'],
    ['PAGE \\* Roman \\* MERGEFORMAT', 'upperRoman'],
    ['PAGE \\* ROMAN', 'upperRoman'],
    ['page \\* Arabic', 'decimal'],
    ['PAGE \\* Unsupported \\* MERGEFORMAT', undefined],
  ])('preserves PAGE instruction and parses supported value format: %s', (instruction, pageNumberFormat) => {
    const result = preProcessPageInstruction([], instruction, mockDocx);
    expect(result[0].attributes).toEqual({
      instruction,
      ...(pageNumberFormat ? { pageNumberFormat } : {}),
    });
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
    const instruction = 'PAGE';
    const result = preProcessPageInstruction(nodesToCombine, instruction, { docx: mockDocx });
    expect(result).toEqual([
      {
        name: 'sd:autoPageNumber',
        type: 'element',
        attributes: { instruction: 'PAGE' },
        elements: [{ name: 'w:rPr', elements: [{ name: 'w:b' }] }],
      },
    ]);
  });

  it('should use fieldRunRPr when content nodes have no rPr', () => {
    // This tests the case where PAGE field has styling on begin/instrText/separate nodes
    // but no <w:t> content between separate and end
    const nodesToCombine = []; // Empty - no content between separate and end
    const instruction = 'PAGE';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [
        { name: 'w:rFonts', attributes: { 'w:ascii': 'Times New Roman' } },
        { name: 'w:sz', attributes: { 'w:val': '40' } },
        { name: 'w:b' },
      ],
    };
    const result = preProcessPageInstruction(nodesToCombine, instruction, { fieldRunRPr });
    expect(result).toEqual([
      {
        name: 'sd:autoPageNumber',
        type: 'element',
        attributes: { instruction: 'PAGE' },
        elements: [fieldRunRPr],
      },
    ]);
  });

  it('should use fieldRunRPr from the generic field pipeline options', () => {
    const nodesToCombine = [];
    const instruction = 'PAGE \\* roman';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [{ name: 'w:b' }],
    };
    const result = preProcessPageInstruction(nodesToCombine, instruction, {
      docx: mockDocx,
      instructionTokens: [],
      fieldRunRPr,
    });
    expect(result).toEqual([
      {
        name: 'sd:autoPageNumber',
        type: 'element',
        attributes: {
          instruction: 'PAGE \\* roman',
          pageNumberFormat: 'lowerRoman',
        },
        elements: [fieldRunRPr],
      },
    ]);
  });

  it('should use options-object fieldRunRPr without inspecting docx shape', () => {
    const nodesToCombine = [];
    const instruction = 'PAGE \\* roman';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [{ name: 'w:b' }],
    };
    const docxWithName = { name: 'w:rPr' };
    const result = preProcessPageInstruction(nodesToCombine, instruction, {
      docx: docxWithName,
      fieldRunRPr,
    });
    expect(result[0].elements).toEqual([fieldRunRPr]);
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
    const instruction = 'PAGE';
    const fieldRunRPr = {
      name: 'w:rPr',
      elements: [{ name: 'w:b' }],
    };
    const result = preProcessPageInstruction(nodesToCombine, instruction, { fieldRunRPr });
    expect(result).toEqual([
      {
        name: 'sd:autoPageNumber',
        type: 'element',
        attributes: { instruction: 'PAGE' },
        elements: [contentRPr],
      },
    ]);
  });

  it('should ignore invalid fieldRunRPr (not a w:rPr node)', () => {
    const nodesToCombine = [];
    const instruction = 'PAGE';
    // Pass something that's not a w:rPr node
    const invalidRPr = { name: 'w:r', elements: [] };
    const result = preProcessPageInstruction(nodesToCombine, instruction, { fieldRunRPr: invalidRPr });
    expect(result).toEqual([
      {
        name: 'sd:autoPageNumber',
        type: 'element',
        attributes: { instruction: 'PAGE' },
      },
    ]);
  });

  it('preserves PAGE general format switches as normalized attributes', () => {
    const result = preProcessPageInstruction([], 'PAGE \\* roman');
    expect(result[0].attributes).toEqual({
      instruction: 'PAGE \\* roman',
      pageNumberFormat: 'lowerRoman',
    });
  });

  it('preserves PAGE ArabicDash switches as normalized attributes', () => {
    const result = preProcessPageInstruction([], 'PAGE \\* ArabicDash');
    expect(result[0].attributes).toEqual({
      instruction: 'PAGE \\* ArabicDash',
      pageNumberFormat: 'numberInDash',
    });
  });
});
