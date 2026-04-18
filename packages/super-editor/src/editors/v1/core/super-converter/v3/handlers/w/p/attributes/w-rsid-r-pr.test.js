// @ts-check
import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-rsid-r-pr.js';

describe('w:rsidRPr attribute handlers', () => {
  it('encodes w:rsidRPr from OOXML attributes', () => {
    const attrs = { 'w:rsidRPr': 'CAFEBABE' };
    expect(encode(attrs)).toBe('CAFEBABE');
  });

  it('returns undefined when encoding without w:rsidRPr', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes rsidRPr to OOXML attribute value', () => {
    const superDocAttrs = { rsidRPr: 'CAFEBABE' };
    expect(decode(superDocAttrs)).toBe('CAFEBABE');
  });

  it('returns undefined when decoding without rsidRPr', () => {
    const superDocAttrs = {};
    expect(decode(superDocAttrs)).toBeUndefined();
  });

  it('exposes correct attrConfig metadata', () => {
    expect(attrConfig.xmlName).toBe('w:rsidRPr');
    expect(attrConfig.sdName).toBe('rsidRPr');
  });
});
