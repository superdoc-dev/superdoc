/**
 * Story locator types for addressing content within different document stories.
 *
 * A "story" is a distinct content flow within a document — the body, a header,
 * a footer, a footnote, or an endnote. Every address and query can optionally
 * target a specific story; when omitted, the body story is assumed (backward
 * compatible).
 */

import type { SectionAddress } from '../sections/sections.types.js';

// ---------------------------------------------------------------------------
// Story type constants
// ---------------------------------------------------------------------------

/** All recognized story types. */
export const STORY_TYPES = ['body', 'headerFooterSlot', 'headerFooterPart', 'footnote', 'endnote'] as const;

export type StoryType = (typeof STORY_TYPES)[number];

// ---------------------------------------------------------------------------
// StoryLocator — discriminated union
// ---------------------------------------------------------------------------

/** The main document body. */
export interface BodyStoryLocator {
  kind: 'story';
  storyType: 'body';
}

/**
 * A header/footer slot identified by section, kind, and variant.
 *
 * This is the high-level "logical" locator — it represents a slot that may
 * resolve to an explicit part in the targeted section or inherit from an
 * earlier section.
 *
 * - `resolution` controls whether the locator resolves to the effective part
 *   (following inheritance) or only matches an explicit local reference.
 *   Defaults to `'effective'` when omitted.
 * - `onWrite` controls mutation behavior when the slot is inherited:
 *   - `'materializeIfInherited'` — creates a local copy before editing (default).
 *   - `'editResolvedPart'` — edits the inherited part in place.
 *   - `'error'` — fails if the slot is not explicitly defined in this section.
 */
export interface HeaderFooterSlotStoryLocator {
  kind: 'story';
  storyType: 'headerFooterSlot';
  section: SectionAddress;
  headerFooterKind: 'header' | 'footer';
  variant: 'default' | 'first' | 'even';
  /** Resolution strategy. Defaults to `'effective'` when omitted. */
  resolution?: 'effective' | 'explicit';
  /** Write behavior when the slot is inherited. Defaults to `'materializeIfInherited'`. */
  onWrite?: 'materializeIfInherited' | 'editResolvedPart' | 'error';
}

/**
 * A header/footer part identified by its relationship ID.
 *
 * This is the low-level "physical" locator — it points directly at a specific
 * header or footer XML part, bypassing section-level resolution.
 */
export interface HeaderFooterPartStoryLocator {
  kind: 'story';
  storyType: 'headerFooterPart';
  refId: string;
}

/** A footnote story identified by its note ID. */
export interface FootnoteStoryLocator {
  kind: 'story';
  storyType: 'footnote';
  noteId: string;
}

/** An endnote story identified by its note ID. */
export interface EndnoteStoryLocator {
  kind: 'story';
  storyType: 'endnote';
  noteId: string;
}

/**
 * Identifies a content story within a document.
 *
 * Discriminate on `storyType` to narrow to a specific variant.
 */
export type StoryLocator =
  | BodyStoryLocator
  | HeaderFooterSlotStoryLocator
  | HeaderFooterPartStoryLocator
  | FootnoteStoryLocator
  | EndnoteStoryLocator;

// ---------------------------------------------------------------------------
// Type guards & helpers
// ---------------------------------------------------------------------------

/**
 * Type guard — returns `true` if `value` is a valid {@link StoryLocator}.
 *
 * Checks structural shape: `kind === 'story'` and `storyType` is a known value.
 */
export function isStoryLocator(value: unknown): value is StoryLocator {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.kind === 'story' &&
    typeof obj.storyType === 'string' &&
    (STORY_TYPES as readonly string[]).includes(obj.storyType)
  );
}

/**
 * Type guard — returns `true` if `locator` targets the document body.
 */
export function isBodyStory(locator: StoryLocator): locator is BodyStoryLocator {
  return locator.storyType === 'body';
}

// ---------------------------------------------------------------------------
// Canonical key serialization
// ---------------------------------------------------------------------------

/**
 * Converts a {@link StoryLocator} to a canonical string key.
 *
 * The key is deterministic and suitable for use as a map key or cache key.
 * Round-tripping is NOT guaranteed — this is a one-way serialization.
 *
 * Examples:
 * - `{ kind: 'story', storyType: 'body' }` → `'story:body'`
 * - `{ kind: 'story', storyType: 'footnote', noteId: 'fn1' }` → `'story:footnote:fn1'`
 * - `{ kind: 'story', storyType: 'headerFooterSlot', section: { kind: 'section', sectionId: 's1' }, headerFooterKind: 'header', variant: 'default' }` → `'story:headerFooterSlot:s1:header:default'`
 * - `{ kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' }` → `'story:headerFooterPart:rId7'`
 */
export function storyLocatorToKey(locator: StoryLocator): string {
  switch (locator.storyType) {
    case 'body':
      return 'story:body';

    case 'headerFooterSlot':
      return `story:headerFooterSlot:${locator.section.sectionId}:${locator.headerFooterKind}:${locator.variant}`;

    case 'headerFooterPart':
      return `story:headerFooterPart:${locator.refId}`;

    case 'footnote':
      return `story:footnote:${locator.noteId}`;

    case 'endnote':
      return `story:endnote:${locator.noteId}`;
  }
}
