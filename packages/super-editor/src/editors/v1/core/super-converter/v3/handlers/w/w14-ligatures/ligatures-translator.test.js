import { describe, expect, it } from 'vitest';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { translator } from './ligatures-translator.js';

describe('w14:ligatures translator', () => {
  it('builds a NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w14:ligatures');
    expect(translator.sdNodeOrKeyName).toBe('ligatures');
  });

  it('encodes ligatures from w14:val', () => {
    const encoded = translator.encode({
      nodes: [{ name: 'w14:ligatures', attributes: { 'w14:val': 'standardContextual' } }],
    });
    expect(encoded).toBe('standardContextual');
  });

  it('decodes ligatures to w14:val', () => {
    const decoded = translator.decode({
      node: { attrs: { ligatures: 'historical' } },
    });
    expect(decoded).toEqual({
      attributes: { 'w14:val': 'historical' },
    });
  });
});
