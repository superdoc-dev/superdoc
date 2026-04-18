import { toNonEmptyString, toFiniteNumber, toId, resolveCommentIdFromAttrs, normalizeExcerpt } from './value-utils.js';

describe('toNonEmptyString', () => {
  it('returns a non-empty string as-is', () => {
    expect(toNonEmptyString('hello')).toBe('hello');
  });

  it('returns undefined for an empty string', () => {
    expect(toNonEmptyString('')).toBeUndefined();
  });

  it('returns undefined for non-string values', () => {
    expect(toNonEmptyString(null)).toBeUndefined();
    expect(toNonEmptyString(undefined)).toBeUndefined();
    expect(toNonEmptyString(42)).toBeUndefined();
    expect(toNonEmptyString(true)).toBeUndefined();
    expect(toNonEmptyString({})).toBeUndefined();
  });
});

describe('toFiniteNumber', () => {
  it('returns a finite number as-is', () => {
    expect(toFiniteNumber(42)).toBe(42);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-3.14)).toBe(-3.14);
  });

  it('returns undefined for non-finite numbers', () => {
    expect(toFiniteNumber(Infinity)).toBeUndefined();
    expect(toFiniteNumber(-Infinity)).toBeUndefined();
    expect(toFiniteNumber(NaN)).toBeUndefined();
  });

  it('parses numeric strings', () => {
    expect(toFiniteNumber('42')).toBe(42);
    expect(toFiniteNumber('3.14')).toBe(3.14);
    expect(toFiniteNumber(' 7 ')).toBe(7);
  });

  it('returns undefined for non-numeric strings', () => {
    expect(toFiniteNumber('abc')).toBeUndefined();
    expect(toFiniteNumber('')).toBeUndefined();
    expect(toFiniteNumber('  ')).toBeUndefined();
  });

  it('returns undefined for non-number/string values', () => {
    expect(toFiniteNumber(null)).toBeUndefined();
    expect(toFiniteNumber(undefined)).toBeUndefined();
    expect(toFiniteNumber(true)).toBeUndefined();
    expect(toFiniteNumber({})).toBeUndefined();
  });
});

describe('toId', () => {
  it('returns a non-empty string as-is', () => {
    expect(toId('abc')).toBe('abc');
  });

  it('returns undefined for an empty string', () => {
    expect(toId('')).toBeUndefined();
  });

  it('converts a finite number to a string', () => {
    expect(toId(42)).toBe('42');
    expect(toId(0)).toBe('0');
  });

  it('returns undefined for non-finite numbers', () => {
    expect(toId(NaN)).toBeUndefined();
    expect(toId(Infinity)).toBeUndefined();
  });

  it('returns undefined for other types', () => {
    expect(toId(null)).toBeUndefined();
    expect(toId(undefined)).toBeUndefined();
    expect(toId(true)).toBeUndefined();
    expect(toId({})).toBeUndefined();
  });
});

describe('resolveCommentIdFromAttrs', () => {
  it('prefers commentId over importedId and w:id', () => {
    expect(resolveCommentIdFromAttrs({ commentId: 'c1', importedId: 'i1', 'w:id': 'w1' })).toBe('c1');
  });

  it('falls back to importedId when commentId is absent', () => {
    expect(resolveCommentIdFromAttrs({ importedId: 'i1', 'w:id': 'w1' })).toBe('i1');
  });

  it('falls back to w:id when commentId and importedId are absent', () => {
    expect(resolveCommentIdFromAttrs({ 'w:id': 'w1' })).toBe('w1');
  });

  it('returns undefined when no id attribute is present', () => {
    expect(resolveCommentIdFromAttrs({})).toBeUndefined();
  });

  it('skips empty string values', () => {
    expect(resolveCommentIdFromAttrs({ commentId: '', importedId: 'i1' })).toBe('i1');
  });
});

describe('normalizeExcerpt', () => {
  it('collapses multiple whitespace characters', () => {
    expect(normalizeExcerpt('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeExcerpt('  hello  ')).toBe('hello');
  });

  it('normalizes newlines and tabs', () => {
    expect(normalizeExcerpt('hello\n\tworld')).toBe('hello world');
  });

  it('returns undefined for empty string', () => {
    expect(normalizeExcerpt('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(normalizeExcerpt('   \n\t  ')).toBeUndefined();
  });
});
