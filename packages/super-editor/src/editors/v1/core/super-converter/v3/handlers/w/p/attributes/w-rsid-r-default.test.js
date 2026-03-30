// @ts-check
import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-rsid-r-default.js';

describe('w:rsidRDefault attribute handlers', () => {
  it('encodes w:rsidRDefault from OOXML attributes', () => {
    const attrs = { 'w:rsidRDefault': 'DEADBEEF' };
    expect(encode(attrs)).toBe('DEADBEEF');
  });

  it('returns undefined when encoding without w:rsidRDefault', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes rsidRDefault to OOXML attribute value', () => {
    const superDocAttrs = { rsidRDefault: 'DEADBEEF' };
    expect(decode(superDocAttrs)).toBe('DEADBEEF');
  });

  it('returns undefined when decoding without rsidRDefault', () => {
    const superDocAttrs = {};
    expect(decode(superDocAttrs)).toBeUndefined();
  });

  it('exposes correct attrConfig metadata', () => {
    expect(attrConfig.xmlName).toBe('w:rsidRDefault');
    expect(attrConfig.sdName).toBe('rsidRDefault');
  });
});
