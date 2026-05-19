#!/usr/bin/env bun
/**
 * Validate metadata in demos/ and examples/. Catches drift that broke us
 * during SD-2873:
 *   - Invalid demo-config.json (trailing comma, etc.)
 *   - Hardcoded /Users/<name>/ absolute paths in human-edited content
 *   - Stale docs.superdoc.dev URLs from the old IA
 *
 * Skips: node_modules, dist, build artifacts (.nuxt/, .next/), generated
 * lockfiles, and __tests__.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const TARGETS = [join(REPO_ROOT, 'demos'), join(REPO_ROOT, 'examples')];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.nuxt', '.next', '.output', '.svelte-kit', 'build', '__tests__']);

const SCAN_EXT = /\.(md|mdx|js|ts|tsx|jsx|json|html)$/;

const STALE_URL_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /docs\.superdoc\.dev\/modules\/comments/g, replacement: 'docs.superdoc.dev/editor/built-in-ui/comments' },
  {
    pattern: /docs\.superdoc\.dev\/modules\/track-changes/g,
    replacement: 'docs.superdoc.dev/editor/built-in-ui/track-changes',
  },
  { pattern: /docs\.superdoc\.dev\/modules\/toolbar/g, replacement: 'docs.superdoc.dev/editor/built-in-ui/toolbar' },
  { pattern: /docs\.superdoc\.dev\/modules\/links/g, replacement: 'docs.superdoc.dev/editor/built-in-ui/links' },
  {
    pattern: /docs\.superdoc\.dev\/modules\/context-menu/g,
    replacement: 'docs.superdoc.dev/editor/built-in-ui/context-menu',
  },
  { pattern: /docs\.superdoc\.dev\/modules\/pdf/g, replacement: 'docs.superdoc.dev/editor/pdf' },
  { pattern: /docs\.superdoc\.dev\/modules\/whiteboard/g, replacement: 'docs.superdoc.dev/editor/pdf/whiteboard' },
  {
    pattern: /docs\.superdoc\.dev\/modules\/collaboration/g,
    replacement: 'docs.superdoc.dev/editor/collaboration/overview',
  },
  {
    pattern: /docs\.superdoc\.dev\/extensions\/track-changes/g,
    replacement: 'docs.superdoc.dev/editor/built-in-ui/track-changes',
  },
  {
    pattern: /docs\.superdoc\.dev\/document-engine\/ai-agents\/integrations/g,
    replacement: 'docs.superdoc.dev/ai/agents/integrations',
  },
  {
    pattern: /docs\.superdoc\.dev\/document-engine\/ai-agents\/llm-tools/g,
    replacement: 'docs.superdoc.dev/ai/agents/llm-tools',
  },
  {
    pattern: /docs\.superdoc\.dev\/document-engine\/ai-agents\/mcp-server/g,
    replacement: 'docs.superdoc.dev/ai/mcp/overview',
  },
  { pattern: /docs\.superdoc\.dev\/document-engine\/mcp/g, replacement: 'docs.superdoc.dev/ai/mcp/overview' },
  { pattern: /docs\.superdoc\.dev\/getting-started\/ai-agents/g, replacement: 'docs.superdoc.dev/getting-started/ai' },
  {
    pattern: /docs\.superdoc\.dev\/getting-started\/installation/g,
    replacement: 'docs.superdoc.dev/getting-started/quickstart',
  },
  { pattern: /docs\.superdoc\.dev\/core\/superdoc\//g, replacement: 'docs.superdoc.dev/editor/superdoc/' },
  { pattern: /docs\.superdoc\.dev\/core\/react\//g, replacement: 'docs.superdoc.dev/editor/react/' },
  { pattern: /docs\.superdoc\.dev\/core\/supereditor\//g, replacement: 'docs.superdoc.dev/advanced/supereditor/' },
  {
    pattern: /docs\.superdoc\.dev\/extensions\/creating-extensions/g,
    replacement: 'docs.superdoc.dev/advanced/custom-extensions',
  },
];

const HARDCODED_PATH = /\/Users\/[a-z][a-zA-Z0-9_-]*\//g;

type Issue = { file: string; line: number; kind: string; detail: string };
const issues: Issue[] = [];

// Manifest entry schema (SD-3217 round 4). Every entry in
// demos/manifest.json and examples/manifest.json must declare these.
const ALLOWED_SECTIONS = new Set([
  'editor',
  'document-engine',
  'ai',
  'solutions',
  'getting-started',
  'advanced',
]);
const ALLOWED_KINDS = new Set(['minimal-example', 'integration-example', 'workflow-demo', 'reference-workspace']);
const ALLOWED_STATUSES = new Set(['active', 'hidden', 'archived', 'shim']);
const ALLOWED_SOURCE_KINDS = new Set(['local', 'external']);

function validateManifest(manifestPath: string, relPath: string): void {
  let entries: unknown;
  try {
    entries = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    issues.push({ file: relPath, line: 0, kind: 'invalid-json', detail: String(err).split('\n')[0] });
    return;
  }
  if (!Array.isArray(entries)) {
    issues.push({ file: relPath, line: 0, kind: 'manifest-shape', detail: 'top-level must be an array' });
    return;
  }
  for (const [index, entry] of entries.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push({
        file: relPath,
        line: 0,
        kind: 'manifest-shape',
        detail: `entry at index ${index} must be a JSON object with id and metadata fields`,
      });
      continue;
    }
    const e = entry as Record<string, unknown>;
    const eid = typeof e.id === 'string' ? e.id : '<no-id>';
    if (typeof e.section !== 'string' || !ALLOWED_SECTIONS.has(e.section)) {
      issues.push({ file: relPath, line: 0, kind: 'manifest-schema', detail: `${eid}: section missing or not one of ${[...ALLOWED_SECTIONS].join(', ')}` });
    }
    if (typeof e.subsection !== 'string' || e.subsection.length === 0) {
      issues.push({ file: relPath, line: 0, kind: 'manifest-schema', detail: `${eid}: subsection missing or empty (use 'core' if no natural subsection)` });
    }
    if (typeof e.kind !== 'string' || !ALLOWED_KINDS.has(e.kind)) {
      issues.push({ file: relPath, line: 0, kind: 'manifest-schema', detail: `${eid}: kind missing or not one of ${[...ALLOWED_KINDS].join(', ')}` });
    }
    if (typeof e.status !== 'string' || !ALLOWED_STATUSES.has(e.status)) {
      issues.push({ file: relPath, line: 0, kind: 'manifest-schema', detail: `${eid}: status missing or not one of ${[...ALLOWED_STATUSES].join(', ')}` });
    }
    if (typeof e.sourceKind !== 'string' || !ALLOWED_SOURCE_KINDS.has(e.sourceKind)) {
      issues.push({ file: relPath, line: 0, kind: 'manifest-schema', detail: `${eid}: sourceKind missing or not one of ${[...ALLOWED_SOURCE_KINDS].join(', ')}` });
    }
    // sourceKind must agree with sourceRepo: monorepo entries are local,
    // anything else is external. Cheap drift check.
    if (typeof e.sourceRepo === 'string' && typeof e.sourceKind === 'string') {
      const expectedKind = e.sourceRepo === 'superdoc-dev/superdoc' ? 'local' : 'external';
      if (e.sourceKind !== expectedKind) {
        issues.push({
          file: relPath,
          line: 0,
          kind: 'manifest-schema',
          detail: `${eid}: sourceKind '${e.sourceKind}' does not match sourceRepo '${e.sourceRepo}' (expected '${expectedKind}')`,
        });
      }
    }
  }
}

validateManifest(join(REPO_ROOT, 'demos/manifest.json'), 'demos/manifest.json');
validateManifest(join(REPO_ROOT, 'examples/manifest.json'), 'examples/manifest.json');

function walk(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (SCAN_EXT.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

for (const target of TARGETS) {
  for (const file of walk(target)) {
    const rel = file.slice(REPO_ROOT.length + 1);
    const content = readFileSync(file, 'utf8');

    if (file.endsWith('demo-config.json')) {
      try {
        JSON.parse(content);
      } catch (err) {
        issues.push({ file: rel, line: 0, kind: 'invalid-json', detail: String(err).split('\n')[0] });
      }
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const pathMatches = line.match(HARDCODED_PATH);
      if (pathMatches) {
        for (const m of pathMatches) {
          issues.push({ file: rel, line: i + 1, kind: 'hardcoded-path', detail: m });
        }
      }

      for (const { pattern, replacement } of STALE_URL_PATTERNS) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line))) {
          issues.push({
            file: rel,
            line: i + 1,
            kind: 'stale-url',
            detail: `${m[0]} -> ${replacement}`,
          });
        }
      }
    }
  }
}

if (issues.length === 0) {
  console.log('\u001b[32mAll demo and example metadata is valid.\u001b[0m');
  process.exit(0);
}

const byKind = new Map<string, Issue[]>();
for (const issue of issues) {
  if (!byKind.has(issue.kind)) byKind.set(issue.kind, []);
  byKind.get(issue.kind)!.push(issue);
}

console.log(`\u001b[31mFound ${issues.length} issue(s):\u001b[0m`);
for (const [kind, list] of byKind) {
  console.log(`\n  [${kind}] ${list.length}`);
  for (const i of list.slice(0, 20)) {
    console.log(`    ${i.file}${i.line ? ':' + i.line : ''}  ${i.detail}`);
  }
  if (list.length > 20) console.log(`    ... and ${list.length - 20} more`);
}
process.exit(1);
