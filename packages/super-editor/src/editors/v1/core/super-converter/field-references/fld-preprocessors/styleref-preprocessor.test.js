// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessStylerefInstruction } from './styleref-preprocessor.js';

describe('preProcessStylerefInstruction', () => {
  const mockNodesToCombine = [
    { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Heading 1' }] }] },
  ];

  it('wraps the cached runs in a sd:crossReference node with STYLEREF fieldType', () => {
    const instruction = 'STYLEREF "Heading 1" \\l';
    const result = preProcessStylerefInstruction(mockNodesToCombine, instruction);
    expect(result).toEqual([
      {
        name: 'sd:crossReference',
        type: 'element',
        attributes: {
          instruction: 'STYLEREF "Heading 1" \\l',
          fieldType: 'STYLEREF',
        },
        elements: mockNodesToCombine,
      },
    ]);
  });

  it('preserves quoted style names that contain spaces', () => {
    const instruction = 'STYLEREF "Last Name" \\l';
    const [node] = preProcessStylerefInstruction(mockNodesToCombine, instruction);
    expect(node.attributes.instruction).toBe('STYLEREF "Last Name" \\l');
  });

  it('handles an empty runs list', () => {
    const result = preProcessStylerefInstruction([], 'STYLEREF "Heading 1"');
    expect(result[0].elements).toEqual([]);
  });
});
