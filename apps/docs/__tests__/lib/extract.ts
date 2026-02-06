import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import { visit } from 'unist-util-visit';
import type { Code, Heading } from 'mdast';

export interface CodeExample {
  file: string;
  section: string;
  code: string;
  pattern: 'superdoc' | 'editor' | 'unknown';
  line: number;
}

const SKIP_FILE_PATTERNS = [
  /guides\/migration\//,
  /guides\/collaboration\//,
  /document-api\//,
  /solutions\/esign\//,
  /solutions\/template-builder\//,
  /ai\/ai-actions\//,
  /ai\/ai-builder\//,
  /getting-started\/frameworks\//,
  /snippets\//,
];

const SKIP_IMPORTS = [
  'openai',
  '@liveblocks/',
  '@hocuspocus/',
  '@tiptap/',
  '@y-sweet/',
  'hocuspocus',
  'fastify',
  'express',
  '@superdoc-dev/ai',
  '@superdoc-dev/esign',
  '@superdoc-dev/template-builder',
  '@superdoc-dev/superdoc-yjs-collaboration',
  'react',
  'react-dom',
  'vue',
  '@angular/',
];

const parser = unified().use(remarkParse).use(remarkMdx);

function globMdx(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === '__tests__') continue;
      results.push(...globMdx(full));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      results.push(full);
    }
  }
  return results;
}

function detectPattern(code: string): 'superdoc' | 'editor' | 'unknown' {
  if (code.includes("from 'superdoc/super-editor'") || code.includes('Editor.open')) {
    return 'editor';
  }
  if (code.includes("from 'superdoc'") || code.includes('new SuperDoc')) {
    return 'superdoc';
  }
  return 'unknown';
}

function hasSkipImport(code: string): boolean {
  for (const skipImport of SKIP_IMPORTS) {
    if (code.includes(`'${skipImport}'`) || code.includes(`"${skipImport}"`)) return true;
    if (skipImport.endsWith('/') && code.includes(skipImport)) return true;
  }
  return false;
}

function headingText(node: Heading): string {
  return node.children
    .map((child) => {
      if (child.type === 'text') return child.value;
      if (child.type === 'inlineCode') return child.value;
      return '';
    })
    .join('')
    .trim();
}

export function extractExamples(docsRoot: string): CodeExample[] {
  const files = globMdx(docsRoot);
  const examples: CodeExample[] = [];

  for (const filePath of files) {
    const relPath = relative(docsRoot, filePath);
    if (SKIP_FILE_PATTERNS.some((p) => p.test(relPath))) continue;

    const tree = parser.parse(readFileSync(filePath, 'utf-8'));

    const headings: Array<{ line: number; text: string }> = [];
    visit(tree, 'heading', (node: Heading) => {
      if (node.depth <= 3 && node.position) {
        headings.push({ line: node.position.start.line, text: headingText(node) });
      }
    });

    visit(tree, 'code', (node: Code) => {
      if (!node.meta?.includes('Full Example')) return;

      const code = node.value;
      if (hasSkipImport(code)) return;

      const pattern = detectPattern(code);
      if (pattern === 'unknown') return;

      const codeLine = node.position?.start.line ?? 0;
      let section = 'unknown';
      for (let i = headings.length - 1; i >= 0; i--) {
        if (headings[i].line < codeLine) {
          section = headings[i].text;
          break;
        }
      }

      examples.push({ file: relPath, section, code, pattern, line: codeLine });
    });
  }

  return examples;
}
