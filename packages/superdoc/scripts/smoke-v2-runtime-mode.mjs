#!/usr/bin/env node
//
// smoke-v2-runtime-mode.mjs - dual-mode v2 resolver smoke.
//
// Proves the publishing-boundary invariants of the v2 runtime resolver without
// running a full build:
//
//   - Orbit source mode aliases the private v2 contract into `superdoc/v2/**/src`
//     and enables the `source` export condition (fast HMR).
//   - Package mode never aliases into `superdoc/v2/**/src` (release safety).
//   - Package mode works with only a built `superdoc/v2/dist` and NO `src/`
//     present - i.e. a public clone can build without the private v2 source.
//   - Source mode fails clearly when private v2 source is absent.
//   - Plain dev/build/pack/release never auto-select source mode.

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACKAGE_MODE,
  SOURCE_MODE,
  assertNoSrcAliases,
  resolveEnginePackageRoot,
  resolveSuperDocV2RuntimeMode,
} from '../vite.v2-runtime-mode.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');
const V2_ROOT = resolveEnginePackageRoot(import.meta.url);
const LAYOUT_ENGINE_ROOT = path.resolve(PACKAGE_ROOT, '../layout-engine');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n    ${error instanceof Error ? error.message : error}`);
  }
}

function aliasReplacements(resolution) {
  return resolution.aliases.map((a) => (typeof a.replacement === 'string' ? a.replacement : ''));
}

function hasAlias(resolution, find, replacement) {
  return resolution.aliases.some((alias) => String(alias.find) === find && alias.replacement === replacement);
}

function aliasesTouchV2Src(resolution, v2Root = V2_ROOT) {
  const srcRoot = path.join(v2Root, 'src');
  return aliasReplacements(resolution).some((r) => r.startsWith(`${srcRoot}${path.sep}`));
}

function withBuiltV2DistFixture(fn) {
  const tmpV2 = mkdtempSync(path.join(tmpdir(), 'superdoc-v2-dist-'));
  try {
    mkdirSync(path.join(tmpV2, 'dist'), { recursive: true });
    writeFileSync(path.join(tmpV2, 'dist', 'docx-engine.es.js'), 'export {};\n');
    writeFileSync(path.join(tmpV2, 'dist', 'collaboration-upgrade-engine.js'), 'export {};\n');
    writeFileSync(path.join(tmpV2, 'dist', 'style.css'), '');
    return fn(tmpV2);
  } finally {
    rmSync(tmpV2, { recursive: true, force: true });
  }
}

console.log('[smoke:v2-resolver] dual-mode v2 runtime resolver');

const v2SourcePresent = existsSync(path.join(V2_ROOT, 'src', 'superdoc', 'index.ts'));
const v2DistPresent = existsSync(path.join(V2_ROOT, 'dist', 'docx-engine.es.js'));

check('build defaults to package mode (never auto-source)', () => {
  withBuiltV2DistFixture((v2Root) => {
    const r = resolveSuperDocV2RuntimeMode({
      command: 'build',
      env: {},
      packageRoot: PACKAGE_ROOT,
      v2Root,
      layoutEngineRoot: LAYOUT_ENGINE_ROOT,
    });
    if (r.mode !== PACKAGE_MODE) throw new Error(`expected package mode, got ${r.mode}`);
  });
});

check('dev server defaults to package mode unless source mode is explicit', () => {
  withBuiltV2DistFixture((v2Root) => {
    const r = resolveSuperDocV2RuntimeMode({
      command: 'serve',
      env: {},
      packageRoot: PACKAGE_ROOT,
      v2Root,
      layoutEngineRoot: LAYOUT_ENGINE_ROOT,
    });
    if (r.mode !== PACKAGE_MODE) throw new Error(`expected package mode, got ${r.mode}`);
    if (r.conditions.includes('source')) throw new Error('implicit dev mode must not use source conditions');
  });
});

check('package mode never aliases into superdoc/v2/**/src', () => {
  withBuiltV2DistFixture((v2Root) => {
    const r = resolveSuperDocV2RuntimeMode({
      command: 'build',
      env: { SUPERDOC_V2_RUNTIME_MODE: 'package' },
      packageRoot: PACKAGE_ROOT,
      v2Root,
      layoutEngineRoot: LAYOUT_ENGINE_ROOT,
    });
    assertNoSrcAliases(r.aliases, v2Root);
    if (aliasesTouchV2Src(r, v2Root)) throw new Error('package-mode alias points into v2 src');
    if (r.conditions.includes('source')) throw new Error('package mode must not use the source export condition for v2');
  });
});

if (v2SourcePresent) {
  check('Orbit source mode aliases into v2 src and enables the source condition', () => {
    const r = resolveSuperDocV2RuntimeMode({
      command: 'serve',
      env: { SUPERDOC_V2_RUNTIME_MODE: 'source' },
      packageRoot: PACKAGE_ROOT,
      v2Root: V2_ROOT,
      layoutEngineRoot: LAYOUT_ENGINE_ROOT,
    });
    if (r.mode !== SOURCE_MODE) throw new Error(`expected source mode, got ${r.mode}`);
    if (!aliasesTouchV2Src(r)) throw new Error('source mode did not alias into v2 src');
    if (!r.conditions.includes('source')) throw new Error('source mode must enable the source condition');
    const layoutEngineSource = path.join(LAYOUT_ENGINE_ROOT, 'layout-engine', 'src', 'index.ts');
    if (!aliasReplacements(r).includes(layoutEngineSource)) {
      throw new Error('source mode must alias @superdoc/layout-engine to source');
    }
    const contractsSource = path.join(LAYOUT_ENGINE_ROOT, 'contracts', 'src', 'index.ts');
    if (!hasAlias(r, '/^@superdoc\\/contracts$/', contractsSource)) {
      throw new Error('source mode must alias @superdoc/contracts to live public source');
    }
  });
} else {
  console.log('  (skip) Orbit source-mode case - superdoc/v2 source not present');
}

// Public-clone equivalent: a v2 root with ONLY dist (no src). Proves package
// mode builds without the private v2 source tree, and source mode fails clearly.
check('package mode resolves with only superdoc/v2/dist (no src) - public clone equivalent', () => {
  if (!v2DistPresent) {
    console.log('    (note) superdoc/v2/dist not built; skipping dist-substitute assertion');
    return;
  }
  const tmpV2 = mkdtempSync(path.join(tmpdir(), 'superdoc-v2-distonly-'));
  try {
    cpSync(path.join(V2_ROOT, 'dist'), path.join(tmpV2, 'dist'), { recursive: true });
    if (existsSync(path.join(tmpV2, 'src'))) throw new Error('fixture unexpectedly has src/');
    const r = resolveSuperDocV2RuntimeMode({
      command: 'build',
      env: { SUPERDOC_V2_RUNTIME_MODE: 'package' },
      packageRoot: PACKAGE_ROOT,
      v2Root: tmpV2,
      layoutEngineRoot: LAYOUT_ENGINE_ROOT,
    });
    if (r.mode !== PACKAGE_MODE) throw new Error(`expected package mode, got ${r.mode}`);
    assertNoSrcAliases(r.aliases, tmpV2);
    const hasSuperdocEntry = aliasReplacements(r).some((rep) => rep.endsWith('docx-engine.es.js'));
    if (!hasSuperdocEntry) throw new Error('package mode did not map @superdoc/docx-engine onto the dist entry');
    const hasUpgradeEngine = aliasReplacements(r).some((rep) => rep.endsWith('collaboration-upgrade-engine.js'));
    if (!hasUpgradeEngine) throw new Error('package mode did not map the collaboration upgrade engine build input');

    let threw = false;
    try {
      resolveSuperDocV2RuntimeMode({
        command: 'serve',
        env: { SUPERDOC_V2_RUNTIME_MODE: 'source' },
        packageRoot: PACKAGE_ROOT,
        v2Root: tmpV2,
        layoutEngineRoot: LAYOUT_ENGINE_ROOT,
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('source mode must fail clearly when v2 source is absent');
  } finally {
    rmSync(tmpV2, { recursive: true, force: true });
  }
});

check('invalid mode value is rejected', () => {
  let threw = false;
  try {
    resolveSuperDocV2RuntimeMode({
      command: 'build',
      env: { SUPERDOC_V2_RUNTIME_MODE: 'bogus' },
      packageRoot: PACKAGE_ROOT,
      v2Root: V2_ROOT,
      layoutEngineRoot: LAYOUT_ENGINE_ROOT,
    });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('invalid mode should throw');
});

check('package mode rejects node-linked @superdoc/docx-engine when package dist is missing', () => {
  const tmpPackageRoot = mkdtempSync(path.join(tmpdir(), 'superdoc-v2-node-linked-'));
  const tmpV2Root = mkdtempSync(path.join(tmpdir(), 'superdoc-v2-empty-dist-'));
  try {
    writeFileSync(path.join(tmpV2Root, 'package.json'), '{"name":"@superdoc/docx-engine"}\n');
    mkdirSync(path.join(tmpPackageRoot, 'node_modules', '@superdoc'), { recursive: true });
    cpSync(tmpV2Root, path.join(tmpPackageRoot, 'node_modules', '@superdoc', 'docx-engine'), { recursive: true });

    let threw = false;
    try {
      resolveSuperDocV2RuntimeMode({
        command: 'build',
        env: { SUPERDOC_V2_RUNTIME_MODE: 'package' },
        packageRoot: tmpPackageRoot,
        v2Root: tmpV2Root,
        layoutEngineRoot: LAYOUT_ENGINE_ROOT,
      });
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('missing node-installed dist should not be treated as resolvable');
  } finally {
    rmSync(tmpPackageRoot, { recursive: true, force: true });
    rmSync(tmpV2Root, { recursive: true, force: true });
  }
});

if (failures > 0) {
  console.error(`[smoke:v2-resolver] FAIL (${failures} check(s) failed)`);
  process.exit(1);
}
console.log('[smoke:v2-resolver] PASS');
