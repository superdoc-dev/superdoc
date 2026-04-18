// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessPageRefInstruction } from './page-ref-preprocessor.js';

describe('preProcessPageRefInstruction', () => {
  const mockDocx = {};

  const mockNodesToCombine = [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }] }];

  it('should process a page reference instruction', () => {
    const instruction = 'PAGEREF _Toc123456789 h';
    const result = preProcessPageRefInstruction(mockNodesToCombine, instruction, mockDocx);
    expect(result).toEqual([
      {
        name: 'sd:pageReference',
        type: 'element',
        attributes: {
          instruction: 'PAGEREF _Toc123456789 h',
        },
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }] }],
      },
    ]);
  });

  it('should handle no text nodes', () => {
    const instruction = 'PAGEREF _Toc123456789 h';
    const nodesWithoutText = [];
    const result = preProcessPageRefInstruction(nodesWithoutText, instruction, mockDocx);
    expect(result).toEqual([
      {
        name: 'sd:pageReference',
        type: 'element',
        attributes: {
          instruction: 'PAGEREF _Toc123456789 h',
        },
        elements: [],
      },
    ]);
  });
});
