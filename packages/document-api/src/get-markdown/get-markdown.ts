import type { StoryLocator } from '../types/story.types.js';

export interface GetMarkdownInput {
  /** Restrict the read to a specific story. Omit for body (backward compatible). */
  in?: StoryLocator;
}

/**
 * Engine-specific adapter that the getMarkdown API delegates to.
 */
export interface GetMarkdownAdapter {
  /**
   * Return the full document content as a Markdown string.
   */
  getMarkdown(input: GetMarkdownInput): string;
}

/**
 * Execute a getMarkdown operation via the provided adapter.
 *
 * @param adapter - Engine-specific getMarkdown adapter.
 * @param input - Canonical getMarkdown input object.
 * @returns The full document content as a Markdown-formatted string.
 */
export function executeGetMarkdown(adapter: GetMarkdownAdapter, input: GetMarkdownInput): string {
  return adapter.getMarkdown(input);
}
