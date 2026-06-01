#!/usr/bin/env node
/**
 * Docs snippet type-check gate (SD-673).
 *
 * Extracts every "Full Example" code block in scope, writes each snippet to a
 * temp file, and runs `tsc --noEmit --strict` against the built superdoc
 * `dist`. Catches drift between docs examples and the typed public surface
 * (e.g. the SD-3526 class: `onReady: (superdoc) => superdoc.export(...)` —
 * the callback param is `{ superdoc }`, not the instance).
 *
 * Scope (v1):
 *   - apps/docs/editor/superdoc/**
 *   - pattern === 'superdoc' (snippets importing `superdoc` or
 *     instantiating `new SuperDoc`)
 *   - "Full Example" fenced blocks only (the canonical copy-pasteable
 *     form; "Usage" snippets are intentional fragments)
 *
 * Fences supported:
 *   - javascript / js → `.js` + `// @ts-check` + `allowJs` + `checkJs`
 *   - typescript / ts / tsx → `.ts` + strict
 *
 * Dist resolution: `superdoc` is resolved via tsconfig `paths` pointing at
 * `packages/superdoc/dist/superdoc/src/public/index.d.ts`. Docs CI builds
 * dist before this gate runs; local dev requires `pnpm --filter superdoc
 * build` first.
 *
 * Why dist, not source: docs examples are what consumers copy-paste. Source
 * types include internal helpers that aren't exported; checking against
 * dist matches what a real consumer would see.
 *
 * Why dist, not packed tarball: the packed-tarball matrix already covers
 * package-shape correctness (tests/consumer-typecheck). Adding a pack step
 * here would duplicate work and slow the gate; dist is a sufficient proxy
 * for consumer-facing types.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { extractExamples, type CodeExample } from './lib/extract.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(__dirname, '..');
const repoRoot = resolve(__dirname, '..', '..', '..');
const distTypesEntry = resolve(repoRoot, 'packages/superdoc/dist/superdoc/src/public/index.d.ts');

const SCOPE_PREFIX = 'editor/superdoc/';

/**
 * Ambient stubs for placeholder identifiers that appear in docs examples
 * (`yourFile`, `doc1`, etc.). Written to a shared `.d.ts` in the temp
 * project rather than prepended into each snippet, so it works for both
 * `.ts` and `.js` files (TS rejects `declare` inside `.js`).
 *
 * Kept intentionally tiny — when docs reference a new placeholder, prefer
 * fixing the doc rather than expanding this list.
 */
const PLACEHOLDERS_DTS = `
// Document/file placeholders used in docs examples.
declare const yourFile: File;
declare const file: File;
declare const doc1: File;
declare const doc2: File;
declare const content: string;

// Helper-function placeholders. Docs examples reference these to keep
// the focus on SuperDoc usage; the typecheck shouldn't require docs to
// inline a complete app. Signatures intentionally permissive (unknown
// args) so the doc reads naturally without leaking type assertions.
declare function cleanup(): void;
declare function autoSave(...args: unknown[]): void;
declare function adjustLayout(...args: unknown[]): void;
declare function showOnlineUsers(...args: unknown[]): void;
declare function updateUserCursors(...args: unknown[]): void;
declare function showLockBanner(...args: unknown[]): void;
`.trimStart();

function langKind(lang: string): 'js' | 'ts' | null {
  const l = lang.toLowerCase();
  if (l === 'js' || l === 'javascript') return 'js';
  if (l === 'ts' || l === 'typescript' || l === 'tsx') return 'ts';
  return null;
}

function inScope(example: CodeExample): boolean {
  if (example.pattern !== 'superdoc') return false;
  if (!example.file.startsWith(SCOPE_PREFIX)) return false;
  return langKind(example.lang) !== null;
}

interface PreparedExample {
  index: number;
  example: CodeExample;
  kind: 'js' | 'ts';
  tempFile: string;
}

function prepareTempProject(examples: CodeExample[]): { tempDir: string; prepared: PreparedExample[] } {
  const tempDir = mkdtempSync(join(tmpdir(), 'superdoc-doctest-types-'));
  const srcDir = join(tempDir, 'src');
  mkdirSync(srcDir, { recursive: true });

  // Shared ambient declarations file — picked up by tsconfig `include`
  // and visible to both .ts and .js example files in the same project.
  writeFileSync(join(srcDir, 'placeholders.d.ts'), PLACEHOLDERS_DTS);

  const prepared: PreparedExample[] = [];
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const kind = langKind(example.lang)!;
    const ext = kind === 'ts' ? 'ts' : 'js';
    const header = kind === 'js' ? '// @ts-check\n' : '';
    const tempFile = join(srcDir, `example-${i}.${ext}`);
    writeFileSync(tempFile, `${header}${example.code}\n`);
    prepared.push({ index: i, example, kind, tempFile });
  }

  // tsconfig: strict + allowJs/checkJs (only JS fences need them, but
  // enabling globally is simpler than per-file projects and TS only
  // checks .js when checkJs is on AND the file has // @ts-check or is
  // included by allowJs+checkJs).
  const tsconfig = {
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      allowJs: true,
      checkJs: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
      types: [],
      paths: {
        superdoc: [distTypesEntry],
      },
    },
    include: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.d.ts'],
  };
  writeFileSync(join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  return { tempDir, prepared };
}

