// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessPageRefInstruction } from './page-ref-preprocessor.js';

describe('preProcessPageRefInstruction', () => {
  const mockNodesToCombine = [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }] }];

  it('should process a page reference instruction', () => {
    const instruction = 'PAGEREF _Toc123456789 \\h';
    const result = preProcessPageRefInstruction(mockNodesToCombine, instruction, {});
    expect(result).toEqual([
      {
        name: 'sd:pageReference',
        type: 'element',
        attributes: {
          instruction: 'PAGEREF _Toc123456789 \\h',
          bookmarkId: '_Toc123456789',
          hasHyperlinkSwitch: true,
        },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }] }],
      },
    ]);
  });

  it('should handle no text nodes', () => {
    const instruction = 'PAGEREF _Toc123456789 h';
    const nodesWithoutText = [];
    const result = preProcessPageRefInstruction(nodesWithoutText, instruction, {});
    expect(result).toEqual([
      {
        name: 'sd:pageReference',
        type: 'element',
        attributes: {
          instruction: 'PAGEREF _Toc123456789 h',
          bookmarkId: '_Toc123456789',
        },
        elements: [],
      },
    ]);
  });

  it('stores parsed PAGEREF switches and instruction tokens', () => {
    const result = preProcessPageRefInstruction(mockNodesToCombine, ' PAGEREF "_Toc1" \\p \\* Roman \\# "00" ', {
      instructionTokens: [{ type: 'text', text: ' PAGEREF "_Toc1" \\p \\* Roman \\# "00" ' }],
    });

    expect(result[0].attributes).toMatchObject({
      instruction: 'PAGEREF "_Toc1" \\p \\* Roman \\# "00"',
      instructionTokens: [{ type: 'text', text: ' PAGEREF "_Toc1" \\p \\* Roman \\# "00" ' }],
      bookmarkId: '_Toc1',
      hasRelativePositionSwitch: true,
      pageNumberFieldFormat: { format: 'upperRoman', zeroPadding: 2 },
      numericPictureFormat: { picture: '00' },
    });
    expect(result[0].elements).toBe(mockNodesToCombine);
  });

  it('stores converted CHARFORMAT run properties from the first instruction run', () => {
    const firstInstrTextRunRPr = {
      name: 'w:rPr',
      elements: [
        { name: 'w:b', attributes: { 'w:val': '1' } },
        { name: 'w:color', attributes: { 'w:val': 'FF0000' } },
      ],
    };
    const result = preProcessPageRefInstruction(mockNodesToCombine, 'PAGEREF _Toc123 \\* CHARFORMAT', {
      firstInstrTextRunRPr,
    });

    expect(result[0].attributes).toMatchObject({
      fieldResultFormat: 'charformat',
      fieldRunProperties: {
        bold: true,
        color: { val: 'FF0000' },
      },
    });
    expect(result[0].attributes.fieldRunProperties).not.toHaveProperty('name');
    expect(result[0].attributes.fieldRunProperties).not.toHaveProperty('elements');
  });
});
