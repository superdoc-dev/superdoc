import { describe, it, expect } from 'vitest';
import { preProcessXeInstruction } from './xe-preprocessor.js';

describe('preProcessXeInstruction', () => {
  it('creates sd:indexEntry node with instruction attribute', () => {
    const nodesToCombine = [{ name: 'w:r', elements: [] }];
    const instrText = 'XE "Term"';

    const result = preProcessXeInstruction(nodesToCombine, instrText);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sd:indexEntry');
    expect(result[0].type).toBe('element');
    expect(result[0].attributes.instruction).toBe(instrText);
    expect(result[0].elements).toBe(nodesToCombine);
  });

  it('includes instructionTokens when provided', () => {
    const nodesToCombine = [];
    const instrText = 'XE "Term:Subterm"';
    const instructionTokens = [{ type: 'text', text: 'XE "Term:Subterm"' }];

    const result = preProcessXeInstruction(nodesToCombine, instrText, null, instructionTokens);

    expect(result[0].attributes.instructionTokens).toEqual(instructionTokens);
  });

  it('omits instructionTokens when null', () => {
    const result = preProcessXeInstruction([], 'XE "Test"', null, null);

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('omits instructionTokens when undefined', () => {
    const result = preProcessXeInstruction([], 'XE "Test"');

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('handles empty nodesToCombine', () => {
    const result = preProcessXeInstruction([], 'XE "Entry"');

    expect(result[0].elements).toEqual([]);
  });

  it('preserves complex instruction text with colon subentries', () => {
    const instrText = 'XE "Main Entry:Sub Entry:Sub-Sub Entry"';

    const result = preProcessXeInstruction([], instrText);

    expect(result[0].attributes.instruction).toBe(instrText);
  });

  it('handles instruction with formatting switches', () => {
    const instrText = 'XE "Bold Entry" \\b';

    const result = preProcessXeInstruction([], instrText);

    expect(result[0].attributes.instruction).toBe(instrText);
  });

  it('handles instruction with see also reference', () => {
    const instrText = 'XE "Entry" \\t "See Also: Related Entry"';

    const result = preProcessXeInstruction([], instrText);

    expect(result[0].attributes.instruction).toBe(instrText);
  });
});
