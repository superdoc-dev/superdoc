import { describe, it, expect } from 'vite-plus/test';
import { SuperDoc } from './index.js';

/**
 * Smoke test for the public facade root entry (SD-3178).
 *
 * SuperDoc is the only runtime constructor on the v2 root facade. The
 * verification of declaration emit (symbol set, ESM/CJS parity, augmentation
 * survival) lives in `packages/superdoc/scripts/verify-public-facade-emit.cjs`,
 * which runs as a postbuild step.
 */
describe('public facade (root)', () => {
  it('re-exports SuperDoc as a constructor', () => {
    expect(typeof SuperDoc).toBe('function');
    expect(SuperDoc.name).toBe('SuperDoc');
  });
});
