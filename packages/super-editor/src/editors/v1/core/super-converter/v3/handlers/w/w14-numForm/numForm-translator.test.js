import { describe, expect, it } from 'vitest';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { translator } from './numForm-translator.js';

describe('w14:numForm translator', () => {
  it('builds a NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w14:numForm');
    expect(translator.sdNodeOrKeyName).toBe('numForm');
  });

  it('encodes numForm from w14:val', () => {
    const encoded = translator.encode({
      nodes: [{ name: 'w14:numForm', attributes: { 'w14:val': 'lining' } }],
    });
    expect(encoded).toBe('lining');
  });

  it('decodes numForm to w14:val', () => {
    const decoded = translator.decode({
      node: { attrs: { numForm: 'oldStyle' } },
    });
    expect(decoded).toEqual({
      attributes: { 'w14:val': 'oldStyle' },
    });
  });
});
