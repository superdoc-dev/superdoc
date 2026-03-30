import { describe, it, expect } from 'vitest';
import { translator } from './szcs-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:szCs translator (attribute)', () => {
  it('exposes translator metadata and attribute handlers', () => {
    expect(translator.xmlName).toBe('w:szCs');
    expect(translator.sdNodeOrKeyName).toBe('fontSizeCs');
  });

  it('encodes complex script font size with override and fallback', () => {
    const out = translator.encode({ nodes: [{ attributes: { 'w:val': '48' } }] });
    expect(out).toEqual(48);

    const fallback = translator.encode({ nodes: [{ attributes: {} }] });
    expect(fallback).toBeUndefined();
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
  });
});
