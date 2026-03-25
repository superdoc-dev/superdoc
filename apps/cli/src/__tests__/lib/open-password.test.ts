import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolvePassword } from '../../lib/open-password';

describe('resolvePassword', () => {
  const originalEnv = process.env.SUPERDOC_DOC_PASSWORD;

  beforeEach(() => {
    delete process.env.SUPERDOC_DOC_PASSWORD;
  });

  afterEach(() => {
    if (originalEnv != null) {
      process.env.SUPERDOC_DOC_PASSWORD = originalEnv;
    } else {
      delete process.env.SUPERDOC_DOC_PASSWORD;
    }
  });

  test('explicit password takes precedence over env var', () => {
    process.env.SUPERDOC_DOC_PASSWORD = 'env-secret';
    expect(resolvePassword('explicit-secret')).toBe('explicit-secret');
  });

  test('env fallback is used when no explicit password and allowEnvFallback is true', () => {
    process.env.SUPERDOC_DOC_PASSWORD = 'env-secret';
    expect(resolvePassword(undefined, true)).toBe('env-secret');
  });

  test('env fallback is used by default (allowEnvFallback defaults to true)', () => {
    process.env.SUPERDOC_DOC_PASSWORD = 'env-secret';
    expect(resolvePassword()).toBe('env-secret');
  });

  test('env fallback is suppressed in host mode (allowEnvFallback=false)', () => {
    process.env.SUPERDOC_DOC_PASSWORD = 'env-secret';
    expect(resolvePassword(undefined, false)).toBeUndefined();
  });

  test('explicit password still works when env fallback is disabled', () => {
    process.env.SUPERDOC_DOC_PASSWORD = 'env-secret';
    expect(resolvePassword('explicit-secret', false)).toBe('explicit-secret');
  });

  test('returns undefined when no explicit password and no env var', () => {
    expect(resolvePassword()).toBeUndefined();
  });

  test('returns undefined when both sources are absent and fallback disabled', () => {
    expect(resolvePassword(undefined, false)).toBeUndefined();
  });
});
