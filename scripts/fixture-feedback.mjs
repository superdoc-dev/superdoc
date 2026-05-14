#!/usr/bin/env node
/**
 * Fixture feedback harness — verifies a Word-native .docx through the
 * full SuperDoc round-trip and emits a structured JSON report.
 *
 * Two input modes:
 *
 *   --docx <path>
 *       Verify an existing .docx. The caller authored it however they
 *       wanted (Word API create_document, a real Word session, a
 *       third-party tool, etc.).
 *
 *   --build-via ooxml-fixture --type <name> --spec <spec.json>
 *       Build a spec-edge fixture via the Word API SDK CLI
 *       (tools/ooxml-fixture), then verify it. Convenience for the
 *       case where the agent is producing fixtures we can't get from
 *       Word COM.
 *
 * Pipeline (same for both modes):
 *   1. Resolve / build the input .docx
 *   2. Schema-validate the input via ooxml-fixture validate
 *   3. Open in a headless SuperDoc Editor
 *   4. Export back to .docx
 *   5. Schema-validate the export
 *   6. Emit one JSON envelope on stdout
 *
 * Per-fixture editor-state assertions are intentionally NOT in v1.
 * The first version surfaces "did SuperDoc consume and round-trip
 * this file at all" without committing to a per-fixture assertion
 * table. Once we see the actual editor JSON for each fixture type
 * we ship, v2 lands fixture-specific checks.
 *
 * Env:
 *   SUPERDOC_WORD_API_PATH   absolute path to the word-api repo; used
 *                            to locate tools/ooxml-fixture
 *
 * Run:
 *   SUPERDOC_WORD_API_PATH=/path/to/word-api \
 *     node scripts/fixture-feedback.mjs --docx some.docx
 *
 *   SUPERDOC_WORD_API_PATH=/path/to/word-api \
 *     node scripts/fixture-feedback.mjs \
 *       --build-via ooxml-fixture \
 *       --type tc-mar-logical \
 *       --spec spec.json
 *
 * Exit: 0 if input valid + import OK + export OK + output valid;
 *       1 otherwise. The structured envelope on stdout is the
 *       primary signal regardless of exit code.
 */

import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import { statSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORD_API_PATH = process.env.SUPERDOC_WORD_API_PATH;
if (!WORD_API_PATH) {
  console.error('error: SUPERDOC_WORD_API_PATH env var is required.');
  console.error('       Set it to the absolute path of the word-api repo so the harness can');
  console.error('       invoke tools/ooxml-fixture for validate/build.');
  process.exit(2);
}

const TOOL_PROJECT = join(WORD_API_PATH, 'tools', 'ooxml-fixture');

// ---------------------------------------------------------------------------
// Stale-dist precondition
// ---------------------------------------------------------------------------
// The harness imports `superdoc/super-editor`, which resolves to
// packages/superdoc/dist/super-editor.es.js. That dist is gitignored, so a
// branch can carry fresh source but a developer running the harness locally
// hits stale built code from a previous session. That false-positives bug
// reports against already-fixed source — exactly the SD-3158 trap.
//
// Fail fast with a clear message when the bundle is older than the converter
// or editor source. Opt into a rebuild with --auto-build.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPERDOC_BUNDLE = join(REPO_ROOT, 'packages/superdoc/dist/super-editor.es.js');
const SOURCE_ROOTS = [
  join(REPO_ROOT, 'packages/super-editor/src'),
  join(REPO_ROOT, 'packages/superdoc/src'),
];
const SOURCE_EXTS = new Set(['.js', '.ts', '.vue', '.mjs', '.cjs']);
const SKIP_DIR_NAMES = new Set(['__tests__', '__mocks__', 'node_modules', 'dist']);

function newestSourceMtime(root) {
  if (!existsSync(root)) return 0;
  let newest = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(ent.name)) continue;
        stack.push(join(dir, ent.name));
        continue;
      }
      if (!ent.isFile()) continue;
      const name = ent.name;
      // Exclude test/spec files — they edit independently of the bundle and
      // would false-flag the staleness gate.
      if (/\.(test|spec)\.[mc]?[jt]s$/.test(name)) continue;
      const dot = name.lastIndexOf('.');
      if (dot < 0 || !SOURCE_EXTS.has(name.slice(dot))) continue;
      try {
        const m = statSync(join(dir, name)).mtimeMs;
        if (m > newest) newest = m;
      } catch {
        // ignore unreadable file
      }
    }
  }
  return newest;
}

