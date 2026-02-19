import { describe, expect, test } from 'bun:test';
import { syncOptionalDependencyVersions } from '../sync-version.js';

describe('syncOptionalDependencyVersions', () => {
  test('updates all platform package versions while preserving other dependencies', () => {
    const optionalDependencies = {
      '@superdoc-dev/cli-darwin-arm64': '0.0.1',
      '@superdoc-dev/unrelated': '9.9.9',
    };

    const next = syncOptionalDependencyVersions(
      optionalDependencies,
      ['@superdoc-dev/cli-darwin-arm64', '@superdoc-dev/cli-linux-x64'],
      '1.0.0',
    );

    expect(next).toEqual({
      '@superdoc-dev/cli-darwin-arm64': '1.0.0',
      '@superdoc-dev/cli-linux-x64': '1.0.0',
      '@superdoc-dev/unrelated': '9.9.9',
    });
  });
});
