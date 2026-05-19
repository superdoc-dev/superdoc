/**
 * SuperDoc public facade: legacy converter entry.
 *
 * SD-3180 under SD-3178 (Phase 3 of SD-3175). Mirrors the existing
 * `superdoc/converter` subpath under the path-as-contract structure.
 *
 * Classification: **legacy public compatibility surface** per
 * `docs/architecture/package-boundaries.md` Decision 4. New code should
 * import `SuperConverter` from `superdoc` directly.
 *
 * AIDEV-NOTE: The runtime contract for `superdoc/converter` today exports
 * both `SuperConverter` and `hasBodyNumberingReferences` (see
 * `packages/superdoc/dist/super-editor/converter.es.js`). The existing
 * types entry only declares `SuperConverter`, so the SD-3176 typed
 * snapshot shows 1 name while the runtime contract has 2. This facade
 * types both so Phase 4 can flip `package.json#exports` without
 * regressing JS consumers doing
 * `import { hasBodyNumberingReferences } from 'superdoc/converter'`.
 * Adding or removing an export here updates the `expectedNames` for
 * the `legacy/converter` entry in `FACADE_ENTRIES` inside
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs` in the
 * same PR.
 */
export { SuperConverter, hasBodyNumberingReferences } from '@superdoc/super-editor/converter';