function preflightDistStaleness({ autoBuild }) {
  if (!existsSync(SUPERDOC_BUNDLE)) {
    if (autoBuild) {
      console.error('fixture-feedback: packages/superdoc/dist is missing. Running pnpm build:superdoc...');
      const r = spawnSync('pnpm', ['build:superdoc'], { stdio: 'inherit', cwd: REPO_ROOT });
      if (r.status !== 0) { console.error('fixture-feedback: pnpm build:superdoc failed.'); process.exit(2); }
      return;
    }
    console.error('fixture-feedback: packages/superdoc/dist is missing.');
    console.error('  Run: pnpm build:superdoc');
    console.error('  Or pass --auto-build.');
    process.exit(2);
  }
  const bundleMtime = statSync(SUPERDOC_BUNDLE).mtimeMs;
  let newestSource = 0;
  for (const root of SOURCE_ROOTS) {
    newestSource = Math.max(newestSource, newestSourceMtime(root));
  }
  if (newestSource > bundleMtime) {
    if (autoBuild) {
      console.error('fixture-feedback: packages/superdoc/dist is stale. Running pnpm build:superdoc...');
      const r = spawnSync('pnpm', ['build:superdoc'], { stdio: 'inherit', cwd: REPO_ROOT });
      if (r.status !== 0) { console.error('fixture-feedback: pnpm build:superdoc failed.'); process.exit(2); }
      return;
    }
    console.error('fixture-feedback: packages/superdoc/dist is stale.');
    console.error(`  Bundle mtime:        ${new Date(bundleMtime).toISOString()}`);
    console.error(`  Newest source mtime: ${new Date(newestSource).toISOString()}`);
    console.error('  Run: pnpm build:superdoc');
    console.error('  Or pass --auto-build.');
    process.exit(2);
  }
}

// Run the preflight before importing Editor — the import itself reads the
// dist, so the staleness check must happen first.
preflightDistStaleness({ autoBuild: process.argv.includes('--auto-build') });

const { Editor } = await import('superdoc/super-editor');

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { docx: null, buildVia: null, type: null, spec: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--docx':           args.docx = argv[++i]; break;
      case '--build-via':      args.buildVia = argv[++i]; break;
      case '--type':           args.type = argv[++i]; break;
      case '--spec':           args.spec = argv[++i]; break;
      case '--auto-build':     /* consumed by preflightDistStaleness */ break;
      case '--help': case '-h': printHelp(); process.exit(0);
      default:
        console.error(`unknown flag: ${argv[i]}`);
        printHelp();
        process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  console.error(`usage:
  fixture-feedback --docx <path> [--auto-build]
  fixture-feedback --build-via ooxml-fixture --type <name> --spec <spec.json> [--auto-build]

  --auto-build   run pnpm build:superdoc when packages/superdoc/dist is stale
                 instead of exiting with a stale-dist precondition error.`);
}

// ---------------------------------------------------------------------------
// ooxml-fixture wrappers
// ---------------------------------------------------------------------------

function runDotnet(args) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn('dotnet', ['run', '--project', TOOL_PROJECT, '-c', 'Release', '--', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', rejectP);
    child.on('close', (code) => resolveP({ exitCode: code ?? -1, stdout, stderr }));
  });
}

function extractEnvelope(stdout) {
  // The CLI prints one JSON object. Use first `{` / last `}` to skip
  // any incidental warnings printed before/after the envelope.
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(stdout.slice(start, end + 1)); }
  catch { return null; }
}

async function buildViaOoxmlFixture({ type, spec }) {
  const r = await runDotnet(['build', '--type', type, '--spec', spec, '--out', /*placeholder*/'']);
  // Above won't work — build needs --out before the build run. Call with explicit out path.
  throw new Error('buildViaOoxmlFixture should not be called directly');
}

async function buildViaOoxmlFixtureWithOut({ type, spec, out }) {
  const r = await runDotnet(['build', '--type', type, '--spec', spec, '--out', out]);
  const env = extractEnvelope(r.stdout);
  return { exitCode: r.exitCode, envelope: env, stderr: r.stderr };
}

async function validateViaOoxmlFixture(path) {
  const r = await runDotnet(['validate', '--in', path]);
  const env = extractEnvelope(r.stdout);
  return { exitCode: r.exitCode, envelope: env, stderr: r.stderr };
}

// ---------------------------------------------------------------------------
// SuperDoc round-trip
// ---------------------------------------------------------------------------

