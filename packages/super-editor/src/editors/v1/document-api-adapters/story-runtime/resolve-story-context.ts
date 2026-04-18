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
import { decodeRef } from './story-ref-codec.js';
import { parseStoryKey } from './story-key.js';

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

// ---------------------------------------------------------------------------
// Ref → story extraction
// ---------------------------------------------------------------------------

/** Canonical body locator — avoids allocating a new object on every call. */
const BODY_LOCATOR: StoryLocator = { kind: 'story', storyType: 'body' };

/**
 * Extracts a {@link StoryLocator} from an opaque ref string.
 *
 * - V4 refs carry an embedded story key that is decoded and parsed.
 * - V3 refs are body-scoped by convention and return an explicit body
 *   locator so that cross-story mismatch detection works correctly
 *   (e.g., a body V3 ref paired with `in: footnote/...` is rejected).
 * - Non-ref or unparseable strings return `undefined`.
 *
 * @param ref - An opaque text ref string, or `undefined`.
 * @returns The decoded story locator, or `undefined` when `ref` is absent
 *   or not a recognized ref format.
 *
 * @throws {DocumentApiAdapterError} `INVALID_TARGET` if the ref is V4
 *   but carries a malformed story key.
 */
export function resolveStoryFromRef(ref: string | undefined): StoryLocator | undefined {
  if (!ref) return undefined;

  const decoded = decodeRef(ref);
  if (!decoded) return undefined;

  // V3 refs predate the multi-story system and are always body-scoped.
  // Returning an explicit body locator (rather than undefined) ensures that
  // pairing a V3 body ref with a non-body `in` or V4 ref is correctly
  // detected as a cross-story mismatch.
  if (decoded.v !== 4) return BODY_LOCATOR;

  try {
    return parseStoryKey(decoded.storyKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DocumentApiAdapterError('INVALID_TARGET', `Ref carries an invalid story key: ${message}`, {
      ref,
      storyKey: decoded.storyKey,
    });
  }
}

// ---------------------------------------------------------------------------
// Composable mutation-context story resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the story locator from a mutation's full context.
 *
 * Composes three potential sources using the standard precedence rules:
 * 1. `input.in` — explicit story targeting on the operation input
 * 2. `target.story` — story threaded on a resolved target (from discovery APIs)
 * 3. `ref` — V4 ref string whose embedded story key is decoded
 *
 * Sources 2 and 3 are merged (target takes precedence), then validated
 * against source 1 via {@link resolveStoryFromInput}.
 *
 * @param context - The mutation context containing any combination of the three sources.
 */
export function resolveMutationStory(context: {
  in?: StoryLocator;
  target?: { story?: StoryLocator };
  ref?: string;
}): StoryLocator | undefined {
  const storyFromRef = resolveStoryFromRef(context.ref);
  const effectiveTargetStory = context.target?.story ?? storyFromRef;

  return resolveStoryFromInput({ in: context.in }, effectiveTargetStory ? { story: effectiveTargetStory } : undefined);
}
