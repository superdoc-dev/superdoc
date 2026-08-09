import { describe, expect, it } from 'vite-plus/test';
import { resolveExactEngineVersion } from './cdn-engine-version.js';

describe('resolveExactEngineVersion', () => {
  it('requires an exact workspace version when the internal engine is present', () => {
    expect(resolveExactEngineVersion('workspace:0.1.0', true)).toBe('0.1.0');
    expect(resolveExactEngineVersion('workspace:0.1.3-next.1', true)).toBe('0.1.3-next.1');
    expect(() => resolveExactEngineVersion('0.1.0', true)).toThrow(/workspace:0\.x in Orbit/u);
    expect(() => resolveExactEngineVersion('workspace:*', true)).toThrow(/workspace:0\.x in Orbit/u);
  });

  it('requires an exact published version when the internal engine is absent', () => {
    expect(resolveExactEngineVersion('0.1.0', false)).toBe('0.1.0');
    expect(resolveExactEngineVersion('0.1.3-next.1', false)).toBe('0.1.3-next.1');
    expect(() => resolveExactEngineVersion('workspace:0.1.0', false)).toThrow(/exact 0\.x/u);
    expect(() => resolveExactEngineVersion('^0.1.0', false)).toThrow(/exact 0\.x/u);
  });
});
