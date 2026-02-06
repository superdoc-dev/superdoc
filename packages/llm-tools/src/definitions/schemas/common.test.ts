import { describe, it, expect } from 'vitest';
import { textSelectorSchema, blockAddressSchema } from './common.js';

describe('textSelectorSchema', () => {
  it('accepts a valid pattern with no flags', () => {
    const result = textSelectorSchema.parse({ type: 'text', pattern: 'hello' });
    expect(result).toEqual({ type: 'text', pattern: 'hello' });
  });

  it('accepts a valid regex pattern with flags', () => {
    const result = textSelectorSchema.parse({ type: 'text', pattern: '\\d+', flags: 'gi' });
    expect(result).toEqual({ type: 'text', pattern: '\\d+', flags: 'gi' });
  });

  it('rejects an empty pattern', () => {
    expect(() => textSelectorSchema.parse({ type: 'text', pattern: '' })).toThrow();
  });

  it('rejects an invalid regex pattern', () => {
    expect(() => textSelectorSchema.parse({ type: 'text', pattern: '(unclosed' })).toThrow(
      'Invalid regular expression',
    );
  });

  it('rejects invalid flags', () => {
    expect(() => textSelectorSchema.parse({ type: 'text', pattern: 'ok', flags: 'xyz' })).toThrow();
  });

  it('accepts all valid flag characters', () => {
    const result = textSelectorSchema.parse({ type: 'text', pattern: 'ok', flags: 'gimsuy' });
    expect(result.flags).toBe('gimsuy');
  });

  it('rejects a wrong type literal', () => {
    expect(() => textSelectorSchema.parse({ type: 'regex', pattern: 'ok' })).toThrow();
  });
});

describe('blockAddressSchema', () => {
  it('accepts a valid block address', () => {
    const result = blockAddressSchema.parse({ kind: 'block', blockId: 'abc-123' });
    expect(result).toEqual({ kind: 'block', blockId: 'abc-123' });
  });

  it('rejects an empty blockId', () => {
    expect(() => blockAddressSchema.parse({ kind: 'block', blockId: '' })).toThrow();
  });

  it('rejects a wrong kind literal', () => {
    expect(() => blockAddressSchema.parse({ kind: 'inline', blockId: 'abc' })).toThrow();
  });
});
