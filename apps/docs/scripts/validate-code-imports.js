#!/usr/bin/env node

/**
 * Validates import statements in MDX code blocks.
 *
 * Scans all .mdx files under apps/docs/ for JS/TS code blocks
 * and checks that every import path is on the allowlist.
 */

const fs = require('fs');
const path = require('path');

// ── Allowlists ──────────────────────────────────────────────────────────────

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
  '@superdoc-dev/template-builder',
  '@superdoc-dev/template-builder/defaults',
  '@superdoc-dev/superdoc-yjs-collaboration',
]);

const EXACT_EXTERNAL_IMPORTS = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'vue',
  'yjs',
  'y-prosemirror',
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
  '@tiptap-pro/',
  '@liveblocks/',
  '@y-sweet/',
  '@fastify/',
  '@aws-sdk/',
  'next/',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function isImportAllowed(importPath) {
  // Relative imports are always allowed
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return true;
  }

  if (EXACT_SUPERDOC_IMPORTS.has(importPath)) return true;
  if (EXACT_EXTERNAL_IMPORTS.has(importPath)) return true;

  for (const prefix of PREFIX_EXTERNAL_IMPORTS) {
    if (importPath.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Recursively collect all .mdx files under `dir`.
 */
function globMdx(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules / hidden dirs
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      results.push(...globMdx(full));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Strip regions inside HTML comments (<!-- ... -->) so we don't
 * inspect code blocks that are commented out.
 * Returns an array of lines with commented regions replaced by empty strings
 * while preserving line count.
 */
function stripHtmlComments(content) {
  // Replace comment contents with empty lines to keep line numbers stable
  return content.replace(/<!--[\s\S]*?-->/g, (match) => {
    // Preserve the same number of newlines
    return match.replace(/[^\n]/g, '');
  });
}

const CODE_FENCE_REGEX = /^```(?:js|javascript|ts|typescript|jsx|tsx)(?:\s.*)?$/;
const IMPORT_REGEX = /import\s+(?:(?:[\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * Validate a single MDX file. Returns an array of error objects.
 */
function validateFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const content = stripHtmlComments(raw);
  const lines = content.split('\n');

  const errors = [];
  let insideCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!insideCodeBlock) {
      if (CODE_FENCE_REGEX.test(trimmed)) {
        insideCodeBlock = true;
      }
      continue;
    }

    // Inside a code block
    if (trimmed.startsWith('```')) {
      insideCodeBlock = false;
      continue;
    }

    // Look for imports on this line
    let match;
    IMPORT_REGEX.lastIndex = 0;
    while ((match = IMPORT_REGEX.exec(line)) !== null) {
      const importPath = match[1];
      if (!isImportAllowed(importPath)) {
        errors.push({
          file: filePath,
          line: i + 1, // 1-indexed
          importPath,
          text: line.trim(),
        });
      }
    }
  }

  return errors;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const docsRoot = path.resolve(__dirname, '..');
  const files = globMdx(docsRoot);

  console.log(`${CYAN}${BOLD}Validating imports in ${files.length} MDX files...${RESET}\n`);

  let totalErrors = 0;
  const errorsByFile = new Map();

  for (const file of files) {
    const errors = validateFile(file);
    if (errors.length > 0) {
      const rel = path.relative(docsRoot, file);
      errorsByFile.set(rel, errors);
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
}

main();
