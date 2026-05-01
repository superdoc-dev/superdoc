#!/usr/bin/env bun
/**
 * Brand voice rule: no em-dashes in user-facing copy. Replace with periods,
 * colons, parens, or split sentences. See brand.md.
 *
 * This validator catches em-dashes in mdx, llms.txt, llms-full.txt, and
 * docs.json. Skips:
 * - Hidden pages (frontmatter `hidden: true`)
 * - Auto-generated content with explicit markers (none yet, but reserved)
 * - openapi.json (external spec)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.') || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith('.mdx') || entry === 'llms.txt' || entry === 'llms-full.txt' || entry === 'docs.json') {
      files.push(full);
    }
  }
  return files;
}

const issues: { file: string; line: number; text: string }[] = [];

for (const file of walk(ROOT)) {
  const content = readFileSync(file, 'utf8');
  // Skip hidden pages
  if (/^---\s*\n[\s\S]*?^hidden: true\s*$/m.test(content)) continue;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\u2014')) {
      issues.push({ file: file.slice(ROOT.length + 1), line: i + 1, text: lines[i].trim().slice(0, 100) });
    }
  }
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
