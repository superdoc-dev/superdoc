/**
 * SD-2864: single source of truth for the published superdoc type surface.
 *
 * The same taxonomy was previously duplicated across four files:
 *   - packages/superdoc/scripts/ensure-types.cjs
 *   - packages/superdoc/scripts/audit-declarations.cjs
 *   - packages/superdoc/vite.config.js
 *   - packages/superdoc/tsconfig.json
 *
 * Adding a new public-surface relocation required coordinated edits to all
 * four. PR #3144 (pm-adapter) and several SD-2893 stack PRs each shipped a
 * regression caused by drift between these lists. This config consolidates
 * the canonical data so each consumer derives what it needs from a single
 * place.
 *
 * Shape:
 *   - `requiredEntryPoints`: dist d.ts paths that must exist after build.
 *   - `handwrittenDtsBlocklist`: filenames in source that must NOT be
 *     copied into dist (internal-only ambient declarations).
 *   - `relocations`: workspace packages whose types appear on the public
 *     surface. Each entry pairs the rewriter rule with the source paths
 *     vite-plugin-dts and tsconfig.json need to include for the
 *     declarations to be emitted into superdoc/dist.
 *   - `sharedCommonDtsTargets`: filenames in `shared/common/` that the
 *     postbuild step compiles via tsc. Used for relocations whose source
 *     lives outside `packages/` and would otherwise shift the
 *     vite-plugin-dts common-ancestor.
 *   - `relocationGuardPackages`: packages that must never appear as a
 *     `declare module` block in `_internal-shims.d.ts` (audit Rule 3).
 *     SD-2942 removed the shim mechanism; this list is kept as defense
 *     against stale tarballs and future re-introduction.
 *   - `unshimmedPrivateSpecifiers`: bare specifiers that, if a future
 *     mechanism re-introduces shim generation, must not be auto-shimmed.
 *     They should fail audit Rule 1 instead.
 *   - `rule1Allowlist`: bare `@superdoc/*` specifiers permitted in
 *     published d.ts. Currently only the legacy public super-editor
 *     surface per RFC Decision 1.
 *
 * Adding a new relocation: append one entry to `relocations` with the
 * package specifier, the dist target the rewriter should point at, and
 * the source-include patterns vite + tsconfig need. Every consumer picks
 * up the new entry without further edits.
 */

const requiredEntryPoints = [
  'superdoc/src/index.d.ts',
  'superdoc/src/super-editor.d.ts',
  'super-editor/src/index.d.ts',
  'super-editor/src/types.d.ts',
];

/**
 * Foundational source roots tsconfig.json must include but `relocations`
 * does not own. These are the public-package sources themselves
 * (`superdoc/src`, `super-editor/src`, `document-api/src`), distinct from
 * the workspace-internal packages relocated via `relocations`. The
 * tsconfig parity check expects exactly this base set plus the union of
 * `relocations[*].tsconfigIncludes`.
 */
const baseTsconfigIncludes = ['src', '../super-editor/src', '../document-api/src'];

const handwrittenDtsBlocklist = [
  // Ambient module declarations for internal `@superdoc/super-editor/converter/internal/...`
  // subpaths. Nothing in superdoc's shipped surface imports those subpaths,
  // so the declarations would only leak the bare specifiers into published d.ts.
  // Keep the file in source for super-editor's own typecheck; just don't ship it. (SD-2859)
  'converter-internal.d.ts',
];

/**
 * Each relocation describes a private workspace package whose types appear
 * on the public surface, plus the source patterns needed to emit those
 * declarations into superdoc/dist.
 *
 * - `pkg`: the bare specifier consumers' d.ts files reference.
 * - `distEntry`: the file path (relative to dist root) that the rewriter
 *   redirects bare specifiers to. Must be emitted by either vite-plugin-dts
 *   (full-glob include) or the postbuild tsc step (sharedCommonDtsTargets).
 * - `matchSubpaths`: when true, the rewriter also rewrites
 *   `pkg/<subpath>` → `distEntry` with `/index.js` swapped for `/<subpath>`.
 *   When false, only the exact `pkg` specifier is rewritten; subpaths
 *   fall through to audit Rule 1 (used for narrow relocations like
 *   pm-adapter where only specific subpaths are emitted).
 * - `viteIncludes`: glob/file patterns added to vite-plugin-dts's
 *   `include` array. Multiple entries are allowed when the relocation
 *   needs sibling files (e.g. style-engine/ooxml depends on cascade.ts).
 * - `tsconfigIncludes`: parallel paths added to tsconfig.json's
 *   `include` array. The check-tsconfig script verifies parity.
 */
