import { describe, it, expect } from 'vitest';
import { useHeadlessToolbar } from './headless-toolbar-vue.js';

/**
 * Smoke test for the legacy public facade headless-toolbar/vue entry
 * (SD-3207). Verifies the runtime re-export is present so the facade
 * file does not show 0% on the unit-test coverage report. Declaration-
 * side validation lives in
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs`.
 */
describe('public facade (legacy/headless-toolbar-vue)', () => {
  it('re-exports useHeadlessToolbar as a function', () => {
    expect(typeof useHeadlessToolbar).toBe('function');
  });
});
