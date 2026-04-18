import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-rsid-r.js';

describe('w:r w:rsidR attribute handlers', () => {
  it('encodes w:rsidR from OOXML attributes', () => {
    const attrs = { 'w:rsidR': '11223344' };
    expect(encode(attrs)).toBe('11223344');
  });

  it('returns undefined when encoding without w:rsidR', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes rsidR to OOXML attribute value', () => {
    const superDocAttrs = { rsidR: '11223344' };
    expect(decode(superDocAttrs)).toBe('11223344');
  });

  it('returns undefined when decoding without rsidR', () => {
    const superDocAttrs = {};
    expect(decode(superDocAttrs)).toBeUndefined();
  });

  it('exposes correct attrConfig metadata', () => {
    expect(attrConfig.xmlName).toBe('w:rsidR');
    expect(attrConfig.sdName).toBe('rsidR');
  });
});
