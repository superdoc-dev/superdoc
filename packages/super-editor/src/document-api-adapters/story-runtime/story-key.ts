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
 * | headerFooterSlot    | `hf:slot:{sectionId}:{kind}:{variant}:{resolution}:{onWrite}` | `hf:slot:sec2:header:default:effective:materializeIfInherited` |
 * | headerFooterPart    | `hf:part:{refId}`                                                | `hf:part:rId7`                                              |
 * | footnote            | `fn:{noteId}`                                                    | `fn:12`                                                     |
 * | endnote             | `en:{noteId}`                                                    | `en:3`                                                      |
 *
 * Header/footer slot keys intentionally include the normalized resolution
 * and write semantics so runtime caching never conflates:
 * - effective vs explicit slot reads
 * - materializeIfInherited vs editResolvedPart vs error writes
 *
 * The parser still accepts the legacy 4-segment slot form
 * `hf:slot:{sectionId}:{kind}:{variant}` and expands it to the default
 * semantics (`effective` + `materializeIfInherited`) for backward
 * compatibility with older V4 refs.
 */

import {
  getStoryHeaderFooterOnWrite,
  getStoryHeaderFooterResolution,
  STORY_HEADER_FOOTER_KINDS,
  STORY_HEADER_FOOTER_ON_WRITE_VALUES,
  STORY_HEADER_FOOTER_RESOLUTIONS,
  STORY_HEADER_FOOTER_VARIANTS,
  type StoryLocator,
  type HeaderFooterSlotStoryLocator,
} from '@superdoc/document-api';
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
 * Round-tripping is supported via {@link parseStoryKey}.
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
 * // => 'hf:slot:sec2:header:default:effective:materializeIfInherited'
 * ```
 */
export function buildStoryKey(locator: StoryLocator): string {
  switch (locator.storyType) {
    case 'body':
      return BODY_STORY_KEY;

    case 'headerFooterSlot':
      return [
        'hf:slot',
        locator.section.sectionId,
        locator.headerFooterKind,
        locator.variant,
        getStoryHeaderFooterResolution(locator),
        getStoryHeaderFooterOnWrite(locator),
      ].join(':');

    case 'headerFooterPart':
      return `hf:part:${locator.refId}`;

    case 'footnote':
      return `fn:${locator.noteId}`;

    case 'endnote':
      return `en:${locator.noteId}`;
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parses a canonical internal story key back into a {@link StoryLocator}.
 *
 * This is primarily used to recover story semantics from V4 refs so that
 * ref-only mutations execute against the correct non-body runtime.
 *
 * Accepts both the current header/footer slot key format and the legacy
 * 4-segment slot form without normalized resolution/write metadata.
 *
 * @param storyKey - The canonical story key to parse.
 * @returns The decoded story locator.
 * @throws {Error} If the key is malformed or uses an unknown prefix.
 */
export function parseStoryKey(storyKey: string): StoryLocator {
  if (storyKey === BODY_STORY_KEY) {
    return { kind: 'story', storyType: 'body' };
  }

  if (storyKey.startsWith('hf:slot:')) {
    return parseHeaderFooterSlotKey(storyKey);
  }

  if (storyKey.startsWith('hf:part:')) {
    return parseHeaderFooterPartKey(storyKey);
  }

  if (storyKey.startsWith('fn:')) {
    return parseNoteKey(storyKey, 'footnote');
  }

  if (storyKey.startsWith('en:')) {
    return parseNoteKey(storyKey, 'endnote');
  }

  throw new Error(`Unrecognized story key: "${storyKey}"`);
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
 * parseStoryKeyType('hf:slot:sec2:header:default:effective:materializeIfInherited');   // => 'headerFooter'
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

function parseHeaderFooterSlotKey(storyKey: string): HeaderFooterSlotStoryLocator {
  const segments = storyKey.split(':');
  if (segments.length !== 5 && segments.length !== 7) {
    throw new Error(
      `Malformed header/footer slot story key "${storyKey}". Expected 5 or 7 segments, got ${segments.length}.`,
    );
  }

  const [, , sectionId, headerFooterKind, variant] = segments;
  const resolution = segments[5] ?? 'effective';
  const onWrite = segments[6] ?? 'materializeIfInherited';

  if (!isNonEmptyString(sectionId)) {
    throw new Error(`Malformed header/footer slot story key "${storyKey}": missing section id.`);
  }
  if (!isEnumMember(headerFooterKind, STORY_HEADER_FOOTER_KINDS)) {
    throw new Error(`Malformed header/footer slot story key "${storyKey}": invalid kind "${headerFooterKind}".`);
  }
  if (!isEnumMember(variant, STORY_HEADER_FOOTER_VARIANTS)) {
    throw new Error(`Malformed header/footer slot story key "${storyKey}": invalid variant "${variant}".`);
  }
  if (!isEnumMember(resolution, STORY_HEADER_FOOTER_RESOLUTIONS)) {
    throw new Error(`Malformed header/footer slot story key "${storyKey}": invalid resolution "${resolution}".`);
  }
  if (!isEnumMember(onWrite, STORY_HEADER_FOOTER_ON_WRITE_VALUES)) {
    throw new Error(`Malformed header/footer slot story key "${storyKey}": invalid onWrite "${onWrite}".`);
  }

  return {
    kind: 'story',
    storyType: 'headerFooterSlot',
    section: { kind: 'section', sectionId },
    headerFooterKind,
    variant,
    resolution,
    onWrite,
  };
}

function parseHeaderFooterPartKey(storyKey: string): StoryLocator {
  const refId = storyKey.slice('hf:part:'.length);
  if (!isNonEmptyString(refId)) {
    throw new Error(`Malformed header/footer part story key "${storyKey}": missing refId.`);
  }

  return {
    kind: 'story',
    storyType: 'headerFooterPart',
    refId,
  };
}

function parseNoteKey(storyKey: string, storyType: 'footnote' | 'endnote'): StoryLocator {
  const prefix = storyType === 'footnote' ? 'fn:' : 'en:';
  const noteId = storyKey.slice(prefix.length);
  if (!isNonEmptyString(noteId)) {
    throw new Error(`Malformed ${storyType} story key "${storyKey}": missing noteId.`);
  }

  return {
    kind: 'story',
    storyType,
    noteId,
  };
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isEnumMember<const T extends readonly string[]>(value: string | undefined, allowed: T): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}
