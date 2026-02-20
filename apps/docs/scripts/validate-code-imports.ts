#!/usr/bin/env bun

/**
 * Validates import statements in MDX code blocks.
 * Scans all .mdx files for JS/TS code blocks and checks
 * that every import path is on the allowlist.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import { visit } from 'unist-util-visit';
import type { Code } from 'mdast';

const EXACT_SUPERDOC_IMPORTS = new Set([
  'superdoc',
  'superdoc/super-editor',
  'superdoc/types',
  'superdoc/converter',
  'superdoc/docx-zipper',
  'superdoc/file-zipper',
  'superdoc/style.css',
  '@superdoc-dev/ai',
  '@superdoc-dev/esign',
  '@superdoc-dev/esign/styles.css',
  '@superdoc-dev/react',
  '@superdoc-dev/sdk',
  '@superdoc-dev/react/style.css',
  '@superdoc-dev/template-builder',
  '@superdoc-dev/template-builder/defaults',
  '@superdoc-dev/template-builder/field-types.css',
  '@superdoc-dev/superdoc-yjs-collaboration',
]);

const EXACT_EXTERNAL_IMPORTS = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'vue',
  'pdfjs-dist',
  'pdfjs-dist/build/pdf.mjs',
  'yjs',
  'y-prosemirror',
  'y-websocket',
  'openai',
  'bun:test',
  'hocuspocus',
  'fastify',
  'express',
  'cors',
  'pg',
  'ioredis',
]);

const PREFIX_EXTERNAL_IMPORTS = [
  '@angular/',
  'prosemirror-',
  'node:',
  'fs/',
  '@hocuspocus/',
  '@tiptap/',
  '@liveblocks/',
  '@fastify/',
  '@aws-sdk/',
  'next/',
];

const IMPORT_REGEX = /import\s+(?:(?:[\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g;

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function isImportAllowed(importPath: string): boolean {
  if (importPath.startsWith('./') || importPath.startsWith('../')) return true;
  if (EXACT_SUPERDOC_IMPORTS.has(importPath)) return true;
  if (EXACT_EXTERNAL_IMPORTS.has(importPath)) return true;
  return PREFIX_EXTERNAL_IMPORTS.some((p) => importPath.startsWith(p));
}

function globMdx(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      results.push(...globMdx(full));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      results.push(full);
    }
  }
  return results;
}

interface ImportError {
  file: string;
  line: number;
  importPath: string;
  text: string;
}

const parser = unified().use(remarkParse).use(remarkMdx);

function validateFile(filePath: string): ImportError[] {
  const content = readFileSync(filePath, 'utf-8');
  const tree = parser.parse(content);
  const errors: ImportError[] = [];

  visit(tree, 'code', (node: Code) => {
    const lang = node.lang ?? '';
    if (!['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(lang)) return;

    const codeLine = node.position?.start.line ?? 0;
    const lines = node.value.split('\n');

    for (let i = 0; i < lines.length; i++) {
      IMPORT_REGEX.lastIndex = 0;
      let match;
      while ((match = IMPORT_REGEX.exec(lines[i])) !== null) {
        if (!isImportAllowed(match[1])) {
          errors.push({
            file: filePath,
            line: codeLine + i + 1,
            importPath: match[1],
            text: lines[i].trim(),
          });
        }
      }
    }
  });

  return errors;
}

const docsRoot = resolve(import.meta.dir, '..');
const files = globMdx(docsRoot);

console.log(`${CYAN}${BOLD}Validating imports in ${files.length} MDX files...${RESET}\n`);

let totalErrors = 0;
const errorsByFile = new Map<string, ImportError[]>();

for (const file of files) {
  const errors = validateFile(file);
  if (errors.length > 0) {
    errorsByFile.set(relative(docsRoot, file), errors);
    totalErrors += errors.length;
  }
}

if (totalErrors === 0) {
  console.log(`${GREEN}${BOLD}All imports are valid.${RESET}`);
  process.exit(0);
}

console.log(`${RED}${BOLD}Found ${totalErrors} invalid import${totalErrors === 1 ? '' : 's'}:${RESET}\n`);

for (const [relFile, errors] of errorsByFile) {
  console.log(`${YELLOW}${BOLD}${relFile}${RESET}`);
  for (const err of errors) {
    console.log(`  ${DIM}${err.line}${RESET} ${RED}Invalid import: ${BOLD}${err.importPath}${RESET}`);
    console.log(`       ${DIM}${err.text}${RESET}`);
  }
  console.log();
}

console.log(
  `${RED}${BOLD}${totalErrors} error${totalErrors === 1 ? '' : 's'} found. ` +
    `Please use only allowed import paths in code examples.${RESET}`,
);

process.exit(1);
