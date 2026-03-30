// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessTocInstruction } from './toc-preprocessor.js';

describe('preProcessTocInstruction', () => {
  it('should create a sd:tableOfContents node', () => {
    const nodesToCombine = [
      { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Table of Contents' }] }] },
    ];
    const instrText = 'TOC \\o "1-3" \\h \\z \\u';
    const result = preProcessTocInstruction(nodesToCombine, instrText);
    expect(result).toEqual([
      {
        name: 'sd:tableOfContents',
        type: 'element',
        attributes: {
          instruction: 'TOC \\o "1-3" \\h \\z \\u',
        },
        elements: nodesToCombine,
      },
    ]);
  });
});
