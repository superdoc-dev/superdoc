import type { StoryLocator } from '../types/story.types.js';
import { validateStoryLocator } from '../validation/story-validator.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';

export interface GetTextInput {
  /** Restrict the read to a specific story. Omit for body (backward compatible). */
  in?: StoryLocator;
}

/**
 * Engine-specific adapter that the getText API delegates to.
 */
export interface GetTextAdapter {
  /**
   * Return the full document text content.
   */
  getText(input: GetTextInput): string;
}

/**
 * Execute a getText operation via the provided adapter.
 *
 * @param adapter - Engine-specific getText adapter.
 * @param input - Canonical getText input object.
 * @returns The full document text content.
 */
export function executeGetText(adapter: GetTextAdapter, input: GetTextInput): string {
  if (!isRecord(input as unknown)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'getText input must be a non-null object.');
  }
  validateStoryLocator(input.in, 'in');
  return adapter.getText(input);
}
