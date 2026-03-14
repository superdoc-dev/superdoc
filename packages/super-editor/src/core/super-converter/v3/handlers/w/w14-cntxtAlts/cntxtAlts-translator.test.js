import { describe, expect, it } from 'vitest';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { translator } from './cntxtAlts-translator.js';

describe('w14:cntxtAlts translator', () => {
  it('builds a NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w14:cntxtAlts');
    expect(translator.sdNodeOrKeyName).toBe('contextualAlternates');
  });

  it('encodes true when w14:val is omitted', () => {
    const encoded = translator.encode({
      nodes: [{ name: 'w14:cntxtAlts', attributes: {} }],
    });
    expect(encoded).toBe(true);
  });

  it('encodes false when w14:val is 0', () => {
    const encoded = translator.encode({
      nodes: [{ name: 'w14:cntxtAlts', attributes: { 'w14:val': '0' } }],
    });
    expect(encoded).toBe(false);
  });

  it('decodes false to w14:val=0', () => {
    const decoded = translator.decode({
      node: { attrs: { contextualAlternates: false } },
    });
    expect(decoded).toEqual({
      attributes: { 'w14:val': '0' },
    });
  });
});
