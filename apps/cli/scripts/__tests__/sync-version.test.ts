import { describe, expect, test } from 'bun:test';
import { syncOptionalDependencyVersions } from '../sync-version.js';

describe('syncOptionalDependencyVersions', () => {
  test('updates all platform package specs while preserving other dependencies', () => {
    const optionalDependencies = {
      '@superdoc-dev/cli-darwin-arm64': '0.0.1',
      '@superdoc-dev/unrelated': '9.9.9',
    };

    const next = syncOptionalDependencyVersions(optionalDependencies, [
      '@superdoc-dev/cli-darwin-arm64',
      '@superdoc-dev/cli-linux-x64',
    ]);

    expect(next).toEqual({
      '@superdoc-dev/cli-darwin-arm64': 'workspace:*',
      '@superdoc-dev/cli-linux-x64': 'workspace:*',
      '@superdoc-dev/unrelated': '9.9.9',
    });
  });
});
