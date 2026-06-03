import { describe, it, expect } from 'vitest';
import { SuperDoc, Editor } from './index.js';

/**
 * Smoke test for the public facade root entry (SD-3178).
 *
 * The two runtime re-exports (`SuperDoc`, `Editor`) need coverage so the
 * facade file does not show 0% on the unit-test coverage report. The
 * verification of declaration emit (symbol set, ESM/CJS parity, augmentation
 * survival) lives in `packages/superdoc/scripts/verify-public-facade-emit.cjs`,
 * which runs as a postbuild step.
 */
describe('public facade (root)', () => {
  it('re-exports SuperDoc as a constructor', () => {
    expect(typeof SuperDoc).toBe('function');
    expect(SuperDoc.name).toBe('SuperDoc');
  });

  it('re-exports Editor as a constructor', () => {
    expect(typeof Editor).toBe('function');
    expect(Editor.name).toBe('Editor');
  });
});
