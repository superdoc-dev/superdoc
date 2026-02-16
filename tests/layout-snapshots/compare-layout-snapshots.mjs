#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { normalizeVersionLabel } from './shared.mjs';

const cloneDeep = typeof structuredClone === 'function'
  ? structuredClone
  : (obj) => JSON.parse(JSON.stringify(obj));

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

const DEFAULT_CANDIDATE_ROOT = path.join(REPO_ROOT, 'tests', 'layout-snapshots', 'candidate');
const DEFAULT_REFERENCE_BASE = path.join(REPO_ROOT, 'tests', 'layout-snapshots', 'reference');
const DEFAULT_REPORTS_ROOT = path.join(REPO_ROOT, 'tests', 'layout-snapshots', 'reports');
const DEFAULT_VISUAL_WORKDIR = path.join(REPO_ROOT, 'devtools', 'visual-testing');
const CANDIDATE_EXPORT_SCRIPT_PATH = path.join(SCRIPT_DIR, 'export-layout-snapshots.mjs');
const NPM_EXPORT_SCRIPT_PATH = path.join(SCRIPT_DIR, 'export-layout-snapshots-npm.mjs');
const NPM_PACKAGE_NAME = 'superdoc';
const DEFAULT_NPM_DIST_TAG = 'next';

function printHelp() {
  console.log(`
Usage:
  bun tests/layout-snapshots/compare-layout-snapshots.mjs [--reference <version> | --reference-root <path>] [options]

Options:
      --reference <version>           Reference version label/spec (default: npm ${NPM_PACKAGE_NAME}@${DEFAULT_NPM_DIST_TAG})
      --reference-root <path>         Use explicit reference folder path instead of --reference
      --reference-base <path>         Reference base folder (default: ${DEFAULT_REFERENCE_BASE})
      --candidate-root <path>         Candidate folder (default: ${DEFAULT_CANDIDATE_ROOT})
      --reports-root <path>           Reports parent folder (default: ${DEFAULT_REPORTS_ROOT})
      --report-dir <path>             Exact report output folder (default: auto timestamped)
      --auto-generate-candidate       Regenerate candidate snapshots before compare (default: on)
      --no-auto-generate-candidate    Do not regenerate candidate snapshots before compare
      --auto-generate-reference       Generate missing reference snapshots automatically (default: on)
      --no-auto-generate-reference    Do not auto-generate missing reference snapshots
      --jobs <n>                      Worker count if auto-generating snapshots/references (default: 4)
      --pipeline <mode>               headless | presentation for auto-generation (default: headless)
      --installer <name>              auto | bun | npm for auto-generation (default: auto)
      --input-root <path>             Input docs root for auto-generation
      --numeric-tolerance <value>     Number comparison tolerance (default: 0.001)
      --max-diff-entries <n>          Max diff entries per doc (default: 2000)
      --visual-on-change              Run visual compare for changed docs after layout compare (default: on)
      --no-visual-on-change           Disable visual compare post-step
      --visual-reference <version>    Visual baseline version (default: same as --reference)
      --visual-workdir <path>         devtools/visual-testing root (default: ${DEFAULT_VISUAL_WORKDIR})
      --visual-browser <name>         Browser for visual compare (default: chromium)
      --visual-threshold <percent>    Visual diff threshold percent
      --fail-on-diff                  Exit with code 1 when diffs or missing docs are found
  -h, --help                          Show this help

Examples:
  bun tests/layout-snapshots/compare-layout-snapshots.mjs --reference 1.13.0-next.15
  bun tests/layout-snapshots/compare-layout-snapshots.mjs --reference 1.13.0-next.15 --fail-on-diff
  bun tests/layout-snapshots/compare-layout-snapshots.mjs --reference-root ./tests/layout-snapshots/reference/v.1.13.0-next.15
`);
}

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function safeLabel(value) {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'unknown';
}

function pathToPosix(value) {
  return value.split(path.sep).join('/');
}

function formatPath(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '$';
  let out = '$';
  for (const segment of segments) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) out += `.${segment}`;
    else out += `[${JSON.stringify(segment)}]`;
  }
  return out;
}

function summarizeValue(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= 220) return encoded;
    return `${encoded.slice(0, 217)}...`;
  } catch {
    return String(value);
  }
}

