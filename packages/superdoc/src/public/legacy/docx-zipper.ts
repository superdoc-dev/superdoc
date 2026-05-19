/**
 * SuperDoc public facade: legacy docx-zipper entry.
 *
 * SD-3180 under SD-3178 (Phase 3 of SD-3175). Mirrors the existing
 * `superdoc/docx-zipper` subpath under the path-as-contract structure.
 *
 * AIDEV-NOTE: This entry is a **default export**, not a named export.
 * The current public contract is `import DocxZipper from 'superdoc/docx-zipper'`,
 * which means the resolved declaration's exported name must be `default`.
 * Importing the default from the narrow `@superdoc/super-editor/docx-zipper`
 * subpath and re-exporting it as the default preserves that contract and
 * keeps the emitted bundle narrow (no broad super-editor root graph).
 *
 * Classification: **legacy public compatibility surface** per
 * `docs/architecture/package-boundaries.md` Decision 4. New code should
 * import `DocxZipper` from `superdoc` directly:
 *
 *   import { DocxZipper } from 'superdoc';
 *
 * AIDEV-NOTE: Single-export facade. Update `expectedNames` for the
 * `legacy/docx-zipper` entry in `FACADE_ENTRIES` inside
 * `packages/superdoc/scripts/verify-public-facade-emit.cjs` in the
 * same PR if the surface changes.
 */
import DocxZipper from '@superdoc/super-editor/docx-zipper';
export default DocxZipper;
