import { describe, it, expect } from 'vitest';
import { preProcessIndexInstruction } from './index-preprocessor.js';

describe('preProcessIndexInstruction', () => {
  it('creates sd:index node with instruction attribute', () => {
    const nodesToCombine = [{ name: 'w:p', elements: [] }];
    const instrText = 'INDEX \\e "\\t" \\h "A"';

    const result = preProcessIndexInstruction(nodesToCombine, instrText);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sd:index');
    expect(result[0].type).toBe('element');
    expect(result[0].attributes.instruction).toBe(instrText);
    expect(result[0].elements).toBe(nodesToCombine);
  });

  it('includes instructionTokens when provided', () => {
    const nodesToCombine = [];
    const instrText = 'INDEX \\e "\t"';
    const instructionTokens = [{ type: 'text', text: 'INDEX \\e "' }, { type: 'tab' }, { type: 'text', text: '"' }];

    const result = preProcessIndexInstruction(nodesToCombine, instrText, null, instructionTokens);

    expect(result[0].attributes.instructionTokens).toEqual(instructionTokens);
  });

  it('omits instructionTokens when null', () => {
    const result = preProcessIndexInstruction([], 'INDEX', null, null);

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('omits instructionTokens when undefined', () => {
    const result = preProcessIndexInstruction([], 'INDEX');

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('handles empty nodesToCombine', () => {
    const result = preProcessIndexInstruction([], 'INDEX \\h');

    expect(result[0].elements).toEqual([]);
  });

  it('preserves complex instruction text with switches', () => {
    const instrText = 'INDEX \\c "2" \\e "\\t" \\h "A" \\z "1033"';

    const result = preProcessIndexInstruction([], instrText);

    expect(result[0].attributes.instruction).toBe(instrText);
  });
});
