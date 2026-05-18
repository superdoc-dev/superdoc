/**
 * SuperDoc public facade: legacy file-zipper entry.
 *
 * SD-3180 under SD-3178 (Phase 3 of SD-3175). Mirrors the existing
 * `superdoc/file-zipper` subpath under the path-as-contract structure.
 *
 * Classification: **legacy public compatibility surface** per
 * `docs/architecture/package-boundaries.md` Decision 4. New code should
 * import `createZip` from `superdoc` directly.
 *
 * AIDEV-NOTE: Single-export facade. Growing this list ships a new public
 * symbol through a legacy compat path. Update `expectedNames` for the
 * `legacy/file-zipper` entry in `FACADE_ENTRIES` inside
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs` in the
 * same PR.
 */
export { createZip } from '@superdoc/super-editor/file-zipper';