function parseArgs(argv) {
  const args = {
    reference: null,
    referenceRoot: null,
    referenceBase: DEFAULT_REFERENCE_BASE,
    candidateRoot: DEFAULT_CANDIDATE_ROOT,
    reportsRoot: DEFAULT_REPORTS_ROOT,
    reportDir: null,
    autoGenerateCandidate: true,
    autoGenerateReference: true,
    jobs: 4,
    pipeline: 'headless',
    installer: 'auto',
    inputRoot: null,
    numericTolerance: 0.001,
    maxDiffEntries: 2000,
    visualOnChange: true,
    visualReference: null,
    visualWorkdir: DEFAULT_VISUAL_WORKDIR,
    visualBrowser: 'chromium',
    visualThreshold: null,
    failOnDiff: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--reference' && next) {
      args.reference = next;
      i += 1;
      continue;
    }
    if (arg === '--reference-root' && next) {
      args.referenceRoot = next;
      i += 1;
      continue;
    }
    if (arg === '--reference-base' && next) {
      args.referenceBase = next;
      i += 1;
      continue;
    }
    if (arg === '--candidate-root' && next) {
      args.candidateRoot = next;
      i += 1;
      continue;
    }
    if (arg === '--reports-root' && next) {
      args.reportsRoot = next;
      i += 1;
      continue;
    }
    if (arg === '--report-dir' && next) {
      args.reportDir = next;
      i += 1;
      continue;
    }
    if (arg === '--auto-generate-candidate') {
      args.autoGenerateCandidate = true;
      continue;
    }
    if (arg === '--no-auto-generate-candidate') {
      args.autoGenerateCandidate = false;
      continue;
    }
    if (arg === '--auto-generate-reference') {
      args.autoGenerateReference = true;
      continue;
    }
    if (arg === '--no-auto-generate-reference') {
      args.autoGenerateReference = false;
      continue;
    }
    if (arg === '--jobs' && next) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --jobs value "${next}".`);
      }
      args.jobs = Math.floor(parsed);
      i += 1;
      continue;
    }
    if (arg === '--pipeline' && next) {
      const normalized = String(next).toLowerCase();
      if (normalized !== 'headless' && normalized !== 'presentation') {
        throw new Error(`Invalid --pipeline value "${next}".`);
      }
      args.pipeline = normalized;
      i += 1;
      continue;
    }
    if (arg === '--installer' && next) {
      const normalized = String(next).toLowerCase();
      if (!['auto', 'bun', 'npm'].includes(normalized)) {
        throw new Error(`Invalid --installer value "${next}".`);
      }
      args.installer = normalized;
      i += 1;
      continue;
    }
    if (arg === '--input-root' && next) {
      args.inputRoot = next;
      i += 1;
      continue;
    }
    if (arg === '--numeric-tolerance' && next) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --numeric-tolerance value "${next}".`);
      }
      args.numericTolerance = parsed;
      i += 1;
      continue;
    }
    if (arg === '--max-diff-entries' && next) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --max-diff-entries value "${next}".`);
      }
      args.maxDiffEntries = Math.floor(parsed);
      i += 1;
      continue;
    }
    if (arg === '--visual-on-change') {
      args.visualOnChange = true;
      continue;
    }
    if (arg === '--no-visual-on-change') {
      args.visualOnChange = false;
      continue;
    }
    if (arg === '--visual-reference' && next) {
      args.visualReference = next;
      i += 1;
      continue;
    }
    if (arg === '--visual-workdir' && next) {
      args.visualWorkdir = next;
      i += 1;
      continue;
    }
    if (arg === '--visual-browser' && next) {
      args.visualBrowser = next;
      i += 1;
      continue;
    }
    if (arg === '--visual-threshold' && next) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --visual-threshold value "${next}".`);
      }
      args.visualThreshold = parsed;
      i += 1;
      continue;
    }
    if (arg === '--fail-on-diff') {
      args.failOnDiff = true;
      continue;
    }
  }

  return args;
}

async function resolveNpmDistTagVersion({ packageName, distTag }) {
  const encodedPackage = encodeURIComponent(packageName);
  const url = `https://registry.npmjs.org/-/package/${encodedPackage}/dist-tags`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch npm dist-tag "${distTag}" for ${packageName}: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `npm dist-tag lookup failed for ${packageName}@${distTag}: HTTP ${response.status}${body ? ` (${body.slice(0, 180)})` : ''}`,
    );
  }

  const payload = await response.json().catch(() => null);
  const resolvedVersion = payload?.[distTag];
  if (typeof resolvedVersion !== 'string' || !resolvedVersion.trim()) {
    throw new Error(`npm dist-tag "${distTag}" is not set for package "${packageName}".`);
  }
  return resolvedVersion.trim();
}

