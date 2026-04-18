/**
 * Markdown source → mdast AST parsing.
 *
 * Uses unified + remark-parse + remark-gfm to produce a GFM-aware mdast tree.
 * This is the only place in the codebase that touches remark-parse.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';

/**
 * Parse a Markdown string into an mdast AST tree.
 *
 * Supports GitHub Flavored Markdown (tables, strikethrough, autolinks, task lists).
 * This operation is synchronous and side-effect-free.
 */
export function parseMarkdownToAst(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(markdown) as Root;
}
