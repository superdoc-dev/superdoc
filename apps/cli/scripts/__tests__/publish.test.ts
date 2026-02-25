import { describe, expect, test } from 'bun:test';
import { isAlreadyPublished, resolvePublishOptions } from '../publish.js';

describe('resolvePublishOptions', () => {
  test('allows dry-run without npm auth token', () => {
    const options = resolvePublishOptions(['--dry-run'], {});
    expect(options.dryRun).toBe(true);
    expect(options.tag).toBe('latest');
    expect(options.authToken).toBe('');
  });

  test('requires auth token when not dry-run', () => {
    expect(() => resolvePublishOptions([], {})).toThrow(
      'Missing npm auth token. Set NPM_TOKEN or NODE_AUTH_TOKEN in your environment.',
    );
  });

  test('throws when --tag is provided without value', () => {
    expect(() => resolvePublishOptions(['--tag'], { NODE_AUTH_TOKEN: 'token' })).toThrow(
      'Flag --tag requires a value.',
    );
  });

  test('parses equals-form --tag=value', () => {
    const options = resolvePublishOptions(['--tag=beta', '--dry-run'], {});
    expect(options.tag).toBe('beta');
  });
});

describe('isAlreadyPublished', () => {
  test('returns true when npm view succeeds', () => {
    const fakeSpawn = () => ({
      status: 0,
      stdout: '1.0.0-alpha.1',
      stderr: '',
      error: undefined,
    });

    expect(isAlreadyPublished('@superdoc-dev/cli', '1.0.0-alpha.1', 'token', {}, fakeSpawn)).toBe(true);
  });

  test('returns false for not-found responses', () => {
    const fakeSpawn = () => ({
      status: 1,
      stdout: '',
      stderr: 'npm ERR! code E404',
      error: undefined,
    });

    expect(isAlreadyPublished('@superdoc-dev/cli', '1.0.0-alpha.1', 'token', {}, fakeSpawn)).toBe(false);
  });

  test('throws for unknown npm view failures', () => {
    const fakeSpawn = () => ({
      status: 1,
      stdout: '',
      stderr: 'npm ERR! code ECONNRESET',
      error: undefined,
    });

    expect(() => isAlreadyPublished('@superdoc-dev/cli', '1.0.0-alpha.1', 'token', {}, fakeSpawn)).toThrow(
      'Failed to check published version',
    );
  });
});
