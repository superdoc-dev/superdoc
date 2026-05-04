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
