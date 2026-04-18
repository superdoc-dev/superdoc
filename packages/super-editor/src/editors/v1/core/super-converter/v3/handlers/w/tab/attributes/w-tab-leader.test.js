import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-tab-leader.js';

describe('w:tab w:leader (leader) encoder', () => {
  it('returns the value when present', () => {
    expect(encode({ 'w:leader': 'dot' })).toBe('dot');
    expect(encode({ 'w:leader': 'hyphen' })).toBe('hyphen');
    expect(encode({ 'w:leader': 'none' })).toBe('none');
  });

  it('returns undefined when attribute is missing', () => {
    expect(encode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(encode({ 'w:pos': '720' })).toBeUndefined();
  });
});

describe('leader decoder', () => {
  it('returns the leader value when present', () => {
    expect(decode({ leader: 'dot' })).toBe('dot');
    expect(decode({ leader: 'hyphen' })).toBe('hyphen');
    expect(decode({ leader: 'none' })).toBe('none');
  });

  it('returns undefined when leader is missing', () => {
    expect(decode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(decode({ tabType: 'left' })).toBeUndefined();
  });
});

describe('round-trip consistency', () => {
  const values = ['dot', 'hyphen', 'none'];

  for (const val of values) {
    it(`encodes and decodes '${val}' consistently`, () => {
      const encoded = encode({ 'w:leader': val });
      expect(encoded).toBe(val);

      const decoded = decode({ leader: encoded });
      expect(decoded).toBe(val);
    });
  }
});

describe('attrConfig metadata', () => {
  it('exposes correct xmlName and sdName', () => {
    expect(attrConfig.xmlName).toBe('w:leader');
    expect(attrConfig.sdName).toBe('leader');
  });
});
