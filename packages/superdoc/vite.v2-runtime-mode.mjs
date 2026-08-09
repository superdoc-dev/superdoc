// vite.v2-runtime-mode.mjs - dual-mode v2 runtime resolver.
//
// The customer `superdoc` package consumes the internal v2 browser integration
// through the stable `@superdoc/docx-engine` contract. Headless internals stay on the
// private `@superdoc/headless` package; `@superdoc/docx-engine` must not expose
// `./headless*` subpaths. There are exactly two resolution modes:
//
//   package (default for build / pack / release / public clone / CI)
//     - `@superdoc/docx-engine*` resolves through normal node resolution to the
//       installed dist-only package, OR (Orbit local substitute) to built
//       dists under `superdoc/v2` when the package is not
//       installed.
//     - NEVER aliases into `superdoc/v2/**/src`.
//     - No `source` export condition.
//
//   source (Orbit-only local dev/watch/test, must be opted into)
//     - `@superdoc/docx-engine*` and the private implementation packages alias into
//       `superdoc/v2/**/src` for full v2 + public HMR.
//     - Requires `superdoc/v2` source to exist; fails clearly otherwise.
//
// Mode selection:
//   - `SUPERDOC_V2_RUNTIME_MODE=package|source` is authoritative when set.
//   - With no env: defaults to `package`, including the Vite dev server.
//     Orbit HMR uses explicit `dev:orbit` / `watch:orbit` scripts that set
//     `SUPERDOC_V2_RUNTIME_MODE=source`. Build/pack/release must never
//     auto-select source.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const PACKAGE_MODE = 'package';
export const SOURCE_MODE = 'source';

const VALID_MODES = new Set([PACKAGE_MODE, SOURCE_MODE]);

/**
 * Resolve the engine package through the active package-manager graph. In
 * Orbit this resolves the workspace link; in a standalone public checkout it
 * resolves the installed package. The build therefore does not need to assume
 * that a private sibling directory exists above the checkout.
 *
 * @param {string | URL} fromUrl module URL used as the resolution base
 */
export function resolveEnginePackageRoot(fromUrl) {
  const require = createRequire(fromUrl);
  return path.dirname(require.resolve('@superdoc/docx-engine/package.json'));
}

/**
 * Build the source-mode alias set (Orbit dev only). Maps the private v2
 * contract AND the internal implementation packages into the private v2 source
 * tree.
 *
 * @param {{ v2Root: string, layoutEngineRoot: string }} roots
 */
