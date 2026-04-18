import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-tab-type.js';

describe('w:tab w:val (tabType) encoder', () => {
  it('returns the value when present', () => {
    expect(encode({ 'w:val': 'left' })).toBe('left');
    expect(encode({ 'w:val': 'right' })).toBe('right');
  });

  it('returns undefined when attribute is missing', () => {
    expect(encode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(encode({ 'w:pos': '720' })).toBeUndefined();
  });
});

describe('tabType decoder', () => {
  it('returns the tabType value when present', () => {
    expect(decode({ tabType: 'left' })).toBe('left');
    expect(decode({ tabType: 'right' })).toBe('right');
  });

  it('returns undefined when tabType is missing', () => {
    expect(decode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(decode({ pos: '720' })).toBeUndefined();
  });
});

describe('round-trip consistency', () => {
  const values = ['left', 'right'];

  for (const val of values) {
    it(`encodes and decodes '${val}' consistently`, () => {
      const encoded = encode({ 'w:val': val });
      expect(encoded).toBe(val);

      const decoded = decode({ tabType: encoded });
      expect(decoded).toBe(val);
    });
  }
});

describe('attrConfig metadata', () => {
  it('exposes correct xmlName and sdName', () => {
    expect(attrConfig.xmlName).toBe('w:val');
    expect(attrConfig.sdName).toBe('tabType');
  });
});
