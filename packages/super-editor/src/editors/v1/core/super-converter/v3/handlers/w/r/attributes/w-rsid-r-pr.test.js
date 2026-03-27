import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-rsid-r-pr.js';

describe('w:r w:rsidRPr attribute handlers', () => {
  it('encodes w:rsidRPr from OOXML attributes', () => {
    const attrs = { 'w:rsidRPr': 'A1B2C3D4' };
    expect(encode(attrs)).toBe('A1B2C3D4');
  });

  it('returns undefined when encoding without w:rsidRPr', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes rsidRPr to OOXML attribute value', () => {
    const superDocAttrs = { rsidRPr: 'A1B2C3D4' };
    expect(decode(superDocAttrs)).toBe('A1B2C3D4');
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
