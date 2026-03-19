/**
 * Canonical story key formatting.
 *
 * Story keys are deterministic, one-way string encodings of a
 * {@link StoryLocator}. They are used as cache keys in the runtime cache
 * and embedded in V4 refs to identify which story a ref belongs to.
 *
 * **These are INTERNAL wire keys** — they use a compact format optimized
 * for cache lookups and ref encoding. They are NOT the same as the public
 * {@link storyLocatorToKey} function in `@superdoc/document-api`, which
 * uses a different `story:` prefixed format for consumer-facing APIs.
 *
 * | Story type          | Key format                                | Example                      |
 * |---------------------|-------------------------------------------|------------------------------|
 * | body                | `body`                                    | `body`                       |
 * | headerFooterSlot    | `hf:slot:{sectionId}:{kind}:{variant}`    | `hf:slot:sec2:header:default`|
 * | headerFooterPart    | `hf:part:{refId}`                         | `hf:part:rId7`               |
 * | footnote            | `fn:{noteId}`                             | `fn:12`                      |
 * | endnote             | `en:{noteId}`                             | `en:3`                       |
 */

import type { StoryLocator } from '@superdoc/document-api';
import type { StoryKind } from './story-types.js';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

/** The canonical story key for the document body. */
export const BODY_STORY_KEY = 'body';

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Converts a {@link StoryLocator} to a canonical internal story key.
 *
 * The key is deterministic and suitable for use as a `Map` key or cache key.
 * Round-tripping is NOT guaranteed — this is a one-way serialization.
 *
 * @param locator - The story locator to encode.
 * @returns A compact, deterministic string key.
 *
 * @example
 * ```ts
 * buildStoryKey({ kind: 'story', storyType: 'body' });
 * // => 'body'
 *
 * buildStoryKey({ kind: 'story', storyType: 'footnote', noteId: '12' });
 * // => 'fn:12'
 *
 * buildStoryKey({
 *   kind: 'story',
 *   storyType: 'headerFooterSlot',
 *   section: { kind: 'section', sectionId: 'sec2' },
 *   headerFooterKind: 'header',
 *   variant: 'default',
 * });
 * // => 'hf:slot:sec2:header:default'
 * ```
 */
export function buildStoryKey(locator: StoryLocator): string {
  switch (locator.storyType) {
    case 'body':
      return BODY_STORY_KEY;

    case 'headerFooterSlot':
      return `hf:slot:${locator.section.sectionId}:${locator.headerFooterKind}:${locator.variant}`;

    case 'headerFooterPart':
      return `hf:part:${locator.refId}`;

    case 'footnote':
      return `fn:${locator.noteId}`;

    case 'endnote':
      return `en:${locator.noteId}`;
  }
}

// ---------------------------------------------------------------------------
// Parse (kind only)
// ---------------------------------------------------------------------------

/**
 * Extracts the broad story kind from a canonical story key.
 *
 * This is a lightweight classification that avoids full parsing — it only
 * inspects the key prefix to determine the category.
 *
 * @param storyKey - A canonical story key produced by {@link buildStoryKey}.
 * @returns The broad story kind: `'body'`, `'headerFooter'`, or `'note'`.
 * @throws {Error} If the key prefix is unrecognized.
 *
 * @example
 * ```ts
 * parseStoryKeyType('body');                          // => 'body'
 * parseStoryKeyType('hf:slot:sec2:header:default');   // => 'headerFooter'
 * parseStoryKeyType('hf:part:rId7');                  // => 'headerFooter'
 * parseStoryKeyType('fn:12');                         // => 'note'
 * parseStoryKeyType('en:3');                          // => 'note'
 * ```
 */
export function parseStoryKeyType(storyKey: string): StoryKind {
  if (storyKey === BODY_STORY_KEY) return 'body';
  if (storyKey.startsWith('hf:')) return 'headerFooter';
  if (storyKey.startsWith('fn:') || storyKey.startsWith('en:')) return 'note';

  throw new Error(`Unrecognized story key prefix: "${storyKey}"`);
}