export function buildSourceModeAliases({ v2Root, layoutEngineRoot }) {
  return [
    {
      find: '@superdoc/review-index/worker-entry',
      replacement: path.resolve(v2Root, 'packages/review-index/src/worker/review-index-worker-entry.ts'),
    },
    {
      find: '@superdoc/review-index/worker',
      replacement: path.resolve(v2Root, 'packages/review-index/src/worker/index.ts'),
    },
    {
      find: /^@superdoc\/review-index$/,
      replacement: path.resolve(v2Root, 'packages/review-index/src/index.ts'),
    },
    {
      find: '@superdoc/docx-engine/collaboration-upgrade-engine',
      replacement: path.resolve(v2Root, 'src/collaboration-upgrade-engine.ts'),
    },
    // Default-integration entry consumed by core/v2-integration.
    { find: '@superdoc/v2-browser-shell/superdoc', replacement: path.resolve(v2Root, 'v2-browser-shell/src/superdoc/index.ts') },
    { find: '@superdoc/v2-browser-shell/vue', replacement: path.resolve(v2Root, 'v2-browser-shell/src/vue/index.ts') },
    { find: '@superdoc/v2-browser-shell/superdoc-bridge', replacement: path.resolve(v2Root, 'v2-browser-shell/src/superdoc-bridge/index.ts') },
    { find: '@superdoc/v2-browser-shell/browser', replacement: path.resolve(v2Root, 'v2-browser-shell/src/browser.ts') },
    { find: /^@superdoc\/v2-browser-shell$/, replacement: path.resolve(v2Root, 'v2-browser-shell/src/index.ts') },
    // `@superdoc/docx-engine` product entry specifiers.
    { find: /^@superdoc\/docx-engine$/, replacement: path.resolve(v2Root, 'src/superdoc/index.ts') },
    // editor-core kernel
    { find: '@superdoc/editor-core/browser', replacement: path.resolve(v2Root, 'editor-core/src/browser.ts') },
    { find: '@superdoc/editor-core/document/internal', replacement: path.resolve(v2Root, 'editor-core/src/document/sd-document-session-internal.ts') },
    { find: '@superdoc/editor-core/fixtures', replacement: path.resolve(v2Root, 'editor-core/src/document/source-signals/fixtures.ts') },
    { find: '@superdoc/editor-core/search', replacement: path.resolve(v2Root, 'editor-core/src/search/index.ts') },
    { find: /^@superdoc\/editor-core$/, replacement: path.resolve(v2Root, 'editor-core/src/browser.ts') },
    { find: /^@superdoc\/document-compare$/, replacement: path.resolve(v2Root, 'document-compare/src/index.ts') },
    // collaboration-v2
    { find: '@superdoc/collaboration-v2/legacy', replacement: path.resolve(v2Root, 'collaboration-v2/src/legacy/index.ts') },
    { find: '@superdoc/collaboration-v2/projection/session-controller', replacement: path.resolve(v2Root, 'collaboration-v2/src/projection/session-controller.ts') },
    { find: '@superdoc/collaboration-v2/setup', replacement: path.resolve(v2Root, 'collaboration-v2/src/setup/index.ts') },
    { find: /^@superdoc\/collaboration-v2$/, replacement: path.resolve(v2Root, 'collaboration-v2/src/index.ts') },
    // document-api-v2-adapter
    { find: '@superdoc/document-api-v2-adapter/browser', replacement: path.resolve(v2Root, 'document-api-v2-adapter/src/browser.ts') },
    { find: '@superdoc/document-api-v2-adapter/projection/source-provider', replacement: path.resolve(v2Root, 'document-api-v2-adapter/src/projection/source-provider.ts') },
    { find: '@superdoc/document-api-v2-adapter/worker/node', replacement: path.resolve(v2Root, 'document-api-v2-adapter/src/worker/node-channel.ts') },
    { find: '@superdoc/document-api-v2-adapter/worker', replacement: path.resolve(v2Root, 'document-api-v2-adapter/src/worker/index.ts') },
    { find: /^@superdoc\/document-api-v2-adapter$/, replacement: path.resolve(v2Root, 'document-api-v2-adapter/src/index.ts') },
    // compare domain
    { find: /^@superdoc\/document-compare$/, replacement: path.resolve(v2Root, 'document-compare/src/index.ts') },
    // Public layout packages consumed by private V2 source. Keep these on the
    // live public source tree in Orbit source mode; pnpm file: snapshots under
    // superdoc/v2/node_modules can lag behind the checkout and stale Vite deps.
    { find: /^@superdoc\/contracts$/, replacement: path.resolve(layoutEngineRoot, 'contracts/src/index.ts') },
    { find: /^@superdoc\/dom-contract$/, replacement: path.resolve(layoutEngineRoot, 'dom-contract/src/index.ts') },
    { find: /^@superdoc\/layout-engine$/, replacement: path.resolve(layoutEngineRoot, 'layout-engine/src/index.ts') },
    {
      find: /^@superdoc\/measuring-dom\/canvas-resolver$/,
      replacement: path.resolve(layoutEngineRoot, 'measuring/dom/src/canvas-resolver.ts'),
    },
    { find: /^@superdoc\/measuring-dom$/, replacement: path.resolve(layoutEngineRoot, 'measuring/dom/src/index.ts') },
    { find: /^@superdoc\/painter-dom\/ruler-core$/, replacement: path.resolve(layoutEngineRoot, 'painters/dom/src/ruler/ruler-core.ts') },
    { find: /^@superdoc\/painter-dom$/, replacement: path.resolve(layoutEngineRoot, 'painters/dom/src/index.ts') },
    {
      find: /^@superdoc\/style-engine\/ooxml\/word-style-model\/parse-xml$/,
      replacement: path.resolve(layoutEngineRoot, 'style-engine/src/ooxml/word-style-model/parse-xml.ts'),
    },
    {
      find: /^@superdoc\/style-engine\/ooxml\/word-style-model\/parse-theme$/,
      replacement: path.resolve(layoutEngineRoot, 'style-engine/src/ooxml/word-style-model/parse-theme.ts'),
    },
    { find: /^@superdoc\/style-engine\/normalize$/, replacement: path.resolve(layoutEngineRoot, 'style-engine/src/normalize/index.ts') },
    { find: /^@superdoc\/style-engine\/ooxml$/, replacement: path.resolve(layoutEngineRoot, 'style-engine/src/ooxml/index.ts') },
    { find: /^@superdoc\/style-engine$/, replacement: path.resolve(layoutEngineRoot, 'style-engine/src/index.ts') },
    { find: /^@superdoc\/word-layout$/, replacement: path.resolve(layoutEngineRoot, '../word-layout/src/index.ts') },
    // headless / host / layout adapter / style model
    { find: '@superdoc/headless/contracts', replacement: path.resolve(v2Root, 'headless/src/contracts/index.ts') },
    { find: '@superdoc/headless/browser', replacement: path.resolve(v2Root, 'headless/src/browser.ts') },
    { find: '@superdoc/headless/host', replacement: path.resolve(v2Root, 'headless/src/host.ts') },
    // Unit 4 (worker collaboration): the shell's collaboration worker entry
    // re-exports these subpaths; source mode must resolve them so Vite's
    // static module-worker transform bundles the entry.
    { find: '@superdoc/headless/worker/collaboration-entry', replacement: path.resolve(v2Root, 'headless/src/worker/browser-collaboration-worker-entry.ts') },
    { find: '@superdoc/headless/worker/collaboration', replacement: path.resolve(v2Root, 'headless/src/worker/collaboration-worker-opener.ts') },
    { find: /^@superdoc\/headless\/extensions$/, replacement: path.resolve(v2Root, 'headless/src/extensions/index.ts') },
    { find: /^@superdoc\/headless$/, replacement: path.resolve(v2Root, 'headless/src/index.ts') },
    { find: '@superdoc/v2-host/browser', replacement: path.resolve(v2Root, 'v2-host/src/browser.ts') },
    { find: '@superdoc/v2-host/review-ui', replacement: path.resolve(v2Root, 'v2-host/src/review-ui.ts') },
    { find: /^@superdoc\/v2-host$/, replacement: path.resolve(v2Root, 'v2-host/src/index.ts') },
    { find: /^@superdoc\/v2-layout-adapter$/, replacement: path.resolve(v2Root, 'v2-layout-adapter/src/index.ts') },
    { find: /^@superdoc\/style-model$/, replacement: path.resolve(v2Root, 'style-model/src/index.ts') },
  ];
}

