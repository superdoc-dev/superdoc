#!/usr/bin/env bun
/**
 * Validate that every icon name used in mdx + docs.json resolves against
 * the configured icon library (Lucide). Mintlify silently renders unknown
 * icon names as blank boxes, so this catches drift early.
 *
 * Run: bun scripts/validate-icons.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DOCS_JSON = join(ROOT, 'docs.json');

const docsConfig = JSON.parse(readFileSync(DOCS_JSON, 'utf8'));
const library = docsConfig.icons?.library ?? 'lucide';

if (library !== 'lucide') {
  console.log(`Library is "${library}"; this validator currently only supports lucide.`);
  process.exit(0);
}

// Find the installed Lucide icon set (any version).
function findLucideDir(): string {
  const repoRoot = resolve(ROOT, '../..');
  const pnpmDir = join(repoRoot, 'node_modules/.pnpm');
  const entries = readdirSync(pnpmDir);
  const match = entries.find((e) => /^lucide@[\d.]+$/.test(e));
  if (!match) throw new Error('Could not find lucide package under node_modules/.pnpm');
  return join(pnpmDir, match, 'node_modules/lucide/dist/esm/icons');
}

const validIcons = new Set<string>();
for (const file of readdirSync(findLucideDir())) {
  if (file.endsWith('.js') && !file.endsWith('.js.map')) {
    validIcons.add(file.slice(0, -3));
  }
}

// Walk all mdx files
function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith('.mdx')) files.push(full);
  }
  return files;
}

const ICON_RE = /\bicon=(?:"([^"]+)"|\{`([^`]+)`\})/g;
const issues: { file: string; line: number; icon: string }[] = [];

function scanContent(file: string, content: string) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip code blocks / Vue v-btn
    if (line.includes('v-btn')) continue;
    let m: RegExpExecArray | null;
    ICON_RE.lastIndex = 0;
    while ((m = ICON_RE.exec(line))) {
      const name = m[1] ?? m[2];
      if (!name) continue;
      // Skip URL/file paths (start with / or http)
      if (name.startsWith('/') || name.startsWith('http')) continue;
      // Skip MDI which is a Vue example, not Mintlify
      if (name.startsWith('mdi-')) continue;
      if (!validIcons.has(name)) {
        issues.push({ file: file.slice(ROOT.length + 1), line: i + 1, icon: name });
      }
    }
  }
}

// Scan mdx
for (const file of walk(ROOT)) {
  scanContent(file, readFileSync(file, 'utf8'));
}

// Scan docs.json
function scanJsonForIcons(node: unknown, path: string[] = []) {
  if (typeof node !== 'object' || node === null) return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanJsonForIcons(item, [...path, String(i)]));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'icon' && typeof value === 'string') {
      if (value.startsWith('/') || value.startsWith('http')) continue;
      if (!validIcons.has(value)) {
        issues.push({ file: 'docs.json', line: 0, icon: value });
      }
    } else {
      scanJsonForIcons(value, [...path, key]);
    }
  }
}
scanJsonForIcons(docsConfig);

if (issues.length === 0) {
  console.log(`\u001b[32mAll icons valid (${validIcons.size} Lucide icons available).\u001b[0m`);
  process.exit(0);
}

console.log(`\u001b[31mFound ${issues.length} invalid icon(s):\u001b[0m`);
for (const { file, line, icon } of issues) {
  const loc = line ? `${file}:${line}` : file;
  console.log(`  ${loc}  icon="${icon}"`);
}
console.log(`\nLibrary is set to "${library}". See https://lucide.dev/icons/ for valid names.`);
process.exit(1);
