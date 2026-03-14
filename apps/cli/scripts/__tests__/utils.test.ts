import { describe, expect, test } from 'bun:test';
import { ensureNoUnknownFlags, getOptionalFlagValue } from '../utils.js';

describe('ensureNoUnknownFlags', () => {
  test('accepts long flags and equals-form flags in allowlist', () => {
    const argv = ['--tag=alpha', '--dry-run'];
    expect(() => ensureNoUnknownFlags(argv, new Set(['--tag', '--dry-run']))).not.toThrow();
  });

  test('throws when unknown flags are provided', () => {
    const argv = ['--tag=alpha', '--unknown'];
    expect(() => ensureNoUnknownFlags(argv, new Set(['--tag']))).toThrow('Unknown flag(s): --unknown');
  });
});

describe('getOptionalFlagValue', () => {
  test('reads space-separated flag values', () => {
    expect(getOptionalFlagValue(['--tag', 'beta'], '--tag')).toBe('beta');
  });

  test('reads equals-form flag values', () => {
    expect(getOptionalFlagValue(['--tag=beta'], '--tag')).toBe('beta');
  });

  test('returns null when flag is absent', () => {
    expect(getOptionalFlagValue(['--dry-run'], '--tag')).toBeNull();
  });

  test('throws when flag is missing a value', () => {
    expect(() => getOptionalFlagValue(['--tag'], '--tag')).toThrow('Flag --tag requires a value.');
    expect(() => getOptionalFlagValue(['--tag', '--dry-run'], '--tag')).toThrow('Flag --tag requires a value.');
    expect(() => getOptionalFlagValue(['--tag='], '--tag')).toThrow('Flag --tag requires a value.');
  });
});
