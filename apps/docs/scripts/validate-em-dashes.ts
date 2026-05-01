#!/usr/bin/env bun
/**
 * Brand voice rule: no em-dashes in user-facing copy. Replace with periods,
 * colons, parens, or split sentences. See brand.md.
 *
 * This validator catches em-dashes in:
 *   - mdx, llms.txt, llms-full.txt, docs.json (rendered output)
 *   - apps/docs/scripts/*.ts (generators that splice prose into rendered docs)
 *   - packages/document-api/src/contract/operation-definitions.ts (descriptions
 *     that flow into Document API reference and tool catalogs)
 *
 * Skips:
 *   - Hidden mdx pages (frontmatter `hidden: true`, parsed strictly from the
 *     YAML block, not body text)
 *   - openapi.json (external spec)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS_DOCS = resolve(fileURLToPath(import.meta.url), '../..');
const REPO_ROOT = resolve(APPS_DOCS, '../..');

const RENDERED_SCAN_NAMES = new Set(['llms.txt', 'llms-full.txt', 'docs.json']);

const GENERATOR_FILES: string[] = [
  resolve(APPS_DOCS, 'scripts/generate-sdk-overview.ts'),
  resolve(REPO_ROOT, 'packages/document-api/src/contract/operation-definitions.ts'),
];

function walkDocs(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.') || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkDocs(full, files);
    else if (entry.endsWith('.mdx') || RENDERED_SCAN_NAMES.has(entry)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Read the YAML frontmatter block (between the first two `---` delimiters).
 * Returns the body text of the frontmatter, or null if the file has none.
 */
function readFrontmatter(content: string): string | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null;
  const startOffset = content.indexOf('\n') + 1;
  const endMatch = content.slice(startOffset).match(/^---\s*$/m);
  if (!endMatch || endMatch.index === undefined) return null;
  return content.slice(startOffset, startOffset + endMatch.index);
}

function isHiddenPage(content: string): boolean {
  const fm = readFrontmatter(content);
  if (!fm) return false;
  return /^hidden:\s*true\s*$/m.test(fm);
}

const issues: { file: string; line: number; text: string }[] = [];

function scan(file: string, allowHiddenSkip: boolean) {
  const content = readFileSync(file, 'utf8');
  if (allowHiddenSkip && isHiddenPage(content)) return;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\u2014')) {
      issues.push({ file: file.slice(REPO_ROOT.length + 1), line: i + 1, text: lines[i].trim().slice(0, 100) });
    }
  }
}

for (const file of walkDocs(APPS_DOCS)) scan(file, true);
for (const file of GENERATOR_FILES) {
  if (existsSync(file)) scan(file, false);
}

if (issues.length === 0) {
  console.log('\u001b[32mNo em-dashes in user-facing copy.\u001b[0m');
  process.exit(0);
}

console.log(`\u001b[31mFound ${issues.length} em-dash(es) in user-facing copy:\u001b[0m`);
for (const { file, line, text } of issues) {
  console.log(`  ${file}:${line}  ${text}`);
}
console.log('\nBrand rule: replace with period, colon, parens, or split sentences. See brand.md.');
process.exit(1);
