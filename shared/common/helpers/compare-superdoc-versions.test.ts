import { describe, it, expect } from 'bun:test';
import { compareVersions } from './compare-superdoc-versions';

describe('compareVersions', () => {
  it('returns 0 when versions are equal', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.5', '2.5.0.0')).toBe(0);
  });

  it('returns 1 when the first version is greater', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2.1', '1.2.0')).toBe(1);
    expect(compareVersions('1.0.1', '1')).toBe(1);
  });

  it('returns -1 when the second version is greater', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.5')).toBe(-1);
    expect(compareVersions('1.0', '1.0.0.1')).toBe(-1);
  });
});
