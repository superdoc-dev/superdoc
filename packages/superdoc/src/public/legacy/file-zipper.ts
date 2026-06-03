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
 * The postbuild gate `verify-public-facade-emit.cjs` parses this file
 * and verifies that the emitted declarations expose exactly these
 * named exports. No second hand-maintained list to keep in sync.
 * same PR.
 */
export { createZip } from '@superdoc/super-editor/file-zipper';
