import { describe, expect, it } from 'vitest';
import { generateTocBookmarkName } from './toc-bookmark-sync.js';

describe('generateTocBookmarkName', () => {
  it('produces a _Toc-prefixed name with only valid bookmark characters', () => {
    const name = generateTocBookmarkName('some-block-id');
    expect(name).toMatch(/^_Toc[a-zA-Z0-9_]+$/);
  });

  it('escapes hyphens in UUID-style block IDs', () => {
    expect(generateTocBookmarkName('ba2b746a-930a-4baf-93d2-4d65637194d1')).toBe(
      '_Tocba2b746a_2d930a_2d4baf_2d93d2_2d4d65637194d1',
    );
  });

  it('passes through pure alphanumeric paraId inputs unchanged', () => {
    expect(generateTocBookmarkName('41964671')).toBe('_Toc41964671');
  });

  it('escapes literal underscores to prevent ambiguity', () => {
    expect(generateTocBookmarkName('a_b')).toBe('_Toca__b');
  });

  it('is deterministic for the same input', () => {
    const a = generateTocBookmarkName('abc-123');
    const b = generateTocBookmarkName('abc-123');
    expect(a).toBe(b);
  });

  it('produces different names for different inputs', () => {
    const a = generateTocBookmarkName('heading-1');
    const b = generateTocBookmarkName('heading-2');
    expect(a).not.toBe(b);
  });

  it('does not collide for punctuation-folding pairs like p-1 vs p1', () => {
    const a = generateTocBookmarkName('p-1');
    const b = generateTocBookmarkName('p1');
    expect(a).not.toBe(b);
  });

  it('does not collide for underscore vs hyphen pairs like a_b vs a-b', () => {
    const a = generateTocBookmarkName('a_b');
    const b = generateTocBookmarkName('a-b');
    expect(a).not.toBe(b);
  });

  it('does not collide for inputs that collided under the old FNV-1a hash', () => {
    const a = generateTocBookmarkName('id-u4-ehdfkc7l');
    const b = generateTocBookmarkName('id-f6q-l70lxz94');
    expect(a).not.toBe(b);
  });

  it('does not collide for hyphenated paragraph IDs like P-ABCDEF01 vs PABCDEF01', () => {
    const a = generateTocBookmarkName('P-ABCDEF01');
    const b = generateTocBookmarkName('PABCDEF01');
    expect(a).not.toBe(b);
  });
});
