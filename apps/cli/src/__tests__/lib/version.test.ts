import { describe, expect, test } from 'bun:test';
import { resolveCliPackageVersion } from '../../lib/version';

describe('resolveCliPackageVersion', () => {
  test('returns a non-empty version string', () => {
    const version = resolveCliPackageVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  test('returns a semver-like version', () => {
    const version = resolveCliPackageVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('returns the same value on subsequent calls (cached)', () => {
    const first = resolveCliPackageVersion();
    const second = resolveCliPackageVersion();
    expect(first).toBe(second);
  });
});
