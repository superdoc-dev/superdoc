import { describe, expect, test } from 'bun:test';
import { resolveJsWatchdogTimeout } from '../host.js';

// Must stay in sync with the constants in host.ts. Duplicated here on
// purpose — the constants aren't exported, and the test should fail if the
// production headroom drifts unintentionally.
const HOST_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const WATCHDOG_HEADROOM_MS = 5_000;

describe('resolveJsWatchdogTimeout', () => {
  test('defaults: widens above the host ceiling so host TIMEOUT wins the race', () => {
    // Regression guard for the PR-3369 review finding `default-watchdog-race`:
    // pre-fix, with neither option set both sides ran 30s timers and the JS
    // watchdog could fire first, surfacing the legacy error string.
    const watchdog = resolveJsWatchdogTimeout(30_000, undefined, undefined);
    expect(watchdog).toBeGreaterThanOrEqual(HOST_DEFAULT_REQUEST_TIMEOUT_MS + WATCHDOG_HEADROOM_MS);
  });

  test('honors an explicit watchdogTimeoutMs higher than the default', () => {
    // If the caller deliberately raised the watchdog above what we'd derive,
    // keep their value.
    expect(resolveJsWatchdogTimeout(120_000, undefined, undefined)).toBe(120_000);
  });

  test('widens above an explicit requestTimeoutMs', () => {
    expect(resolveJsWatchdogTimeout(30_000, 60_000, undefined)).toBe(60_000 + WATCHDOG_HEADROOM_MS);
  });

  test('keeps the larger of watchdogTimeoutMs and (requestTimeoutMs + headroom)', () => {
    expect(resolveJsWatchdogTimeout(200_000, 60_000, undefined)).toBe(200_000);
  });

  test('widens above a per-call timeoutMs override', () => {
    expect(resolveJsWatchdogTimeout(30_000, undefined, 90_000)).toBe(90_000 + WATCHDOG_HEADROOM_MS);
  });

  test('per-call override wins over client-level requestTimeoutMs', () => {
    // The per-call value reflects an intent specific to this invoke; honor it.
    expect(resolveJsWatchdogTimeout(30_000, 60_000, 120_000)).toBe(120_000 + WATCHDOG_HEADROOM_MS);
  });
});