async function resolveGeneratedReferenceRoot({ generatedFolder, referenceBase, reference, errorContext }) {
  if (generatedFolder && (await pathExists(generatedFolder))) {
    return { root: path.resolve(generatedFolder), label: path.basename(path.resolve(generatedFolder)) };
  }
  const fallback = path.join(referenceBase, normalizeVersionLabel(reference));
  if (!(await pathExists(fallback))) {
    throw new Error(`${errorContext} completed but folder not found: ${fallback}`);
  }
  return { root: fallback, label: path.basename(fallback) };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listSnapshotFiles(rootPath) {
  const entries = new Map();
  const root = path.resolve(rootPath);

  async function walk(current) {
    const dirEntries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of dirEntries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.layout.json')) continue;
      const rel = pathToPosix(path.relative(root, fullPath));
      entries.set(rel, fullPath);
    }
  }

  if (!(await pathExists(root))) {
    return entries;
  }
  await walk(root);
  return entries;
}

function buildPathRelation(candidatePaths, referencePaths) {
  const candidateSet = new Set(candidatePaths);
  const referenceSet = new Set(referencePaths);

  return {
    matched: candidatePaths.filter((relPath) => referenceSet.has(relPath)),
    missingInReference: candidatePaths.filter((relPath) => !referenceSet.has(relPath)),
    missingInCandidate: referencePaths.filter((relPath) => !candidateSet.has(relPath)),
  };
}

function normalizeDocSnapshot(raw) {
  const layoutSnapshot = cloneDeep(raw?.layoutSnapshot ?? {});
  const blocks = Array.isArray(layoutSnapshot.blocks) ? layoutSnapshot.blocks : [];
  const idMap = new Map();

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const nextId = `b${i}`;
    if (block && typeof block === 'object' && typeof block.id === 'string') {
      idMap.set(block.id, nextId);
      block.id = nextId;
    } else if (block && typeof block === 'object') {
      block.id = nextId;
    }
  }

  const pages = layoutSnapshot?.layout?.pages;
  if (Array.isArray(pages)) {
    for (const page of pages) {
      const fragments = page?.fragments;
      if (!Array.isArray(fragments)) continue;
      for (const fragment of fragments) {
        if (!fragment || typeof fragment !== 'object') continue;
        if (typeof fragment.blockId !== 'string') continue;
        fragment.blockId = idMap.get(fragment.blockId) ?? fragment.blockId;
      }
    }
  }

  const shouldDropNonVisualField = (pathSegments) => {
    const key = pathSegments[pathSegments.length - 1];
    const parent = pathSegments[pathSegments.length - 2];

    if (key === 'anchorParagraphId') return true;
    if (key === 'pmStart' || key === 'pmEnd') return true;
    if (key === 'id' && parent === 'trackedChange') return true;
    if (key === 'sdBlockId' && parent === 'sdt') return true;
    if (key === 'rId' && parent === 'link') return true;
    return false;
  };

  const stripNonVisualMetadata = (node, pathSegments = []) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        stripNonVisualMetadata(node[i], [...pathSegments, i]);
      }
      return;
    }

    for (const key of Object.keys(node)) {
      const nextPath = [...pathSegments, key];
      if (shouldDropNonVisualField(nextPath)) {
        delete node[key];
        continue;
      }
      stripNonVisualMetadata(node[key], nextPath);
    }
  };

  stripNonVisualMetadata(layoutSnapshot, ['layoutSnapshot']);

  return {
    formatVersion: raw?.formatVersion ?? null,
    source: {
      docxRelativePath: raw?.source?.docxRelativePath ?? null,
    },
    runtime: {
      pipeline: raw?.runtime?.pipeline ?? null,
      mode: raw?.runtime?.mode ?? null,
      usingStubCanvas: raw?.runtime?.usingStubCanvas ?? null,
    },
    layoutOptions: raw?.layoutOptions ?? null,
    layoutSnapshot,
  };
}

function getPagesByBlockIndex(normalizedDoc) {
  const map = new Map();
  const pages = normalizedDoc?.layoutSnapshot?.layout?.pages;
  if (!Array.isArray(pages)) return map;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    const fragments = Array.isArray(page?.fragments) ? page.fragments : [];
    for (const fragment of fragments) {
      const id = fragment?.blockId;
      if (typeof id !== 'string') continue;
      const match = id.match(/^b(\d+)$/);
      if (!match) continue;
      const blockIndex = Number(match[1]);
      if (!Number.isFinite(blockIndex)) continue;
      if (!map.has(blockIndex)) map.set(blockIndex, new Set());
      map.get(blockIndex).add(pageIndex + 1);
    }
  }

  return map;
}