async function superdocRoundtrip(inputPath, outDir) {
  const exportPath = join(outDir, `roundtrip-${basename(inputPath)}`);
  const result = {
    open: 'not-run',
    openError: null,
    export: 'not-run',
    exportError: null,
    exportPath: null,
  };
  let bytes;
  try {
    bytes = await readFile(inputPath);
  } catch (e) {
    result.open = 'error';
    result.openError = `read input failed: ${e.message}`;
    return result;
  }

  let editor;
  try {
    editor = await Editor.open(bytes, {
      documentId: inputPath,
      user: { id: 'fixture-feedback', name: 'fixture-feedback harness' },
      telemetry: { metadata: { source: 'fixture-feedback' } },
    });
    result.open = 'pass';
  } catch (e) {
    result.open = 'fail';
    result.openError = e.message?.slice(0, 400) ?? String(e);
    return result;
  }

  try {
    const exported = await editor.exportDocx();
    if (!exported || exported.length === 0) {
      result.export = 'fail';
      result.exportError = 'exportDocx returned empty bytes';
    } else {
      const buf = Buffer.isBuffer(exported) ? exported : Buffer.from(exported);
      await writeFile(exportPath, buf);
      result.export = 'pass';
      result.exportPath = exportPath;
    }
  } catch (e) {
    result.export = 'fail';
    result.exportError = e.message?.slice(0, 400) ?? String(e);
  }

  try { editor.destroy?.(); } catch {}
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Resolve input docx — either provided or built.
  let source, inputPath, fixtureType = null;
  const outDir = await mkdtemp(join(tmpdir(), 'fixture-feedback-'));

  if (args.docx) {
    source = 'docx';
    inputPath = resolve(args.docx);
    try { await access(inputPath); }
    catch { console.error(`error: --docx file not found: ${inputPath}`); process.exit(2); }
  } else if (args.buildVia === 'ooxml-fixture') {
    if (!args.type || !args.spec) {
      console.error('error: --build-via ooxml-fixture requires --type and --spec');
      process.exit(2);
    }
    source = 'ooxml-fixture';
    fixtureType = args.type;
    inputPath = join(outDir, `${args.type}.docx`);
    const built = await buildViaOoxmlFixtureWithOut({ type: args.type, spec: resolve(args.spec), out: inputPath });
    if (built.exitCode !== 0 || !built.envelope?.valid) {
      // Surface the build failure as the report and exit early.
      const report = {
        source,
        fixtureType,
        input: { path: inputPath, validated: !!built.envelope?.validated, valid: !!built.envelope?.valid, errorCount: built.envelope?.errorCount ?? 0, errors: built.envelope?.errors ?? [] },
        superdoc: { open: 'not-run', export: 'not-run' },
        output: { validated: false, valid: false, errorCount: 0, errors: [] },
        note: 'build via ooxml-fixture failed; skipped SuperDoc round-trip',
      };
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
  } else {
    console.error('error: must specify --docx <path> or --build-via ooxml-fixture');
    printHelp();
    process.exit(2);
  }

  // Validate the input.
  const inputValidate = await validateViaOoxmlFixture(inputPath);
  const inputReport = {
    path: inputPath,
    validated: inputValidate.exitCode !== 2 && inputValidate.envelope != null,
    valid: inputValidate.envelope?.valid === true,
    errorCount: inputValidate.envelope?.errorCount ?? 0,
    errors: inputValidate.envelope?.errors ?? [],
  };

  // SuperDoc round-trip.
  const rt = await superdocRoundtrip(inputPath, outDir);

  // Validate the export, if produced.
  let outputReport = { validated: false, valid: false, errorCount: 0, errors: [] };
  if (rt.export === 'pass' && rt.exportPath) {
    const outputValidate = await validateViaOoxmlFixture(rt.exportPath);
    outputReport = {
      path: rt.exportPath,
      validated: outputValidate.exitCode !== 2 && outputValidate.envelope != null,
      valid: outputValidate.envelope?.valid === true,
      errorCount: outputValidate.envelope?.errorCount ?? 0,
      errors: outputValidate.envelope?.errors ?? [],
    };
  }

  const report = {
    source,
    fixtureType,
    input: inputReport,
    superdoc: {
      open: rt.open,
      openError: rt.openError,
      export: rt.export,
      exportError: rt.exportError,
      exportPath: rt.exportPath,
    },
    output: outputReport,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    inputReport.valid &&
    rt.open === 'pass' &&
    rt.export === 'pass' &&
    outputReport.valid;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('fatal:', e.message ?? e);
  process.exit(3);
});
