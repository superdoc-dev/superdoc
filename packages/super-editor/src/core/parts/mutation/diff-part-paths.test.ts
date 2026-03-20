import { describe, it, expect } from 'vitest';
import { diffPartPaths } from './diff-part-paths.js';

describe('diffPartPaths', () => {
  it('returns empty array for identical values', () => {
    expect(diffPartPaths({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('returns empty for identical nested objects', () => {
    const a = { x: { y: [1, 2, 3] } };
    const b = { x: { y: [1, 2, 3] } };
    expect(diffPartPaths(a, b)).toEqual([]);
  });

  it('detects added key', () => {
    expect(diffPartPaths({ a: 1 }, { a: 1, b: 2 })).toEqual(['/b']);
  });

  it('detects removed key', () => {
    expect(diffPartPaths({ a: 1, b: 2 }, { a: 1 })).toEqual(['/b']);
  });

  it('detects changed primitive', () => {
    expect(diffPartPaths({ a: 1 }, { a: 2 })).toEqual(['/a']);
  });

  it('detects nested changes', () => {
    const before = { x: { y: 1, z: 2 } };
    const after = { x: { y: 1, z: 3 } };
    expect(diffPartPaths(before, after)).toEqual(['/x/z']);
  });

  it('detects array element change', () => {
    expect(diffPartPaths([1, 2, 3], [1, 9, 3])).toEqual(['/1']);
  });

  it('detects array length change', () => {
    const paths = diffPartPaths([1, 2], [1, 2, 3]);
    expect(paths).toEqual(['/2']);
  });

  it('returns root path for type mismatch', () => {
    expect(diffPartPaths(42, 'hello')).toEqual(['/']);
  });

  it('handles null vs object', () => {
    expect(diffPartPaths(null, { a: 1 })).toEqual(['/']);
  });

  it('escapes keys with slashes per RFC 6901', () => {
    expect(diffPartPaths({ 'a/b': 1 }, { 'a/b': 2 })).toEqual(['/a~1b']);
  });

  it('escapes keys with tildes per RFC 6901', () => {
    expect(diffPartPaths({ 'a~b': 1 }, { 'a~b': 2 })).toEqual(['/a~0b']);
  });

  it('returns empty for both null', () => {
    expect(diffPartPaths(null, null)).toEqual([]);
  });

  it('returns empty for strictly equal references', () => {
    const obj = { a: 1 };
    expect(diffPartPaths(obj, obj)).toEqual([]);
  });
});
