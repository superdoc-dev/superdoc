import { describe, it, expect } from 'vitest';
import { translator } from './rstyle-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:rStyle translator (attribute)', () => {
  it('exposes correct translator meta', () => {
    expect(translator.xmlName).toBe('w:rStyle');
    expect(translator.sdNodeOrKeyName).toBe('styleId');
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:rStyle');
    expect(translator.sdNodeOrKeyName).toBe('styleId');
  });

  it('prefers encoded styleId and defaults to null', () => {
    const node = { name: 'w:rStyle', attributes: { 'w:val': 'Emphasis' } };
    const out = translator.encode({ nodes: [node] });
    expect(out).toEqual('Emphasis');

    const fallback = translator.encode({ nodes: [{ attributes: {} }] });
    expect(fallback).toBeUndefined();
  });
});
