import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-line-break-type.js';

describe('w:type (lineBreakType) encoder', () => {
  it('returns the type value when present', () => {
    expect(encode({ 'w:type': 'textWrapping' })).toBe('textWrapping');
    expect(encode({ 'w:type': 'page' })).toBe('page');
    expect(encode({ 'w:type': 'column' })).toBe('column');
    expect(encode({ 'w:type': 'line' })).toBe('line');
  });

  it('returns undefined when attribute is missing', () => {
    expect(encode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(encode({ 'w:clear': 'all' })).toBeUndefined();
  });
});

describe('lineBreakType decoder', () => {
  it('returns the lineBreakType value when present', () => {
    expect(decode({ lineBreakType: 'textWrapping' })).toBe('textWrapping');
    expect(decode({ lineBreakType: 'page' })).toBe('page');
    expect(decode({ lineBreakType: 'column' })).toBe('column');
    expect(decode({ lineBreakType: 'line' })).toBe('line');
  });

  it('returns undefined when lineBreakType is missing', () => {
    expect(decode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(decode({ clear: 'left' })).toBeUndefined();
  });
});

describe('round-trip consistency', () => {
  const values = ['textWrapping', 'page', 'column', 'line'];

  for (const val of values) {
    it(`encodes and decodes '${val}' consistently`, () => {
      const encoded = encode({ 'w:type': val });
      expect(encoded).toBe(val);

      const decoded = decode({ lineBreakType: encoded });
      expect(decoded).toBe(val);
    });
  }
});

describe('attrConfig metadata', () => {
  it('exposes correct xmlName and sdName', () => {
    expect(attrConfig.xmlName).toBe('w:type');
    expect(attrConfig.sdName).toBe('lineBreakType');
  });
});
