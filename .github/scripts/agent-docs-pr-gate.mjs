#!/usr/bin/env node
/**
 * Delta-only high-confidence gate. Fails the workflow when the PR introduces
 * NEW high-confidence agent-doc findings vs base.
 *
 * High-confidence classes:
 *   - broken @imports
 *   - broken symlink targets
 *   - linked-inverted pairs
 *   - unexpected-duplicate pairs
 *
 * Heuristic / advisory classes are explicitly excluded to keep the false-
 * positive rate near zero: brokenPathRefs (backtick regex), budget warnings,
 * unresolvedCommands.
 *
 * Writes the result to GATE_RESULT_PATH so the comment step can surface
 * "Blocking" state inline. Exits 1 if blocking, 0 otherwise.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runL1Scan } from './agent-docs-l1.mjs';

const REPO_ROOT = resolve(process.env.REPO_ROOT ?? process.cwd());
const BASE_REF = process.env.BASE_REF || 'main';
const PR = process.env.PR_NUMBER;
const REPO = process.env.REPO ?? 'superdoc-dev/superdoc';
const RESULT_PATH = process.env.GATE_RESULT_PATH || '/tmp/agent-docs-gate.json';
const DRY_RUN = process.argv.includes('--dry-run');

function isAgentDocPath(path) {
  if (/(?:^|\/)(?:AGENTS|CLAUDE)(?:\.local)?\.md$/.test(path)) return true;
  return /(?:^|\/)\.claude\/rules\/.+\.md$/.test(path);
}

function getChangedAgentDocs() {
  if (DRY_RUN) {
    const idx = process.argv.indexOf('--files');
    if (idx < 0) return [];
    return (process.argv[idx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean).filter(isAgentDocPath);
  }
  if (!PR) return [];
  try {
    const out = execFileSync('gh', ['pr', 'diff', PR, '--repo', REPO, '--name-only'], { encoding: 'utf-8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean).filter(isAgentDocPath);
  } catch (err) {
    console.log(`Could not list PR changed files: ${err.message}`);
    return [];
  }
}

function changedPairDirs(paths) {
  const dirs = new Set();
  for (const path of paths) {
    if (/(?:^|\/)(?:AGENTS|CLAUDE)(?:\.local)?\.md$/.test(path)) {
      dirs.add(dirname(path));
    }
  }
  return dirs;
}

function highConfidenceFindings(scan) {
  const findings = [];
  for (const file of scan.files) {
    if (file.brokenSymlinkTarget) {
      findings.push({
        type: 'broken-symlink',
        relPath: file.relPath,
        target: file.brokenSymlinkTarget,
        id: `symlink:${file.relPath}`,
      });
    }
    if (file.isSymlink) continue;
    for (const importPath of file.brokenImports) {
      findings.push({
        type: 'broken-import',
        relPath: file.relPath,
        importPath,
        id: `import:${file.relPath}:${importPath}`,
      });
    }
  }
  for (const pair of scan.pairs) {
    if (pair.classification === 'linked-inverted' || pair.classification === 'unexpected-duplicate') {
      findings.push({
        type: 'pair',
        dir: pair.dir,
        classification: pair.classification,
        detail: pair.detail,
        id: `pair:${pair.dir}:${pair.classification}`,
      });
    }
  }
  return findings;
}

function prepareBaseSnapshot() {
  execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', BASE_REF], { cwd: REPO_ROOT, stdio: 'inherit' });
  const baseDir = mkdtempSync(join(tmpdir(), 'agent-docs-base-'));
  execFileSync('git', ['worktree', 'add', '--detach', baseDir, `origin/${BASE_REF}`], { cwd: REPO_ROOT, stdio: 'inherit' });
  return baseDir;
}

function cleanupBaseSnapshot(baseDir) {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', baseDir], { cwd: REPO_ROOT, stdio: 'ignore' });
  } catch {
    rmSync(baseDir, { recursive: true, force: true });
  }
}

function writeResult(result) {
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
}

const changed = getChangedAgentDocs();
if (changed.length === 0) {
  console.log('No agent-doc files changed; gate is a no-op.');
  writeResult({ blocking: false, newFindings: [], changed: [] });
  process.exit(0);
}

console.log(`Changed agent-doc files: ${changed.join(', ')}`);

const headScan = runL1Scan(REPO_ROOT);
const headFindings = highConfidenceFindings(headScan);

let baseScan = null;
let baseDir = null;
try {
  if (DRY_RUN) {
    const baseFromFlag = process.argv.indexOf('--base-root');
    if (baseFromFlag >= 0 && process.argv[baseFromFlag + 1]) {
      baseScan = runL1Scan(resolve(process.argv[baseFromFlag + 1]));
    }
  } else {
    baseDir = prepareBaseSnapshot();
    baseScan = runL1Scan(baseDir);
  }
} finally {
  if (baseDir) cleanupBaseSnapshot(baseDir);
}

const baseFindings = baseScan ? highConfidenceFindings(baseScan) : [];
const baseIds = new Set(baseFindings.map((f) => f.id));
const newFindings = headFindings.filter((f) => !baseIds.has(f.id));

// Pair-to-single regression: base had a paired classification (linked,
// linked-inverted, unexpected-duplicate, intentional-different), head has
// 'single' in the same dir. Bare 'single' is legitimate for fresh packages,
// so this is meaningful only as a delta.
if (baseScan) {
  const baseDirHadPair = new Map();
  for (const pair of baseScan.pairs) {
    if (pair.classification !== 'single') baseDirHadPair.set(pair.dir, pair.classification);
  }
  for (const pair of headScan.pairs) {
    if (pair.classification !== 'single') continue;
    if (!baseDirHadPair.has(pair.dir)) continue;
    newFindings.push({
      type: 'pair-to-single',
      dir: pair.dir,
      detail: pair.detail,
      wasClassification: baseDirHadPair.get(pair.dir),
      id: `pair-to-single:${pair.dir}`,
    });
  }
}

const changedSet = new Set(changed);
const dirSet = changedPairDirs(changed);

const scoped = newFindings.filter((f) => {
  if (f.type === 'pair' || f.type === 'pair-to-single') return dirSet.has(f.dir);
  return changedSet.has(f.relPath);
});

const result = { blocking: scoped.length > 0, newFindings: scoped, changed };
writeResult(result);

if (result.blocking) {
  console.log('\nBlocking — new high-confidence findings introduced by this PR:');
  for (const f of scoped) {
    if (f.type === 'broken-import') console.log(`  - broken @import in ${f.relPath}: ${f.importPath}`);
    else if (f.type === 'broken-symlink') console.log(`  - broken symlink ${f.relPath} -> ${f.target}`);
    else if (f.type === 'pair') console.log(`  - pair ${f.dir} ${f.classification}: ${f.detail}`);
    else if (f.type === 'pair-to-single') console.log(`  - pair-to-single in ${f.dir} (was ${f.wasClassification}): ${f.detail}`);
  }
  console.log(`\nWrote ${RESULT_PATH}`);
  process.exit(1);
}

console.log('No new high-confidence findings introduced by this PR. Gate passes.');
process.exit(0);
