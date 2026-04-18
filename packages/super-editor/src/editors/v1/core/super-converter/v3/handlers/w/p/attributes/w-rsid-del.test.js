// @ts-check
import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-rsid-del.js';

describe('w:rsidDel attribute handlers', () => {
  it('encodes w:rsidDel from OOXML attributes', () => {
    const attrs = { 'w:rsidDel': 'A1B2C3D4' };
    expect(encode(attrs)).toBe('A1B2C3D4');
  });

  it('returns undefined when encoding without w:rsidDel', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes rsidDel to OOXML attribute value', () => {
    const superDocAttrs = { rsidDel: 'A1B2C3D4' };
    expect(decode(superDocAttrs)).toBe('A1B2C3D4');
  });

  it('returns undefined when decoding without rsidDel', () => {
    const superDocAttrs = {};
    expect(decode(superDocAttrs)).toBeUndefined();
  });

  it('exposes correct attrConfig metadata', () => {
    expect(attrConfig.xmlName).toBe('w:rsidDel');
    expect(attrConfig.sdName).toBe('rsidDel');
  });
});
