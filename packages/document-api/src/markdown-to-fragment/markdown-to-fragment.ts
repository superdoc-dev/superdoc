/**
 * markdownToFragment — converts a Markdown string into an SDFragment.
 *
 * This is a "parse" operation: it takes Markdown text and returns structured
 * SDM/1 content nodes, along with a lossy flag and diagnostics for any
 * unsupported or ambiguous Markdown constructs.
 */

import type { SDMarkdownToFragmentResult } from '../types/sd-contract.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface MarkdownToFragmentInput {
  /** The Markdown source text to convert. */
  markdown: string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Engine-specific adapter that the markdownToFragment API delegates to.
 */
export interface MarkdownToFragmentAdapter {
  markdownToFragment(input: MarkdownToFragmentInput): SDMarkdownToFragmentResult;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute a markdownToFragment operation via the provided adapter.
 */
export function executeMarkdownToFragment(
  adapter: MarkdownToFragmentAdapter,
  input: MarkdownToFragmentInput,
): SDMarkdownToFragmentResult {
  return adapter.markdownToFragment(input);
}
