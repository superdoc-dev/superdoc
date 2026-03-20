import { describe, it, expect } from 'vitest';
import { encode, decode, attrConfig } from './w-clear.js';

describe('w:clear (clear) encoder', () => {
  it('returns the clear value when present', () => {
    expect(encode({ 'w:clear': 'none' })).toBe('none');
    expect(encode({ 'w:clear': 'left' })).toBe('left');
    expect(encode({ 'w:clear': 'right' })).toBe('right');
    expect(encode({ 'w:clear': 'all' })).toBe('all');
  });

  it('returns undefined when attribute is missing', () => {
    expect(encode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(encode({ 'w:type': 'page' })).toBeUndefined();
  });
});

describe('clear decoder', () => {
  it('returns the clear value when present', () => {
    expect(decode({ clear: 'none' })).toBe('none');
    expect(decode({ clear: 'left' })).toBe('left');
    expect(decode({ clear: 'right' })).toBe('right');
    expect(decode({ clear: 'all' })).toBe('all');
  });

  it('returns undefined when clear is missing', () => {
    expect(decode({})).toBeUndefined();
  });

  it('ignores unrelated attributes', () => {
    expect(decode({ type: 'page' })).toBeUndefined();
  });
});

describe('round-trip consistency', () => {
  const values = ['none', 'left', 'right', 'all'];

  for (const val of values) {
    it(`encodes and decodes '${val}' consistently`, () => {
      const encoded = encode({ 'w:clear': val });
      expect(encoded).toBe(val);

      const decoded = decode({ clear: encoded });
      expect(decoded).toBe(val);
    });
  }
});

describe('attrConfig metadata', () => {
  it('exposes correct xmlName and sdName', () => {
    expect(attrConfig.xmlName).toBe('w:clear');
    expect(attrConfig.sdName).toBe('clear');
  });
});
