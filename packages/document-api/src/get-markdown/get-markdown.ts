import type { StoryLocator } from '../types/story.types.js';
import { validateStoryLocator } from '../validation/story-validator.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';

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
  if (!isRecord(input as unknown)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'getMarkdown input must be a non-null object.');
  }
  validateStoryLocator(input.in, 'in');
  return adapter.getMarkdown(input);
}
