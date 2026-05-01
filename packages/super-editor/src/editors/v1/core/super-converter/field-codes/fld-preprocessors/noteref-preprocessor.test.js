// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessNoterefInstruction } from './noteref-preprocessor.js';

describe('preProcessNoterefInstruction', () => {
  const mockNodesToCombine = [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: '1' }] }] }];

  it('wraps the cached runs in a sd:crossReference node with NOTEREF fieldType', () => {
    const instruction = 'NOTEREF _Ref9876 \\h';
    const result = preProcessNoterefInstruction(mockNodesToCombine, instruction);
    expect(result).toEqual([
      {
        name: 'sd:crossReference',
        type: 'element',
        attributes: {
          instruction: 'NOTEREF _Ref9876 \\h',
          fieldType: 'NOTEREF',
        },
        elements: mockNodesToCombine,
      },
    ]);
  });

  it('preserves the instruction text verbatim including the \\f footnote switch', () => {
    const instruction = 'NOTEREF _Ref9876 \\h \\f';
    const [node] = preProcessNoterefInstruction(mockNodesToCombine, instruction);
    expect(node.attributes.instruction).toBe('NOTEREF _Ref9876 \\h \\f');
  });

  it('handles an empty runs list', () => {
    const result = preProcessNoterefInstruction([], 'NOTEREF _Ref9876 \\h');
    expect(result[0].elements).toEqual([]);
  });
});
