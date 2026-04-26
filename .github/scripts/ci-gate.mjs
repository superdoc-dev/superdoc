#!/usr/bin/env node
// CI gate: decides whether a workflow's expensive jobs should run.
// Replaces dorny/paths-filter so the required-check path stays free of
// third-party action dependencies.
//
// Usage: node .github/scripts/ci-gate.mjs --suite <name>
//
// Reads the PR number from GITHUB_EVENT_PATH (the workflow event payload),
// fetches changed files via `gh api repos/:repo/pulls/:num/files`, and
// matches them against the suite's glob list. Writes `should_run=true|false`
// to $GITHUB_OUTPUT.
//
// Non-pull_request events (merge_group, workflow_dispatch, push) short-
// circuit to should_run=true. Running full checks in the merge queue is
// the safer posture - we'd rather pay extra minutes than skip a suite
// because the merge-base diff disagreed with the PR-base diff.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

// Each suite mirrors the filter previously inlined in the matching workflow.
// `.github/scripts/ci-gate.mjs` is included in every suite so a change to
// the gate script itself re-runs every workflow.
export const SUITES = {
  behavior: [
    'packages/superdoc/**',
    'packages/layout-engine/**',
    'packages/super-editor/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'tests/behavior/**',
    'shared/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-behavior.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  demos: [
    'demos/**',
    'packages/superdoc/**',
    'packages/react/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-demos.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  docs: [
    'apps/docs/**',
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/document-api/src/contract/**',
    'packages/document-api/scripts/**',
    'scripts/generate-all.mjs',
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-docs.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  'document-api': [
    'packages/document-api/**',
    'apps/docs/document-api/**',
    'package.json',
    'pnpm-lock.yaml',
    '.github/workflows/ci-document-api.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  esign: [
    'packages/esign/**',
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-esign.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  examples: [
    'examples/**',
    'packages/superdoc/**',
    'packages/react/**',
    'packages/super-editor/**',
    'packages/collaboration-yjs/**',
    'packages/sdk/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-examples.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  mcp: [
    'apps/mcp/**',
    'packages/sdk/**',
    'apps/cli/**',
    'packages/document-api/**',
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-mcp.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  react: [
    'packages/react/**',
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-react.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  sdk: [
    'packages/sdk/**',
    'apps/cli/**',
    'packages/document-api/**',
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'scripts/generate-all.mjs',
    'scripts/semantic-release/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'package.json',
    '.github/workflows/ci-sdk.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  superdoc: [
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'packages/document-api/**',
    'packages/collaboration-yjs/**',
    'shared/**',
    'apps/cli/**',
    'tests/**',
    'scripts/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'package.json',
    '.nvmrc',
    'tsconfig*.json',
    'eslint.config.mjs',
    'vitest.config.mjs',
    'vitest.baseConfig.ts',
    'vite.sourceResolve.ts',
    '.github/workflows/ci-superdoc.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  'template-builder': [
    'packages/template-builder/**',
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-template-builder.yml',
    '.github/scripts/ci-gate.mjs',
  ],
  'vscode-ext': [
    'apps/vscode-ext/**',
    'packages/superdoc/**',
    'packages/super-editor/**',
    'packages/layout-engine/**',
    'packages/word-layout/**',
    'packages/preset-geometry/**',
    'shared/**',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    '.github/workflows/ci-vscode-ext.yml',
    '.github/scripts/ci-gate.mjs',
  ],
};

// Translate a path glob to a JS RegExp.
//
// Supported:
//   '**/'  -> match zero or more leading path segments (so '**/foo' matches
//             'foo' and 'a/b/foo')
//   '**'   -> match anything including '/'
//   '*'    -> match anything except '/'
//   '?'    -> single non-'/' character
//   literals are matched verbatim, regex specials escaped
//
// Negation patterns ('!foo/**') are NOT supported. None of our suites use
// them; add support here if that changes.
const REGEX_SPECIALS = new Set([...'.()+-^$|\\{}[]']);

export function globToRegex(pattern) {
  let out = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*' && pattern[i + 2] === '/') {
      out += '(?:.*/)?';
      i += 3;
    } else if (c === '*' && pattern[i + 1] === '*') {
      out += '.*';
      i += 2;
    } else if (c === '*') {
      out += '[^/]*';
      i += 1;
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (REGEX_SPECIALS.has(c)) {
      out += '\\' + c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  out += '$';
  return new RegExp(out);
}

export function matchesSuite(file, patterns) {
  return patterns.some((p) => globToRegex(p).test(file));
}

function parseArgs() {
  const i = argv.indexOf('--suite');
  if (i === -1 || !argv[i + 1]) {
    console.error('Usage: ci-gate.mjs --suite <name>');
    exit(2);
  }
  const name = argv[i + 1];
  const patterns = SUITES[name];
  if (!patterns) {
    const known = Object.keys(SUITES).join(', ');
    console.error(`Unknown suite: ${name}. Known: ${known}`);
    exit(2);
  }
  return { name, patterns };
}

function getPullRequestNumber() {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  return event.pull_request?.number ?? null;
}

function getChangedFiles(prNumber) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is not set');

  const stdout = execFileSync(
    'gh',
    [
      'api',
      `repos/${repo}/pulls/${prNumber}/files`,
      '--paginate',
      '--jq',
      '.[].filename',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function setOutput(key, value) {
  const line = `${key}=${value}`;
  console.log(line);
  const path = env.GITHUB_OUTPUT;
  if (path) appendFileSync(path, line + '\n');
}

function main() {
  const { name, patterns } = parseArgs();
  const event = env.GITHUB_EVENT_NAME;

  if (event !== 'pull_request') {
    console.log(`Event '${event}' is not pull_request - running '${name}' fully.`);
    setOutput('should_run', 'true');
    return;
  }

  const prNumber = getPullRequestNumber();
  if (!prNumber) {
    console.log('No PR number on event payload - running fully.');
    setOutput('should_run', 'true');
    return;
  }

  const files = getChangedFiles(prNumber);
  console.log(`Suite '${name}': checking ${files.length} changed files`);

  for (const f of files) {
    if (matchesSuite(f, patterns)) {
      console.log(`Match: ${f}`);
      setOutput('should_run', 'true');
      return;
    }
  }

  console.log(`No paths match suite '${name}'.`);
  setOutput('should_run', 'false');
}

if (fileURLToPath(import.meta.url) === argv[1]) {
  main();
}