function collectDiffs(referenceValue, candidateValue, options) {
  const { numericTolerance, maxDiffEntries } = options;
  const diffs = [];
  let truncated = false;

  function pushDiff(entry) {
    if (diffs.length >= maxDiffEntries) {
      truncated = true;
      return false;
    }
    diffs.push(entry);
    return true;
  }

  function walk(referenceNode, candidateNode, pathSegments) {
    if (diffs.length >= maxDiffEntries) {
      truncated = true;
      return;
    }

    if (referenceNode === candidateNode) return;

    if (
      typeof referenceNode === 'number' &&
      typeof candidateNode === 'number' &&
      Number.isFinite(referenceNode) &&
      Number.isFinite(candidateNode)
    ) {
      if (Math.abs(referenceNode - candidateNode) <= numericTolerance) return;
      pushDiff({
        pathSegments,
        kind: 'changed',
        reference: referenceNode,
        candidate: candidateNode,
        delta: candidateNode - referenceNode,
      });
      return;
    }

    const referenceType = Array.isArray(referenceNode) ? 'array' : referenceNode === null ? 'null' : typeof referenceNode;
    const candidateType = Array.isArray(candidateNode) ? 'array' : candidateNode === null ? 'null' : typeof candidateNode;
    if (referenceType !== candidateType) {
      pushDiff({
        pathSegments,
        kind: 'type-mismatch',
        reference: summarizeValue(referenceNode),
        candidate: summarizeValue(candidateNode),
      });
      return;
    }

    if (Array.isArray(referenceNode)) {
      if (referenceNode.length !== candidateNode.length) {
        pushDiff({
          pathSegments,
          kind: 'array-length',
          reference: referenceNode.length,
          candidate: candidateNode.length,
        });
      }
      const length = Math.min(referenceNode.length, candidateNode.length);
      for (let i = 0; i < length; i += 1) {
        walk(referenceNode[i], candidateNode[i], [...pathSegments, i]);
        if (diffs.length >= maxDiffEntries) break;
      }
      return;
    }

    if (referenceNode && typeof referenceNode === 'object') {
      const keys = new Set([...Object.keys(referenceNode), ...Object.keys(candidateNode)]);
      for (const key of [...keys].sort()) {
        if (!(key in referenceNode)) {
          if (
            !pushDiff({
              pathSegments: [...pathSegments, key],
              kind: 'missing-in-reference',
              reference: undefined,
              candidate: summarizeValue(candidateNode[key]),
            })
          ) break;
          continue;
        }
        if (!(key in candidateNode)) {
          if (
            !pushDiff({
              pathSegments: [...pathSegments, key],
              kind: 'missing-in-candidate',
              reference: summarizeValue(referenceNode[key]),
              candidate: undefined,
            })
          ) break;
          continue;
        }
        walk(referenceNode[key], candidateNode[key], [...pathSegments, key]);
        if (diffs.length >= maxDiffEntries) break;
      }
      return;
    }

    pushDiff({
      pathSegments,
      kind: 'changed',
      reference: referenceNode,
      candidate: candidateNode,
    });
  }

  walk(referenceValue, candidateValue, []);
  return { diffs, truncated };
}

function groupDiffsByPage(diffEntries, blockPagesMap) {
  const global = [];
  const perPage = new Map();

  function addPageDiff(pageNumber, entry) {
    if (!perPage.has(pageNumber)) perPage.set(pageNumber, []);
    perPage.get(pageNumber).push(entry);
  }

  for (const entry of diffEntries) {
    const pathSegments = entry.pathSegments;
    const pagePathIdx =
      pathSegments.length >= 4 &&
      pathSegments[0] === 'layoutSnapshot' &&
      pathSegments[1] === 'layout' &&
      pathSegments[2] === 'pages' &&
      typeof pathSegments[3] === 'number'
        ? pathSegments[3]
        : null;

    if (pagePathIdx != null) {
      addPageDiff(pagePathIdx + 1, entry);
      continue;
    }

    const blockPathIdx =
      pathSegments.length >= 3 &&
      pathSegments[0] === 'layoutSnapshot' &&
      (pathSegments[1] === 'blocks' || pathSegments[1] === 'measures') &&
      typeof pathSegments[2] === 'number'
        ? pathSegments[2]
        : null;

    if (blockPathIdx != null && blockPagesMap.has(blockPathIdx)) {
      for (const pageNumber of [...blockPagesMap.get(blockPathIdx)].sort((a, b) => a - b)) {
        addPageDiff(pageNumber, entry);
      }
      continue;
    }

    global.push(entry);
  }

  return {
    global,
    perPage,
  };
}

