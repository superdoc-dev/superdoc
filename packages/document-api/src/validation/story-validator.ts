import { isStoryLocator, storyLocatorToKey } from '../types/story.types.js';
import type { StoryLocator } from '../types/story.types.js';
import { DocumentApiValidationError } from '../errors.js';

/**
 * Validates that `value` is a valid StoryLocator if present.
 * Throws INVALID_INPUT if the shape is wrong.
 */
export function validateStoryLocator(value: unknown, field: string): void {
  if (value === undefined || value === null) return;
  if (!isStoryLocator(value)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${field} must be a valid StoryLocator ({ kind: 'story', storyType: ... }).`,
      { field, value },
    );
  }
}

/**
 * Validates the story resolution precedence rules.
 * - within must not carry story
 * - input.in and target.story must match if both present
 */
export function validateStoryConsistency(
  inputIn: StoryLocator | undefined,
  targetStory: StoryLocator | undefined,
  withinStory: StoryLocator | undefined,
): void {
  if (withinStory !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'within must not carry a story field — it scopes within the already-resolved story.',
      { field: 'within.story' },
    );
  }
  // If both input.in and target.story are present, they must match
  if (inputIn && targetStory) {
    const inKey = storyLocatorToKey(inputIn);
    const targetKey = storyLocatorToKey(targetStory);
    if (inKey !== targetKey) {
      throw new DocumentApiValidationError(
        'STORY_MISMATCH',
        `input.in and target.story point at different stories (${inKey} vs ${targetKey}).`,
        { inputIn, targetStory },
      );
    }
  }
}