interface TscError {
  file: string;
  line: number;
  col: number;
  message: string;
}

function parseTscErrors(stdout: string, tempDir: string): TscError[] {
  const errors: TscError[] = [];
  // tsc format: "src/example-0.ts(12,5): error TS2339: Property ..."
  const re = /^(.+?)\((\d+),(\d+)\): error TS\d+: (.+)$/;
  for (const line of stdout.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    errors.push({
      file: m[1].startsWith('/') ? m[1] : join(tempDir, m[1]),
      line: Number(m[2]),
      col: Number(m[3]),
      message: m[4],
    });
  }
  return errors;
}

function main(): void {
  if (!existsLocal(distTypesEntry)) {
    console.error(`[doctest-types] missing dist types entry: ${distTypesEntry}`);
    console.error(
      '[doctest-types] run `pnpm --filter superdoc build` first, or this script in a CI step ' +
        'that builds dist beforehand.',
    );
    process.exit(2);
  }

  const all = extractExamples(docsRoot);
  const inScopeExamples = all.filter(inScope);

  console.log('[doctest-types] SuperDoc docs snippet type-check (SD-673)');
  console.log('='.repeat(72));
  console.log(
    `Examples discovered (Full Example, superdoc-pattern): ${all.filter((e) => e.pattern === 'superdoc').length}`,
  );
  console.log(`In scope (${SCOPE_PREFIX}**, JS/TS fences):          ${inScopeExamples.length}`);
  console.log('');

  if (inScopeExamples.length === 0) {
    console.log('OK    no in-scope examples; nothing to check.');
    return;
  }

  const { tempDir, prepared } = prepareTempProject(inScopeExamples);
  let exitCode = 0;
  try {
    // tsc is resolved from the docs workspace (apps/docs/node_modules/.bin).
    const tscBin = resolve(docsRoot, '..', '..', 'node_modules', '.bin', 'tsc');
    const result = spawnSync(tscBin, ['-p', join(tempDir, 'tsconfig.json'), '--pretty', 'false'], {
      cwd: tempDir,
      encoding: 'utf8',
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const errors = parseTscErrors(stdout + stderr, tempDir);

    if (result.status === 0) {
      console.log(`OK    ${inScopeExamples.length} example(s) typechecked clean.`);
      return;
    }

    // Group errors by source example.
    const errorsByIndex = new Map<number, TscError[]>();
    for (const e of errors) {
      const m = e.file.match(/example-(\d+)\.(?:ts|js)/);
      if (!m) continue;
      const idx = Number(m[1]);
      const list = errorsByIndex.get(idx) ?? [];
      list.push(e);
      errorsByIndex.set(idx, list);
    }

    console.log(`FAIL  ${errorsByIndex.size} example(s) failed typecheck:`);
    console.log('');
    for (const [idx, errs] of [...errorsByIndex.entries()].sort((a, b) => a[0] - b[0])) {
      const p = prepared[idx];
      console.log(`  ${p.example.file}:${p.example.line}  (${p.example.section})  [${p.kind}]`);
      // Only the `// @ts-check` header is prepended (JS files only); the
      // shared placeholders.d.ts is a sibling file. Subtract that header
      // count to map tsc-reported lines back to docs source lines. The
      // example.line in the docs file is the fence-open line; the snippet
      // body starts at example.line + 1.
      const headerLines = p.kind === 'js' ? 1 : 0;
      for (const e of errs) {
        const snippetLine = e.line - headerLines;
        const sourceLine = snippetLine > 0 ? p.example.line + snippetLine : p.example.line;
        console.log(`    L${sourceLine}: ${e.message}`);
      }
      console.log('');
    }
    console.log(
      'Each example was extracted from a "Full Example" code block, given an\n' +
        'ambient prelude for placeholders (`yourFile`, `doc1`, `doc2`), and\n' +
        'typechecked against packages/superdoc/dist via `superdoc` module\n' +
        'resolution. Fix the example so it matches the typed public surface;\n' +
        'if the type itself is wrong, fix the type first.',
    );
    exitCode = 1;
  } finally {
    // Keep the temp dir on failure so devs can poke at the files.
    if (exitCode === 0) {
      rmSync(tempDir, { recursive: true, force: true });
    } else {
      console.log('');
      console.log(`(temp project preserved at ${tempDir} for inspection)`);
    }
  }
  process.exit(exitCode);
}

function existsLocal(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

main();
