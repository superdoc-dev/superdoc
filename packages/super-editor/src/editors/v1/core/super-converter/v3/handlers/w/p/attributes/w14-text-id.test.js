// @ts-check
import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w14-text-id.js';

describe('w14:textId attribute handlers', () => {
  it('encodes w14:textId from OOXML attributes', () => {
    const attrs = { 'w14:textId': 'FACE' };
    expect(encode(attrs)).toBe('FACE');
  });

  it('returns undefined when encoding without w14:textId', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes textId to OOXML attribute value', () => {
    const superDocAttrs = { textId: 'FACE' };
    expect(decode(superDocAttrs)).toBe('FACE');
  });

  it('returns undefined when decoding without textId', () => {
    const superDocAttrs = {};
    expect(decode(superDocAttrs)).toBeUndefined();
  });

  it('exposes correct attrConfig metadata', () => {
    expect(attrConfig.xmlName).toBe('w14:textId');
    expect(attrConfig.sdName).toBe('textId');
  });
});