/**
 * Build the package-mode local-substitute alias set: maps the `@superdoc/docx-engine`
 * product subpaths and private `@superdoc/headless` package subpaths onto built
 * local dists. This is used only when the engine package is not node-installed
 * (Orbit reproducing release behavior); a real public clone resolves through
 * node_modules and needs no aliases. Crucially this points at `dist/`, never
 * `src/`.
 *
 * @param {string} v2Dist absolute path to `superdoc/v2/dist`
 * @param {string} [headlessDist] absolute path to `superdoc/v2/headless/dist`
 */
export function buildPackageModeDistAliases(v2Dist, headlessDist = path.join(path.dirname(v2Dist), 'headless', 'dist')) {
  return [
    {
      find: /^@superdoc\/docx-engine\/collaboration-upgrade-engine$/,
      replacement: path.join(v2Dist, 'collaboration-upgrade-engine.js'),
    },
    { find: /^@superdoc\/headless\/contracts$/, replacement: path.join(headlessDist, 'contracts/index.js') },
    { find: /^@superdoc\/headless\/browser$/, replacement: path.join(headlessDist, 'browser.js') },
    { find: /^@superdoc\/headless\/host$/, replacement: path.join(headlessDist, 'host.js') },
    // Unit 4 (worker collaboration): dist substitutes for the collaboration
    // worker entry/opener subpaths (Orbit reproducing release behavior).
    { find: /^@superdoc\/headless\/worker\/collaboration-entry$/, replacement: path.join(headlessDist, 'worker/browser-collaboration-worker-entry.js') },
    { find: /^@superdoc\/headless\/worker\/collaboration$/, replacement: path.join(headlessDist, 'worker/collaboration-worker-opener.js') },
    { find: /^@superdoc\/headless\/extensions$/, replacement: path.join(headlessDist, 'extensions/index.js') },
    { find: /^@superdoc\/headless$/, replacement: path.join(headlessDist, 'index.js') },
    { find: '@superdoc/docx-engine/style.css', replacement: path.join(v2Dist, 'style.css') },
    { find: /^@superdoc\/docx-engine$/, replacement: path.join(v2Dist, 'docx-engine.es.js') },
  ];
}

