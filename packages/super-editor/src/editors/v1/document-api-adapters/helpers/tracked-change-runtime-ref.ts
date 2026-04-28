/**
 * Internal helpers for tracked-change runtime refs and shared anchor keys.
 *
 * Public tracked-change addresses use canonical IDs, while runtime refs use
 * story-local raw IDs. This module intentionally stays on the runtime side of
 * that boundary; it does not attempt to convert contract addresses.
 */

/**
 * Internal runtime form of a tracked-change identity.
 *
 * - `storyKey` — compact, cache-friendly story identity (see `story-key.ts`).
 * - `rawId` — the raw tracked-change mark ID local to the owning story editor.
 *
 * Story runtimes are editor-scoped and revision-tracking is per-editor, so
 * `rawId` is story-local by construction. This ref captures that scoping
 * explicitly so sidebar position maps, accept/reject routers, and the
 * TrackedChangeIndex can key on the full (storyKey, rawId) tuple without
 * ambiguity.
 */
export interface TrackedChangeRuntimeRef {
  storyKey: string;
  rawId: string;
}

/** Prefix for tracked-change anchor keys in shared position maps. */
export const TRACKED_CHANGE_ANCHOR_KEY_PREFIX = 'tc::';

/** Prefix for comment anchor keys in shared position maps. */
export const COMMENT_ANCHOR_KEY_PREFIX = 'comment::';

/**
 * Builds the canonical shared-map anchor key for a tracked-change runtime ref.
 *
 * Format: `tc::<storyKey>::<rawId>`.
 */
export function makeTrackedChangeAnchorKey(ref: TrackedChangeRuntimeRef): string {
  return `${TRACKED_CHANGE_ANCHOR_KEY_PREFIX}${ref.storyKey}::${ref.rawId}`;
}

/**
 * Builds the canonical shared-map anchor key for a comment id.
 *
 * Format: `comment::<id>`.
 */
export function makeCommentAnchorKey(commentId: string): string {
  return `${COMMENT_ANCHOR_KEY_PREFIX}${commentId}`;
}

/**
 * Returns true when the given key is a canonical tracked-change anchor key.
 */
export function isTrackedChangeAnchorKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(TRACKED_CHANGE_ANCHOR_KEY_PREFIX);
}

/**
 * Returns true when the given key is a canonical comment anchor key.
 */
export function isCommentAnchorKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(COMMENT_ANCHOR_KEY_PREFIX);
}

/**
 * Parses a canonical tracked-change anchor key back into a {@link TrackedChangeRuntimeRef}.
 *
 * Returns `null` when the key is not a tracked-change anchor key or when
 * the format is malformed.
 */
export function parseTrackedChangeAnchorKey(key: string): TrackedChangeRuntimeRef | null {
  if (!isTrackedChangeAnchorKey(key)) return null;

  const body = key.slice(TRACKED_CHANGE_ANCHOR_KEY_PREFIX.length);
  const separatorIndex = body.lastIndexOf('::');
  if (separatorIndex <= 0 || separatorIndex >= body.length - 2) return null;

  const storyKey = body.slice(0, separatorIndex);
  const rawId = body.slice(separatorIndex + 2);
  if (!storyKey || !rawId) return null;

  return { storyKey, rawId };
}
