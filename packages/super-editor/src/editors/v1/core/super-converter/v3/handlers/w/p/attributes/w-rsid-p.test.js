// @ts-check
import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-rsid-p.js';

describe('w:rsidP attribute handlers', () => {
  it('encodes w:rsidP from OOXML attributes', () => {
    const attrs = { 'w:rsidP': '00112233' };
    expect(encode(attrs)).toBe('00112233');
  });

  it('returns undefined when encoding without w:rsidP', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes rsidP to OOXML attribute value', () => {
    const superDocAttrs = { rsidP: '00112233' };
    expect(decode(superDocAttrs)).toBe('00112233');
  });

  it('returns undefined when decoding without rsidP', () => {
    const superDocAttrs = {};
    expect(decode(superDocAttrs)).toBeUndefined();
  });

  it('exposes correct attrConfig metadata', () => {
    expect(attrConfig.xmlName).toBe('w:rsidP');
    expect(attrConfig.sdName).toBe('rsidP');
  });
});