// Whether `@superdoc/docx-engine` is installed in `node_modules` reachable from
// `packageRoot` (so the production bundler can resolve it through normal
// node_modules resolution). We deliberately do NOT use `require.resolve(...)`
// here: when the build runs under a tsx-patched loader (Vite 7), tsx's
// workspace-aware resolver reports the private `superdoc/v2` SOURCE workspace
// as resolvable even though it is not linked into `node_modules`. Rollup does
// not have that resolver, so it then fails on `@superdoc/docx-engine`. Walking
// `node_modules/@superdoc/docx-engine` matches exactly what the bundler can follow: a
// real public clone (package installed) returns true; the Orbit checkout
// (package not installed, separate workspace) returns false and falls through
// to the built `superdoc/v2/dist` substitute aliases below.
function canNodeResolveV2(packageRoot) {
  let dir = packageRoot;
  for (;;) {
    const nodeV2Root = path.join(dir, 'node_modules', '@superdoc', 'docx-engine');
    if (
      existsSync(path.join(nodeV2Root, 'package.json')) &&
      existsSync(path.join(nodeV2Root, 'dist', 'docx-engine.es.js')) &&
      existsSync(path.join(nodeV2Root, 'dist', 'collaboration-upgrade-engine.js'))
    ) {
      return true;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Resolve the active v2 runtime mode and the resolver inputs (aliases +
 * conditions) the Vite configs should apply.
 *
 * @param {object} params
 * @param {'build'|'serve'} params.command
 * @param {NodeJS.ProcessEnv} [params.env]
 * @param {string} params.packageRoot absolute path to packages/superdoc
 * @param {string} params.v2Root absolute path to superdoc/v2
 * @param {string} params.layoutEngineRoot absolute path to packages/layout-engine
 * @returns {{ mode: string, reason: string, aliases: Array, conditions: string[] }}
 */
export function resolveSuperDocV2RuntimeMode({ command, env = process.env, packageRoot, v2Root, layoutEngineRoot }) {
  const requested = env.SUPERDOC_V2_RUNTIME_MODE;
  if (requested && !VALID_MODES.has(requested)) {
    throw new Error(
      `[v2-runtime-mode] invalid SUPERDOC_V2_RUNTIME_MODE="${requested}"; expected "package" or "source".`,
    );
  }

  const v2SourceExists = existsSync(path.join(v2Root, 'src', 'superdoc', 'index.ts'));

  let mode;
  let reason;
  if (requested) {
    mode = requested;
    reason = `explicit SUPERDOC_V2_RUNTIME_MODE=${requested}`;
  } else {
    mode = PACKAGE_MODE;
    reason = command === 'serve' ? 'dev server default' : 'build/pack/release default';
  }

  if (mode === SOURCE_MODE) {
    if (!v2SourceExists) {
      throw new Error(
        `[v2-runtime-mode] source mode requires private v2 source at ${path.join(v2Root, 'src/superdoc/index.ts')}, which is missing.`,
      );
    }
    const aliases = buildSourceModeAliases({ v2Root, layoutEngineRoot });
    return { mode, reason, aliases, conditions: ['source'] };
  }

  // package mode
  const v2Dist = path.join(v2Root, 'dist');
  if (existsSync(path.join(v2Dist, 'docx-engine.es.js'))) {
    const headlessDist = path.join(v2Root, 'headless', 'dist');
    const aliases = [
      ...buildPackageModeDistAliases(v2Dist, headlessDist),
      { find: /^@superdoc\/dom-contract$/, replacement: path.resolve(layoutEngineRoot, 'dom-contract/src/index.ts') },
    ];
    assertNoSrcAliases(aliases, v2Root);
    return { mode, reason: `${reason} (local superdoc/v2/dist substitute)`, aliases, conditions: [] };
  }

  if (canNodeResolveV2(packageRoot)) {
    // Normal node resolution handles `@superdoc/docx-engine`; only the dom-contract alias
    // for the public layout-engine remains (that is a public package).
    const aliases = [
      { find: /^@superdoc\/dom-contract$/, replacement: path.resolve(layoutEngineRoot, 'dom-contract/src/index.ts') },
    ];
    return { mode, reason: `${reason} (node-resolved @superdoc/docx-engine)`, aliases, conditions: [] };
  }

  throw new Error(
    `[v2-runtime-mode] package mode could not resolve @superdoc/docx-engine: it is not installed and no built ${v2Dist} exists. ` +
      'Install @superdoc/docx-engine, or run `pnpm run build:superdoc` from superdoc/public for a local substitute, ' +
      'or use SUPERDOC_V2_RUNTIME_MODE=source for Orbit dev.',
  );
}

/**
 * Guard: package mode must never alias into the private v2 source tree.
 */
export function assertNoSrcAliases(aliases, v2Root) {
  const srcRoot = path.join(v2Root, 'src');
  const offenders = [];
  for (const alias of aliases) {
    const replacement = typeof alias.replacement === 'string' ? alias.replacement : '';
    if (
      replacement.startsWith(`${srcRoot}${path.sep}`) ||
      replacement.includes(`${path.sep}v2${path.sep}`) && replacement.includes(`${path.sep}src${path.sep}`) && replacement.startsWith(v2Root)
    ) {
      offenders.push(`${String(alias.find)} -> ${replacement}`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `[v2-runtime-mode] package mode must not alias into superdoc/v2 source:\n  ${offenders.join('\n  ')}`,
    );
  }
}
