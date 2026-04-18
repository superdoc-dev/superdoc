// @ts-check
import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w14-para-id.js';

describe('w14:paraId attribute handlers', () => {
  it('encodes w14:paraId from OOXML attributes', () => {
    const attrs = { 'w14:paraId': 'ABCD' };
    expect(encode(attrs)).toBe('ABCD');
  });

  it('returns undefined when encoding without w14:paraId', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes paraId to OOXML attribute value', () => {
    const superDocAttrs = { paraId: 'ABCD' };
    expect(decode(superDocAttrs)).toBe('ABCD');
  });

  it('returns undefined when decoding without paraId', () => {
    const superDocAttrs = {};
    expect(decode(superDocAttrs)).toBeUndefined();
  });

  it('exposes correct attrConfig metadata', () => {
    expect(attrConfig.xmlName).toBe('w14:paraId');
    expect(attrConfig.sdName).toBe('paraId');
  });
});
