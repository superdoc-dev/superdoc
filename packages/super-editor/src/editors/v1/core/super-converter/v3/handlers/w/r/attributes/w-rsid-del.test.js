import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-rsid-del.js';

describe('w:r w:rsidDel attribute handlers', () => {
  it('encodes w:rsidDel from OOXML attributes', () => {
    const attrs = { 'w:rsidDel': '00FFAA00' };
    expect(encode(attrs)).toBe('00FFAA00');
  });

  it('returns undefined when encoding without w:rsidDel', () => {
    const attrs = {};
    expect(encode(attrs)).toBeUndefined();
  });

  it('decodes rsidDel to OOXML attribute value', () => {
    const superDocAttrs = { rsidDel: '00FFAA00' };
    expect(decode(superDocAttrs)).toBe('00FFAA00');
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
