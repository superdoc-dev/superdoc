import { describe, expect, it } from 'vitest';
import { compileSafeTextRegex, isSafeTextRegex, MAX_TEXT_REGEX_PATTERN_LENGTH } from './safe-regex.js';

describe('safe text regex helpers', () => {
  it('compiles safe patterns with the default case-insensitive global flags', () => {
    const result = compileSafeTextRegex('hel+o');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.regex.source).toBe('hel+o');
    expect(result.regex.flags).toBe('gi');
    expect(isSafeTextRegex('hel+o')).toBe(true);
  });

  it('honors case-sensitive regex matching', () => {
    const result = compileSafeTextRegex('Hello', { caseSensitive: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.regex.flags).toBe('g');
  });

  it('rejects invalid regex syntax before safety analysis', () => {
    const result = compileSafeTextRegex('[');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid regex to be rejected');
    expect(result.reason).toContain('Invalid text query regex');
  });

  it('rejects unsafe backtracking-prone regex patterns', () => {
    const result = compileSafeTextRegex('^(a+)+$');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected unsafe regex to be rejected');
    expect(result.reason).toContain('Unsafe text query regex rejected');
    expect(isSafeTextRegex('^(a+)+$')).toBe(false);
  });

  it('rejects patterns over the text regex length limit', () => {
    const result = compileSafeTextRegex('a'.repeat(MAX_TEXT_REGEX_PATTERN_LENGTH + 1));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected oversized regex to be rejected');
    expect(result.reason).toContain(`exceeds ${MAX_TEXT_REGEX_PATTERN_LENGTH} characters`);
  });
});
