import { describe, it, expect } from 'vitest';
import {
  createHeadlessToolbar,
  headlessToolbarConstants,
  headlessToolbarHelpers,
} from './headless-toolbar.js';

/**
 * Smoke test for the legacy public facade headless-toolbar entry (SD-3179).
 * The three runtime re-exports need coverage so the facade file does not
 * show 0% on the unit-test coverage report. Declaration-side validation
 * (symbol set, ESM/CJS parity, leak grep) lives in
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs`.
 */
describe('public facade (legacy/headless-toolbar)', () => {
  it('re-exports createHeadlessToolbar as a function', () => {
    expect(typeof createHeadlessToolbar).toBe('function');
  });

  it('re-exports headlessToolbarConstants as an object', () => {
    expect(headlessToolbarConstants).toBeDefined();
    expect(typeof headlessToolbarConstants).toBe('object');
  });

  it('re-exports headlessToolbarHelpers as an object', () => {
    expect(headlessToolbarHelpers).toBeDefined();
    expect(typeof headlessToolbarHelpers).toBe('object');
  });
});
