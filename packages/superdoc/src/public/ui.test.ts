import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_COMMAND_IDS,
  createSuperDocUI,
  shallowEqual,
} from './ui.js';

/**
 * Smoke test for the public facade ui entry (SD-3183).
 * Three runtime re-exports cover the entry. Declaration-side validation
 * (70-symbol set, leak grep) lives in
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs`. Bundle-shape
 * validation lives in `packages/superdoc/scripts/audit-bundle.cjs`.
 */
describe('public facade (ui)', () => {
  it('re-exports createSuperDocUI as a function', () => {
    expect(typeof createSuperDocUI).toBe('function');
  });

  it('re-exports shallowEqual as a function', () => {
    expect(typeof shallowEqual).toBe('function');
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('re-exports BUILT_IN_COMMAND_IDS as an object', () => {
    expect(typeof BUILT_IN_COMMAND_IDS).toBe('object');
    expect(BUILT_IN_COMMAND_IDS).not.toBeNull();
  });
});
