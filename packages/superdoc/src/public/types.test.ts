import { describe, it, expect } from 'vitest';
import * as typesNS from './types.js';

/**
 * Smoke test for the public facade types entry (SD-3184).
 *
 * `superdoc/types` is a type-only subpath — no runtime exports. The runtime
 * bundle should be effectively empty. Declaration-side validation (116-symbol
 * type set, ESM/CJS parity) lives in
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs`.
 */
describe('public facade (types)', () => {
  it('runtime module has no enumerable exports (type-only contract)', () => {
    const keys = Object.keys(typesNS).filter((k) => k !== 'default');
    expect(keys).toEqual([]);
  });
});