const relocations = [
  {
    pkg: '@superdoc/contracts',
    distEntry: 'layout-engine/contracts/src/index.d.ts',
    matchSubpaths: true,
    viteIncludes: ['../layout-engine/contracts/src/**/*'],
    tsconfigIncludes: ['../layout-engine/contracts/src'],
  },
  {
    pkg: '@superdoc/dom-contract',
    distEntry: 'layout-engine/dom-contract/src/index.d.ts',
    matchSubpaths: true,
    viteIncludes: ['../layout-engine/dom-contract/src/**/*'],
    tsconfigIncludes: ['../layout-engine/dom-contract/src'],
  },
  {
    pkg: '@superdoc/layout-bridge',
    distEntry: 'layout-engine/layout-bridge/src/index.d.ts',
    matchSubpaths: true,
    viteIncludes: ['../layout-engine/layout-bridge/src/**/*'],
    tsconfigIncludes: ['../layout-engine/layout-bridge/src'],
  },
  {
    pkg: '@superdoc/layout-engine',
    distEntry: 'layout-engine/layout-engine/src/index.d.ts',
    matchSubpaths: true,
    viteIncludes: ['../layout-engine/layout-engine/src/**/*'],
    tsconfigIncludes: ['../layout-engine/layout-engine/src'],
  },
  {
    pkg: '@superdoc/painter-dom',
    distEntry: 'layout-engine/painters/dom/src/index.d.ts',
    matchSubpaths: true,
    viteIncludes: ['../layout-engine/painters/dom/src/**/*'],
    tsconfigIncludes: ['../layout-engine/painters/dom/src'],
  },
  // pm-adapter: subpath-only. The full barrel pulls in @superdoc/style-engine
  // and other internal packages that would re-expand the shim list.
  {
    pkg: '@superdoc/pm-adapter/converter-context.js',
    distEntry: 'layout-engine/pm-adapter/src/converter-context.d.ts',
    matchSubpaths: false,
    viteIncludes: ['../layout-engine/pm-adapter/src/converter-context.ts'],
    tsconfigIncludes: ['../layout-engine/pm-adapter/src/converter-context.ts'],
  },
  {
    pkg: '@superdoc/pm-adapter/sections/types.js',
    distEntry: 'layout-engine/pm-adapter/src/sections/types.d.ts',
    matchSubpaths: false,
    viteIncludes: ['../layout-engine/pm-adapter/src/sections/types.ts'],
    tsconfigIncludes: ['../layout-engine/pm-adapter/src/sections/types.ts'],
  },
  // style-engine/ooxml: subpath-only. Includes the ooxml subtree plus the
  // sibling cascade.ts dependency it imports.
  {
    pkg: '@superdoc/style-engine/ooxml',
    distEntry: 'layout-engine/style-engine/src/ooxml/index.d.ts',
    matchSubpaths: false,
    viteIncludes: [
      '../layout-engine/style-engine/src/ooxml/**/*',
      '../layout-engine/style-engine/src/cascade.ts',
    ],
    tsconfigIncludes: [
      '../layout-engine/style-engine/src/ooxml',
      '../layout-engine/style-engine/src/cascade.ts',
    ],
  },
  // common/list-marker-utils and common (bare): emitted via tsc-postbuild
  // (see sharedCommonDtsTargets) because the source lives in shared/, which
  // would shift the vite-plugin-dts common-ancestor if added to vite include.
  // Empty viteIncludes/tsconfigIncludes are deliberate: ensure-types.cjs's
  // tsc-postbuild step handles emit; no vite/tsconfig participation needed.
  {
    pkg: '@superdoc/common/list-marker-utils',
    distEntry: 'shared/common/list-marker-utils.d.ts',
    matchSubpaths: false,
    viteIncludes: [], // emitted via sharedCommonDtsTargets tsc-postbuild
    tsconfigIncludes: [],
  },
  {
    pkg: '@superdoc/common',
    distEntry: 'shared/common/comments-types.d.ts',
    matchSubpaths: false,
    viteIncludes: [], // emitted via sharedCommonDtsTargets tsc-postbuild
    tsconfigIncludes: [],
  },
];

/**
 * Filenames in `shared/common/` that the postbuild tsc step compiles into
 * `dist/shared/common/`. Each filename pairs with a `relocations` entry
 * whose `distEntry` lives at `shared/common/<filename without .ts>.d.ts`.
 */
const sharedCommonDtsTargets = [
  'list-marker-utils.ts',
  'layout-constants.ts', // dependency of list-marker-utils
  'comments-types.ts',
];

/**
 * Packages that must NEVER appear as a `declare module` entry in
 * `_internal-shims.d.ts`. After SD-2942 the shim file is no longer emitted,
 * so this list is a defense against stale tarballs and future
 * re-introduction. Mirrored automatically by ensure-types and audit.
 */
const relocationGuardPackages = [
  '@superdoc/document-api',
  '@superdoc/contracts',
  '@superdoc/dom-contract',
  '@superdoc/layout-bridge',
  '@superdoc/layout-engine',
  '@superdoc/painter-dom',
  '@superdoc/pm-adapter',
  '@superdoc/style-engine',
  '@superdoc/common',
  '@superdoc/common/list-marker-utils',
];

/**
 * Bare specifiers that any future shim-generation mechanism must NOT
 * shim. They should fail audit Rule 1 instead. Used today only as
 * forward-compat documentation; the SD-2942 removal made shim
 * generation a no-op.
 */
const unshimmedPrivateSpecifiers = ['@superdoc/pm-adapter', '@superdoc/style-engine'];

/**
 * Bare `@superdoc/*` specifiers permitted in published d.ts beyond the
 * relocation rules. Currently only the legacy public super-editor surface
 * per RFC Decision 1; consumers resolve it through the `superdoc/super-editor`
 * subpath export at runtime.
 */
const rule1Allowlist = {
  '@superdoc/super-editor': 'legacy public surface (RFC Decision 1)',
};

module.exports = {
  requiredEntryPoints,
  handwrittenDtsBlocklist,
  baseTsconfigIncludes,
  relocations,
  sharedCommonDtsTargets,
  relocationGuardPackages,
  unshimmedPrivateSpecifiers,
  rule1Allowlist,
};
