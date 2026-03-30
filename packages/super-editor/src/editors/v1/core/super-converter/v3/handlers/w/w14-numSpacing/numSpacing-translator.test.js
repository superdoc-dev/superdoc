import { describe, expect, it } from 'vitest';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { translator } from './numSpacing-translator.js';

describe('w14:numSpacing translator', () => {
  it('builds a NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w14:numSpacing');
    expect(translator.sdNodeOrKeyName).toBe('numSpacing');
  });

  it('encodes numSpacing from w14:val', () => {
    const encoded = translator.encode({
      nodes: [{ name: 'w14:numSpacing', attributes: { 'w14:val': 'proportional' } }],
    });
    expect(encoded).toBe('proportional');
  });

  it('decodes numSpacing to w14:val', () => {
    const decoded = translator.decode({
      node: { attrs: { numSpacing: 'tabular' } },
    });
    expect(decoded).toEqual({
      attributes: { 'w14:val': 'tabular' },
    });
  });
});
