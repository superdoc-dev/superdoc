import { describe, it, expect } from 'vitest';
import { hashSegmentText } from './hash.js';

describe('hashSegmentText', () => {
  it('returns a hex string', () => {
    const result = hashSegmentText('hello world');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for the same input', () => {
    expect(hashSegmentText('foo')).toBe(hashSegmentText('foo'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashSegmentText('hello')).not.toBe(hashSegmentText('world'));
  });

  it('handles empty string', () => {
    const result = hashSegmentText('');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('handles emoji (surrogate pairs)', () => {
    const result = hashSegmentText('hello 👋 world');
    expect(result).toMatch(/^[0-9a-f]+$/);
    expect(hashSegmentText('hello 👋 world')).toBe(result);
  });

  it('handles smart quotes and apostrophes', () => {
    const result = hashSegmentText('it\u2019s a \u201Ctest\u201D');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('handles NBSP', () => {
    const result = hashSegmentText('hello\u00A0world');
    expect(result).not.toBe(hashSegmentText('hello world'));
  });

  it('handles combining marks', () => {
    // é as e + combining acute
    const composed = '\u00e9';
    const decomposed = 'e\u0301';
    expect(hashSegmentText(composed)).not.toBe(hashSegmentText(decomposed));
  });
});
