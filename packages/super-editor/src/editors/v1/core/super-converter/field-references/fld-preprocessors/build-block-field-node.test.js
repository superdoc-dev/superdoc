import { describe, expect, it } from 'vitest';
import { buildBlockFieldNode } from './build-block-field-node.js';

describe('buildBlockFieldNode', () => {
  it('emits the given sd:* element with the instruction and normalized paragraphs', () => {
    const run = { name: 'w:r', type: 'element', elements: [] };

    const result = buildBlockFieldNode('sd:index', [run], 'INDEX \\c 2');

    expect(result).toEqual([
      {
        name: 'sd:index',
        type: 'element',
        attributes: { instruction: 'INDEX \\c 2' },
        elements: [{ name: 'w:p', type: 'element', elements: [run] }],
      },
    ]);
  });

  it('includes instructionTokens only when provided', () => {
    const tokens = [{ type: 'text', text: 'INDEX ' }, { type: 'tab' }];

    const withTokens = buildBlockFieldNode('sd:tableOfAuthorities', [], 'INDEX', tokens);
    expect(withTokens[0].attributes.instructionTokens).toEqual(tokens);

    const withoutTokens = buildBlockFieldNode('sd:tableOfAuthorities', [], 'INDEX');
    expect(withoutTokens[0].attributes).not.toHaveProperty('instructionTokens');
  });

  it('synthesizes an empty paragraph when there is no content', () => {
    const result = buildBlockFieldNode('sd:bibliography', [], 'BIBLIOGRAPHY');

    expect(result[0].elements).toEqual([{ name: 'w:p', type: 'element', elements: [] }]);
  });
});
