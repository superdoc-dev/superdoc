import { describe, it, expect } from 'vitest';
import {
  SuperDocUIProvider,
  useSuperDocUI,
  useSuperDocSelection,
  useSuperDocComments,
  useSuperDocZoom,
  useSetSuperDoc,
} from './ui-react.js';

/**
 * Smoke test for the public facade ui-react entry (SD-3182).
 * Confirms the runtime re-exports resolve. Declaration-side validation
 * (symbol set, leak grep) lives in
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs`.
 */
describe('public facade (ui-react)', () => {
  it('re-exports SuperDocUIProvider as a component', () => {
    expect(typeof SuperDocUIProvider).toBe('function');
  });

  it('re-exports useSuperDocUI as a hook', () => {
    expect(typeof useSuperDocUI).toBe('function');
  });

  it('re-exports domain hooks as functions', () => {
    expect(typeof useSuperDocSelection).toBe('function');
    expect(typeof useSuperDocComments).toBe('function');
    expect(typeof useSuperDocZoom).toBe('function');
    expect(typeof useSetSuperDoc).toBe('function');
  });
});
