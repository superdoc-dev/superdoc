import { createRequire } from 'node:module';
import { describe, expect, it } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { resolveEngineVersion } = require('./sanitize-pack-manifest.cjs');

describe('resolveEngineVersion', () => {
  it('requires an exact workspace version inside Orbit', () => {
    expect(resolveEngineVersion('workspace:0.1.0', true)).toBe('0.1.0');
    expect(resolveEngineVersion('workspace:0.1.3-next.1', true)).toBe('0.1.3-next.1');
    expect(() => resolveEngineVersion('0.1.0', true)).toThrow(/workspace:0\.x in Orbit/u);
  });

  it('requires an exact published version in an exported checkout', () => {
    expect(resolveEngineVersion('0.1.0', false)).toBe('0.1.0');
    expect(resolveEngineVersion('0.1.3-next.1', false)).toBe('0.1.3-next.1');
    expect(() => resolveEngineVersion('workspace:0.1.0', false)).toThrow(/exact 0\.x/u);
    expect(() => resolveEngineVersion('^0.1.0', false)).toThrow(/exact 0\.x/u);
  });
});
