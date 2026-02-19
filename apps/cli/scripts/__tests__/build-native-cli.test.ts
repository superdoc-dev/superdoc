import { describe, expect, test } from 'bun:test';
import { TARGETS, resolveHostTargetId, resolveRequestedTargets } from '../build-native-cli.js';

describe('resolveHostTargetId', () => {
  test('maps known platform/arch pairs', () => {
    expect(resolveHostTargetId('darwin', 'arm64')).toBe('darwin-arm64');
    expect(resolveHostTargetId('darwin', 'x64')).toBe('darwin-x64');
    expect(resolveHostTargetId('linux', 'x64')).toBe('linux-x64');
    expect(resolveHostTargetId('linux', 'arm64')).toBe('linux-arm64');
    expect(resolveHostTargetId('win32', 'x64')).toBe('windows-x64');
  });

  test('throws for unsupported host combinations', () => {
    expect(() => resolveHostTargetId('linux', 'ppc64')).toThrow('Unsupported host platform');
  });
});

describe('resolveRequestedTargets', () => {
  test('returns all configured targets for --all', () => {
    expect(resolveRequestedTargets(['--all'])).toEqual(Object.keys(TARGETS));
  });

  test('throws when --all and --targets are both provided', () => {
    expect(() => resolveRequestedTargets(['--all', '--targets', 'linux-x64'])).toThrow(
      'Use either --all or --targets, not both.',
    );
  });

  test('throws when --targets has no value', () => {
    expect(() => resolveRequestedTargets(['--targets'])).toThrow('Flag --targets requires a value.');
  });

  test('throws on unsupported targets', () => {
    expect(() => resolveRequestedTargets(['--targets', 'linux-x64,bogus-target'])).toThrow(
      'Unknown target "bogus-target"',
    );
  });
});
