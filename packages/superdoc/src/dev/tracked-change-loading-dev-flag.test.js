import { describe, expect, it } from 'vitest';

import {
  DISABLE_TRACKED_CHANGE_LOADING_DEFINE,
  DISABLE_TRACKED_CHANGE_LOADING_ENV,
  resolveDisableTrackedChangeLoading,
} from '../../vite.tracked-change-loading.mjs';

describe('tracked-change loading development flag', () => {
  it('defaults to normal tracked-change loading', () => {
    expect(resolveDisableTrackedChangeLoading({ command: 'serve', runtimeMode: 'source', env: {} })).toBe(false);
    expect(
      resolveDisableTrackedChangeLoading({
        command: 'serve',
        runtimeMode: 'source',
        env: { [DISABLE_TRACKED_CHANGE_LOADING_ENV]: '0' },
      }),
    ).toBe(false);
  });

  it('enables the bypass only for the Orbit source-mode dev server', () => {
    expect(
      resolveDisableTrackedChangeLoading({
        command: 'serve',
        runtimeMode: 'source',
        env: { [DISABLE_TRACKED_CHANGE_LOADING_ENV]: '1' },
      }),
    ).toBe(true);
    expect(DISABLE_TRACKED_CHANGE_LOADING_DEFINE).toBe('__SUPERDOC_DISABLE_TRACKED_CHANGE_LOADING__');
  });

  it.each([
    { command: 'build', runtimeMode: 'source' },
    { command: 'serve', runtimeMode: 'package' },
    { command: 'build', runtimeMode: 'package' },
  ])('rejects enabled use outside source dev: $command/$runtimeMode', ({ command, runtimeMode }) => {
    expect(() =>
      resolveDisableTrackedChangeLoading({
        command,
        runtimeMode,
        env: { [DISABLE_TRACKED_CHANGE_LOADING_ENV]: '1' },
      }),
    ).toThrow('allowed only for the Orbit source-mode dev server');
  });

  it('rejects ambiguous values', () => {
    expect(() =>
      resolveDisableTrackedChangeLoading({
        command: 'serve',
        runtimeMode: 'source',
        env: { [DISABLE_TRACKED_CHANGE_LOADING_ENV]: 'true' },
      }),
    ).toThrow('expected "0" or "1"');
  });
});
