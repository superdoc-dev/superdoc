import { describe, it, expect } from 'vitest';
import { preProcessIndexInstruction } from './index-preprocessor.js';

describe('preProcessIndexInstruction', () => {
  it('creates sd:index node with instruction attribute', () => {
    const nodesToCombine = [{ name: 'w:p', type: 'element', elements: [] }];
    const instrText = 'INDEX \\e "\\t" \\h "A"';

    const result = preProcessIndexInstruction(nodesToCombine, instrText);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sd:index');
    expect(result[0].type).toBe('element');
    expect(result[0].attributes.instruction).toBe(instrText);
    expect(result[0].elements).toEqual(nodesToCombine);
  });

  it('includes instructionTokens when provided', () => {
    const nodesToCombine = [];
    const instrText = 'INDEX \\e "\t"';
    const instructionTokens = [{ type: 'text', text: 'INDEX \\e "' }, { type: 'tab' }, { type: 'text', text: '"' }];

    const result = preProcessIndexInstruction(nodesToCombine, instrText, { instructionTokens });

    expect(result[0].attributes.instructionTokens).toEqual(instructionTokens);
  });

  it('omits instructionTokens when null', () => {
    const result = preProcessIndexInstruction([], 'INDEX', { instructionTokens: null });

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('omits instructionTokens when undefined', () => {
    const result = preProcessIndexInstruction([], 'INDEX');

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('synthesizes an empty paragraph when the field has no rendered content', () => {
    // SD-3005: PM `index` schema requires `paragraph+`. An empty result must
    // still produce at least one paragraph child.
    const result = preProcessIndexInstruction([], 'INDEX \\h');

    expect(result[0].elements).toEqual([{ name: 'w:p', type: 'element', elements: [] }]);
  });

  it('wraps loose runs in a synthesized paragraph (single-paragraph field)', () => {
    // SD-3005 / SD-3017: same crash class as bibliography when the INDEX
    // envelope sits inside one <w:p>.
    const r1 = { name: 'w:r', type: 'element', elements: [{ name: 'w:t', elements: [{ text: 'apple, 3' }] }] };
    const r2 = { name: 'w:r', type: 'element', elements: [{ name: 'w:t', elements: [{ text: 'banana, 5' }] }] };

    const result = preProcessIndexInstruction([r1, r2], 'INDEX \\c "2"');

    expect(result[0].elements).toEqual([{ name: 'w:p', type: 'element', elements: [r1, r2] }]);
  });

  it('preserves complex instruction text with switches', () => {
    const instrText = 'INDEX \\c "2" \\e "\\t" \\h "A" \\z "1033"';

    const result = preProcessIndexInstruction([], instrText);

    expect(result[0].attributes.instruction).toBe(instrText);
  });
});
