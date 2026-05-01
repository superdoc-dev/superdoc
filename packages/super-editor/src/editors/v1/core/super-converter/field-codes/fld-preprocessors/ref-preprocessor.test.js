// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessRefInstruction } from './ref-preprocessor.js';

describe('preProcessRefInstruction', () => {
  const mockNodesToCombine = [
    { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Section 15' }] }] },
  ];

  it('wraps the cached runs in a sd:crossReference node with REF fieldType', () => {
    const instruction = 'REF _Ref123456 \\h';
    const result = preProcessRefInstruction(mockNodesToCombine, instruction);
    expect(result).toEqual([
      {
        name: 'sd:crossReference',
        type: 'element',
        attributes: {
          instruction: 'REF _Ref123456 \\h',
          fieldType: 'REF',
        },
        elements: mockNodesToCombine,
      },
    ]);
  });

  it('preserves the instruction text verbatim including all switches', () => {
    const instruction = 'REF _Ref123 \\h \\w \\* MERGEFORMAT';
    const [node] = preProcessRefInstruction(mockNodesToCombine, instruction);
    expect(node.attributes.instruction).toBe('REF _Ref123 \\h \\w \\* MERGEFORMAT');
  });

  it('handles an empty runs list', () => {
    const result = preProcessRefInstruction([], 'REF _Ref123 \\h');
    expect(result[0].elements).toEqual([]);
  });
});
