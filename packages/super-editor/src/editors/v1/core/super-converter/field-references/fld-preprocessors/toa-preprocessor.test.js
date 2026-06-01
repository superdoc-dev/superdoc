import { describe, expect, it } from 'vitest';
import { preProcessToaInstruction } from './toa-preprocessor.js';

describe('preProcessToaInstruction', () => {
  it('creates sd:tableOfAuthorities node with instruction attribute', () => {
    const nodesToCombine = [{ name: 'w:p', type: 'element', elements: [] }];
    const instrText = 'TOA \\h \\c "1"';

    const result = preProcessToaInstruction(nodesToCombine, instrText);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sd:tableOfAuthorities');
    expect(result[0].type).toBe('element');
    expect(result[0].attributes.instruction).toBe(instrText);
    expect(result[0].elements).toEqual(nodesToCombine);
  });

  it('includes instructionTokens when provided', () => {
    const tokens = [{ type: 'text', text: 'TOA \\h \\c "' }, { type: 'text', text: '1"' }];

    const result = preProcessToaInstruction([], 'TOA \\h \\c "1"', null, tokens);

    expect(result[0].attributes.instructionTokens).toEqual(tokens);
  });

  it('omits instructionTokens when undefined', () => {
    const result = preProcessToaInstruction([], 'TOA');

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('synthesizes an empty paragraph when the field has no rendered content', () => {
    // SD-3005: PM `tableOfAuthorities` schema requires `paragraph+`.
    const result = preProcessToaInstruction([], 'TOA \\h');

    expect(result[0].elements).toEqual([{ name: 'w:p', type: 'element', elements: [] }]);
  });

  it('wraps loose runs in a synthesized paragraph (single-paragraph field)', () => {
    // SD-3005: same crash class — TOA envelopes can also sit inside one <w:p>.
    const r1 = {
      name: 'w:r',
      type: 'element',
      elements: [{ name: 'w:t', elements: [{ text: 'Smith v. Jones, 1 U.S. 1 (1900)' }] }],
    };

    const result = preProcessToaInstruction([r1], 'TOA \\h \\c "1"');

    expect(result[0].elements).toEqual([{ name: 'w:p', type: 'element', elements: [r1] }]);
  });
});
