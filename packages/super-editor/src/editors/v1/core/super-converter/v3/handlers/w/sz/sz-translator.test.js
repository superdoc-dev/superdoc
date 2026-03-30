import { describe, it, expect } from 'vitest';
import { translator } from './sz-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:sz translator (attribute)', () => {
  it('exposes translator metadata and attribute handlers', () => {
    expect(translator.xmlName).toBe('w:sz');
    expect(translator.sdNodeOrKeyName).toBe('fontSize');
  });

  it('encodes font size with encoded overrides and null fallback', () => {
    const out = translator.encode({ nodes: [{ attributes: { 'w:val': '48' } }] });
    expect(out).toEqual(48);

    const fallback = translator.encode({ nodes: [{ attributes: {} }] });
    expect(fallback).toBeUndefined();
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
  });
});