async function runNpmReferenceGeneration({ referenceSpecifier, args }) {
  const childArgs = [
    NPM_EXPORT_SCRIPT_PATH,
    referenceSpecifier,
    '--output-base',
    path.resolve(args.referenceBase),
    '--jobs',
    String(args.jobs),
    '--pipeline',
    args.pipeline,
    '--installer',
    args.installer,
  ];
  if (args.inputRoot) {
    childArgs.push('--input-root', path.resolve(args.inputRoot));
  }

  const child = spawn(process.execPath, childArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let resolvedVersionFolder = null;
  const collectLine = (line) => {
    const trimmed = String(line ?? '').trim();
    const match = trimmed.match(/^\[layout-snapshots:npm\] Version folder:\s*(.+)$/);
    if (match) {
      resolvedVersionFolder = match[1].trim();
    }
  };

  const stdoutRl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const stderrRl = readline.createInterface({ input: child.stderr, crlfDelay: Infinity });

  const stdoutDone = (async () => {
    for await (const line of stdoutRl) {
      console.log(line);
      collectLine(line);
    }
  })();
  const stderrDone = (async () => {
    for await (const line of stderrRl) {
      console.error(line);
      collectLine(line);
    }
  })();

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  await Promise.all([stdoutDone, stderrDone]);

  if (exitCode !== 0) {
    throw new Error(`Reference generation failed with exit code ${exitCode}.`);
  }

  return resolvedVersionFolder;
}

async function runCandidateGeneration({ candidateRoot, args }) {
  const childArgs = [
    CANDIDATE_EXPORT_SCRIPT_PATH,
    '--output-root',
    path.resolve(candidateRoot),
    '--jobs',
    String(args.jobs),
    '--pipeline',
    args.pipeline,
    '--disable-telemetry',
  ];
  if (args.inputRoot) {
    childArgs.push('--input-root', path.resolve(args.inputRoot));
  }

  const child = spawn(process.execPath, childArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutRl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const stderrRl = readline.createInterface({ input: child.stderr, crlfDelay: Infinity });

  const stdoutDone = (async () => {
    for await (const line of stdoutRl) {
      console.log(line);
    }
  })();
  const stderrDone = (async () => {
    for await (const line of stderrRl) {
      console.error(line);
    }
  })();

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  await Promise.all([stdoutDone, stderrDone]);

  if (exitCode !== 0) {
    throw new Error(`Candidate generation failed with exit code ${exitCode}.`);
  }
}

function snapshotPathToDocxRelativePath(snapshotRelativePath) {
  if (typeof snapshotRelativePath !== 'string') return null;
  if (!snapshotRelativePath.endsWith('.layout.json')) return null;
  return snapshotRelativePath.slice(0, -'.layout.json'.length);
}

function collectChangedDocRelativePaths(changedDocs) {
  const uniquePaths = new Set();
  for (const entry of changedDocs) {
    const docRelativePath = snapshotPathToDocxRelativePath(entry?.path);
    if (!docRelativePath) continue;
    uniquePaths.add(docRelativePath);
  }
  return [...uniquePaths].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function runVisualCompareForChangedDocs({ changedDocPaths, args }) {
  const visualWorkdir = path.resolve(args.visualWorkdir);
  const visualPackagePath = path.join(visualWorkdir, 'package.json');
  if (!(await pathExists(visualPackagePath))) {
    throw new Error(`Visual testing workspace not found: ${visualWorkdir}`);
  }

  const visualReference = args.visualReference ?? args.reference;
  if (!visualReference) {
    throw new Error('Visual compare requires --reference (or explicit --visual-reference).');
  }

  const visualDocsRoot = args.inputRoot ? path.resolve(args.inputRoot) : path.join(REPO_ROOT, 'test-corpus');
  const commandArgs = ['compare:visual', visualReference, '--local', '--docs', visualDocsRoot];

  if (args.visualBrowser) {
    commandArgs.push('--browser', args.visualBrowser);
  }
  if (typeof args.visualThreshold === 'number') {
    commandArgs.push('--threshold', String(args.visualThreshold));
  }
  for (const docPath of changedDocPaths) {
    commandArgs.push('--doc', docPath);
  }

  console.log(`[layout-snapshots:compare] Visual workdir:    ${visualWorkdir}`);
  console.log(`[layout-snapshots:compare] Visual docs root:  ${visualDocsRoot}`);
  console.log(`[layout-snapshots:compare] Visual reference:  ${visualReference}`);
  console.log(`[layout-snapshots:compare] Visual docs count: ${changedDocPaths.length}`);

  const child = spawn('pnpm', commandArgs, {
    cwd: visualWorkdir,
    env: {
      ...process.env,
      ...(process.stdout.isTTY ? {} : { CI: process.env.CI ?? 'true' }),
    },
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  if (exitCode !== 0) {
    throw new Error(`Visual compare failed with exit code ${exitCode}.`);
  }

  return {
    workdir: visualWorkdir,
    docsRoot: visualDocsRoot,
    reference: visualReference,
    docCount: changedDocPaths.length,
  };
}

function buildReportMarkdown(summary) {
  const lines = [];
  lines.push('# Layout Snapshot Diff Report');
  lines.push('');
  lines.push(`- Generated: ${summary.generatedAt}`);
  lines.push(`- Candidate root: ${summary.candidateRoot}`);
  lines.push(`- Reference root: ${summary.referenceRoot}`);
  lines.push(`- Candidate docs: ${summary.candidateDocCount}`);
  lines.push(`- Reference docs: ${summary.referenceDocCount}`);
  lines.push(`- Matched docs: ${summary.matchedDocCount}`);
  lines.push(`- Changed docs: ${summary.changedDocCount}`);
  lines.push(`- Unchanged docs: ${summary.unchangedDocCount}`);
  lines.push(`- Missing in reference: ${summary.missingInReference.length}`);
  lines.push(`- Missing in candidate: ${summary.missingInCandidate.length}`);
  lines.push('');

  if (summary.missingInReference.length > 0) {
    lines.push('## Missing In Reference');
    lines.push('');
    for (const relPath of summary.missingInReference) {
      lines.push(`- ${relPath}`);
    }
    lines.push('');
  }

  if (summary.missingInCandidate.length > 0) {
    lines.push('## Missing In Candidate');
    lines.push('');
    for (const relPath of summary.missingInCandidate) {
      lines.push(`- ${relPath}`);
    }
    lines.push('');
  }

  if (summary.changedDocs.length > 0) {
    lines.push('## Changed Docs');
    lines.push('');
    for (const item of summary.changedDocs) {
      const pages = item.pagesChanged.length > 0 ? item.pagesChanged.join(', ') : 'global-only';
      lines.push(`- ${item.path} | diffs: ${item.diffCount} | pages: ${pages}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidateRoot = path.resolve(args.candidateRoot);
  const referenceBase = path.resolve(args.referenceBase);

  if (!args.reference && !args.referenceRoot) {
    console.log(
      `[layout-snapshots:compare] No --reference provided. Resolving npm dist-tag "${DEFAULT_NPM_DIST_TAG}" for ${NPM_PACKAGE_NAME}...`,
    );
    args.reference = await resolveNpmDistTagVersion({
      packageName: NPM_PACKAGE_NAME,
      distTag: DEFAULT_NPM_DIST_TAG,
    });
    console.log(`[layout-snapshots:compare] Resolved default reference: ${args.reference}`);
  }

  let referenceRoot = args.referenceRoot ? path.resolve(args.referenceRoot) : null;
  let resolvedReferenceLabel = args.reference ? normalizeVersionLabel(args.reference) : path.basename(referenceRoot ?? 'reference');
  let candidateGenerated = false;
  let referenceGenerated = false;

  if (!referenceRoot && args.reference) {
    referenceRoot = path.join(referenceBase, normalizeVersionLabel(args.reference));
  }

  if (args.autoGenerateCandidate) {
    console.log(`[layout-snapshots:compare] Refreshing candidate snapshots at ${candidateRoot}...`);
    await runCandidateGeneration({
      candidateRoot,
      args,
    });
    candidateGenerated = true;
    if (!(await pathExists(candidateRoot))) {
      throw new Error(`Candidate generation completed but folder not found: ${candidateRoot}`);
    }
  } else if (!(await pathExists(candidateRoot))) {
    throw new Error(`Candidate root does not exist: ${candidateRoot}`);
  }

  if (!(await pathExists(referenceRoot))) {
    if (!args.reference || !args.autoGenerateReference) {
      throw new Error(`Reference root does not exist: ${referenceRoot}`);
    }

    console.log(`[layout-snapshots:compare] Reference not found at ${referenceRoot}. Generating from npm...`);
    const generatedFolder = await runNpmReferenceGeneration({
      referenceSpecifier: args.reference,
      args,
    });
    referenceGenerated = true;
    const resolved = await resolveGeneratedReferenceRoot({
      generatedFolder,
      referenceBase,
      reference: args.reference,
      errorContext: 'Reference generation',
    });
    referenceRoot = resolved.root;
    resolvedReferenceLabel = resolved.label;
  } else if (!args.referenceRoot) {
    resolvedReferenceLabel = path.basename(referenceRoot);
  }

  let candidateFiles = await listSnapshotFiles(candidateRoot);
  let referenceFiles = await listSnapshotFiles(referenceRoot);
  let candidatePaths = [...candidateFiles.keys()].sort();
  let referencePaths = [...referenceFiles.keys()].sort();

  let relation = buildPathRelation(candidatePaths, referencePaths);

  if (
    relation.missingInReference.length > 0 &&
    args.reference &&
    args.autoGenerateReference &&
    !args.referenceRoot
  ) {
    console.log(
      `[layout-snapshots:compare] Reference exists but is incomplete (${relation.missingInReference.length} missing). Regenerating...`,
    );
    const generatedFolder = await runNpmReferenceGeneration({
      referenceSpecifier: args.reference,
      args,
    });
    referenceGenerated = true;
    const resolved = await resolveGeneratedReferenceRoot({
      generatedFolder,
      referenceBase,
      reference: args.reference,
      errorContext: 'Reference regeneration',
    });
    referenceRoot = resolved.root;
    resolvedReferenceLabel = resolved.label;

    referenceFiles = await listSnapshotFiles(referenceRoot);
    referencePaths = [...referenceFiles.keys()].sort();
    relation = buildPathRelation(candidatePaths, referencePaths);
  }

  const reportsRoot = path.resolve(args.reportsRoot);
  const reportDir = args.reportDir
    ? path.resolve(args.reportDir)
    : path.join(reportsRoot, `${formatTimestamp(new Date())}-${safeLabel(resolvedReferenceLabel)}-vs-candidate`);

  await fs.rm(reportDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(path.join(reportDir, 'docs'), { recursive: true });

  console.log(`[layout-snapshots:compare] Candidate root: ${candidateRoot}`);
  console.log(`[layout-snapshots:compare] Reference root: ${referenceRoot}`);
  console.log(`[layout-snapshots:compare] Report dir:     ${reportDir}`);

  const changedDocs = [];
  let unchangedDocCount = 0;

  for (let i = 0; i < relation.matched.length; i += 1) {
    const relPath = relation.matched[i];
    const candidateFile = candidateFiles.get(relPath);
    const referenceFile = referenceFiles.get(relPath);

    let candidateRaw;
    let referenceRaw;
    try {
      candidateRaw = JSON.parse(await fs.readFile(candidateFile, 'utf8'));
      referenceRaw = JSON.parse(await fs.readFile(referenceFile, 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const report = {
        path: relPath,
        parseError: message,
        candidateFile,
        referenceFile,
      };
      const reportPath = path.join(reportDir, 'docs', `${relPath}.diff.json`);
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
      changedDocs.push({
        path: relPath,
        diffCount: 1,
        pagesChanged: [],
        reportFile: pathToPosix(path.relative(reportDir, reportPath)),
      });
      console.log(`[${i + 1}/${relation.matched.length}] CHANGED ${relPath} (parse error)`);
      continue;
    }

    const candidate = normalizeDocSnapshot(candidateRaw);
    const reference = normalizeDocSnapshot(referenceRaw);
    const { diffs, truncated } = collectDiffs(reference, candidate, {
      numericTolerance: args.numericTolerance,
      maxDiffEntries: args.maxDiffEntries,
    });

    if (diffs.length === 0) {
      unchangedDocCount += 1;
      continue;
    }

    const blockPagesMap = getPagesByBlockIndex(candidate);
    const grouped = groupDiffsByPage(diffs, blockPagesMap);
    const pagesChanged = [...grouped.perPage.keys()].sort((a, b) => a - b);

    const docReport = {
      path: relPath,
      candidateFile,
      referenceFile,
      pageCount: {
        candidate: Array.isArray(candidate?.layoutSnapshot?.layout?.pages)
          ? candidate.layoutSnapshot.layout.pages.length
          : 0,
        reference: Array.isArray(reference?.layoutSnapshot?.layout?.pages)
          ? reference.layoutSnapshot.layout.pages.length
          : 0,
      },
      diffCount: diffs.length,
      truncated,
      pagesChanged,
      globalDiffs: grouped.global.map((entry) => ({
        path: formatPath(entry.pathSegments),
        kind: entry.kind,
        reference: summarizeValue(entry.reference),
        candidate: summarizeValue(entry.candidate),
        ...(typeof entry.delta === 'number' ? { delta: entry.delta } : {}),
      })),
      pageDiffs: Object.fromEntries(
        [...grouped.perPage.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([pageNumber, entries]) => [
            String(pageNumber),
            entries.map((entry) => ({
              path: formatPath(entry.pathSegments),
              kind: entry.kind,
              reference: summarizeValue(entry.reference),
              candidate: summarizeValue(entry.candidate),
              ...(typeof entry.delta === 'number' ? { delta: entry.delta } : {}),
            })),
          ]),
      ),
    };

    const reportPath = path.join(reportDir, 'docs', `${relPath}.diff.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(docReport, null, 2), 'utf8');

    changedDocs.push({
      path: relPath,
      diffCount: diffs.length,
      pagesChanged,
      reportFile: pathToPosix(path.relative(reportDir, reportPath)),
    });

    console.log(
      `[${i + 1}/${relation.matched.length}] CHANGED ${relPath} | diffs ${diffs.length}${pagesChanged.length ? ` | pages ${pagesChanged.join(',')}` : ''}`,
    );
  }

  const changedDocPaths = collectChangedDocRelativePaths(changedDocs);
  const visualReference = args.visualReference ?? args.reference;
  const visualEligible = args.visualOnChange && changedDocPaths.length > 0 && Boolean(visualReference);

  let visualSkipReason = null;
  if (!args.visualOnChange) {
    visualSkipReason = 'Disabled via --no-visual-on-change.';
  } else if (changedDocPaths.length === 0) {
    visualSkipReason = 'No changed docs.';
  } else if (!visualReference) {
    visualSkipReason = 'No --reference/--visual-reference provided.';
  }

  let visualComparison = {
    enabled: args.visualOnChange,
    executed: false,
    status: 'skipped',
    reason: visualSkipReason,
    changedDocCount: changedDocPaths.length,
    docs: changedDocPaths,
    workdir: null,
    docsRoot: null,
    reference: null,
    error: null,
  };

  if (visualEligible) {
    console.log('');
    console.log(
      `[layout-snapshots:compare] Changed docs detected (${changedDocPaths.length}). Running visual compare...`,
    );
    try {
      const visualRun = await runVisualCompareForChangedDocs({
        changedDocPaths,
        args,
      });
      visualComparison = {
        ...visualComparison,
        executed: true,
        status: 'success',
        reason: null,
        ...visualRun,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      visualComparison = {
        ...visualComparison,
        executed: true,
        status: 'failed',
        reason: message,
        error: message,
      };
      console.error(`[layout-snapshots:compare] Visual compare failed: ${message}`);
      process.exitCode = 1;
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    reportDir,
    candidateRoot,
    referenceRoot,
    referenceLabel: resolvedReferenceLabel,
    candidateGenerated,
    referenceGenerated,
    candidateDocCount: candidatePaths.length,
    referenceDocCount: referencePaths.length,
    matchedDocCount: relation.matched.length,
    changedDocCount: changedDocs.length,
    unchangedDocCount,
    missingInReference: relation.missingInReference,
    missingInCandidate: relation.missingInCandidate,
    changedDocs,
    changedDocPaths,
    visualComparison,
  };

  await fs.writeFile(path.join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(path.join(reportDir, 'summary.md'), buildReportMarkdown(summary), 'utf8');

  console.log('');
  console.log(`[layout-snapshots:compare] Matched docs:       ${relation.matched.length}`);
  console.log(`[layout-snapshots:compare] Changed docs:       ${changedDocs.length}`);
  console.log(`[layout-snapshots:compare] Unchanged docs:     ${unchangedDocCount}`);
  console.log(`[layout-snapshots:compare] Missing reference:  ${relation.missingInReference.length}`);
  console.log(`[layout-snapshots:compare] Missing candidate:  ${relation.missingInCandidate.length}`);
  if (visualComparison.executed || visualComparison.enabled) {
    console.log(`[layout-snapshots:compare] Visual compare:    ${visualComparison.status}`);
  }
  console.log(`[layout-snapshots:compare] Report:             ${reportDir}`);

  const hasDiffs =
    changedDocs.length > 0 || relation.missingInReference.length > 0 || relation.missingInCandidate.length > 0;
  if (args.failOnDiff && hasDiffs) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[layout-snapshots:compare] Fatal: ${message}`);
  process.exit(1);
});
