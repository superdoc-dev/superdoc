import type { StoryLocator } from '../types/story.types.js';
import { validateStoryLocator } from '../validation/story-validator.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';

export interface GetHtmlInput {
  /** Restrict the read to a specific story. Omit for body (backward compatible). */
  in?: StoryLocator;
  /**
   * Convert SuperDoc's internal flat-list representation to proper nested
   * `<ol>`/`<ul>` HTML. Defaults to `true`.
   */
  unflattenLists?: boolean;
}

/**
 * Engine-specific adapter that the getHtml API delegates to.
 */
export interface GetHtmlAdapter {
  /**
   * Return the full document content as an HTML string.
   */
  getHtml(input: GetHtmlInput): string;
}

/**
 * Execute a getHtml operation via the provided adapter.
 *
 * @param adapter - Engine-specific getHtml adapter.
 * @param input - Canonical getHtml input object.
 * @returns The full document content as an HTML string.
 */
export function executeGetHtml(adapter: GetHtmlAdapter, input: GetHtmlInput): string {
  if (!isRecord(input as unknown)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'getHtml input must be a non-null object.');
  }
  validateStoryLocator(input.in, 'in');
  return adapter.getHtml(input);
}
