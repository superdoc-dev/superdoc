/**
 * Story resolution from operation inputs.
 *
 * Document-api operations can receive a story locator from multiple sources:
 * - `input.in` — explicit story targeting on the operation input
 * - `target.story` — story attached to a resolved target/ref
 * - `within.story` — illegal on story-aware operations (reserved for nesting)
 *
 * This module implements the precedence table that collapses these sources
 * into a single {@link StoryLocator} (or `undefined` for body default).
 *
 * ## Precedence table
 *
 * | `input.in` | `target.story` | `within.story` | Behavior                               |
 * |------------|----------------|----------------|----------------------------------------|
 * | set        | absent         | absent         | Use `input.in`                         |
 * | absent     | set            | absent         | Use `target.story`                     |
 * | set        | set (matching) | absent         | OK, use either                         |
 * | set        | set (different)| --             | Reject: STORY_MISMATCH                 |
 * | any        | any            | set            | Reject: INVALID_INPUT (within + story) |
 * | absent     | absent         | absent         | Default to body (`undefined`)          |
 */

import type { StoryLocator } from '@superdoc/document-api';
import { storyLocatorToKey } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves the effective story locator from potentially overlapping sources.
 *
 * Returns `undefined` when all sources are absent, which signals "use the
 * body story" to downstream consumers.
 *
 * @param input   - The operation input, which may carry an `in` story locator.
 * @param target  - A resolved target that may carry a `story` locator (e.g., from a ref).
 * @param within  - A nesting context — must NOT carry a `story` field.
 * @returns The resolved story locator, or `undefined` for body default.
 *
 * @throws {DocumentApiAdapterError} `INVALID_INPUT` if `within.story` is set.
 * @throws {DocumentApiAdapterError} `INVALID_INPUT` with code `STORY_MISMATCH`
 *   if both `input.in` and `target.story` are set but refer to different stories.
 */
export function resolveStoryFromInput(
  input?: { in?: StoryLocator },
  target?: { story?: StoryLocator },
  within?: { story?: StoryLocator },
): StoryLocator | undefined {
  // -----------------------------------------------------------------------
  // Guard: `within` must never carry a story locator
  // -----------------------------------------------------------------------
  if (within?.story !== undefined) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      'The "within" context must not carry a story locator. ' +
        'Story targeting is specified via `input.in` or inherited from the target ref.',
      { source: 'within', locator: within.story },
    );
  }

  const fromInput = input?.in;
  const fromTarget = target?.story;

  // -----------------------------------------------------------------------
  // Both absent — default to body
  // -----------------------------------------------------------------------
  if (fromInput === undefined && fromTarget === undefined) {
    return undefined;
  }

  // -----------------------------------------------------------------------
  // Only one source is set — use it
  // -----------------------------------------------------------------------
  if (fromInput !== undefined && fromTarget === undefined) {
    return fromInput;
  }

  if (fromInput === undefined && fromTarget !== undefined) {
    return fromTarget;
  }

  // -----------------------------------------------------------------------
  // Both set — they must agree
  // -----------------------------------------------------------------------
  const inputKey = storyLocatorToKey(fromInput!);
  const targetKey = storyLocatorToKey(fromTarget!);

  if (inputKey !== targetKey) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      `Story mismatch: input.in targets "${inputKey}" but the target ref belongs to "${targetKey}". ` +
        'An operation cannot span multiple stories.',
      {
        reason: 'STORY_MISMATCH',
        inputStory: inputKey,
        targetStory: targetKey,
      },
    );
  }

  // Both agree — use the input locator (arbitrary, they are equivalent).
  return fromInput;
}
