import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-tab-pos.js';

describe('w:tab w:pos (pos) encoder', () => {
  it('returns the value when present', () => {
    expect(encode({ 'w:pos': '720' })).toBe(720);
    expect(encode({ 'w:pos': '1080' })).toBe(1080);
  });

  it('returns undefined when attribute is missing', () => {
    expect(encode({})).toBeNull();
  });

  it('ignores unrelated attributes', () => {
    expect(encode({ 'w:val': '96' })).toBeNull();
  });
});

describe('pos decoder', () => {
  it('returns the pos value when present', () => {
    expect(decode({ pos: '720' })).toBe('720');
    expect(decode({ pos: '1080' })).toBe('1080');
  });

  it('returns undefined when pos is missing', () => {
    expect(decode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(decode({ tabType: 'left' })).toBeUndefined();
  });
});

describe('round-trip consistency', () => {
  const values = ['720', '1080'];

  for (const val of values) {
    it(`encodes and decodes '${val}' consistently`, () => {
      const encoded = encode({ 'w:pos': val });
      expect(encoded).toBe(parseInt(val));

      const decoded = decode({ pos: encoded });
      expect(decoded).toBe(val);
    });
  }
});

describe('attrConfig metadata', () => {
  it('exposes correct xmlName and sdName', () => {
    expect(attrConfig.xmlName).toBe('w:pos');
    expect(attrConfig.sdName).toBe('pos');
  });
});
