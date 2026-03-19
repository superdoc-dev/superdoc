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

/** Valid header/footer story kinds. */
export const STORY_HEADER_FOOTER_KINDS = ['header', 'footer'] as const;

/** Valid header/footer slot variants. */
export const STORY_HEADER_FOOTER_VARIANTS = ['default', 'first', 'even'] as const;

/** Valid header/footer slot resolution modes. */
export const STORY_HEADER_FOOTER_RESOLUTIONS = ['effective', 'explicit'] as const;

/** Valid header/footer slot write modes. */
export const STORY_HEADER_FOOTER_ON_WRITE_VALUES = ['materializeIfInherited', 'editResolvedPart', 'error'] as const;

export type StoryType = (typeof STORY_TYPES)[number];

export type StoryHeaderFooterKind = (typeof STORY_HEADER_FOOTER_KINDS)[number];
export type StoryHeaderFooterVariant = (typeof STORY_HEADER_FOOTER_VARIANTS)[number];
export type StoryHeaderFooterResolution = (typeof STORY_HEADER_FOOTER_RESOLUTIONS)[number];
export type StoryHeaderFooterOnWrite = (typeof STORY_HEADER_FOOTER_ON_WRITE_VALUES)[number];

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
  headerFooterKind: StoryHeaderFooterKind;
  variant: StoryHeaderFooterVariant;
  /** Resolution strategy. Defaults to `'effective'` when omitted. */
  resolution?: StoryHeaderFooterResolution;
  /** Write behavior when the slot is inherited. Defaults to `'materializeIfInherited'`. */
  onWrite?: StoryHeaderFooterOnWrite;
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
 * Checks the full discriminated-union shape so malformed partial locators do
 * not leak through validation and fail later with raw property-access errors.
 */
export function isStoryLocator(value: unknown): value is StoryLocator {
  if (!isObjectRecord(value) || value.kind !== 'story' || !isStringEnumMember(value.storyType, STORY_TYPES)) {
    return false;
  }

  switch (value.storyType) {
    case 'body':
      return true;

    case 'headerFooterSlot':
      return (
        isSectionAddress(value.section) &&
        isStringEnumMember(value.headerFooterKind, STORY_HEADER_FOOTER_KINDS) &&
        isStringEnumMember(value.variant, STORY_HEADER_FOOTER_VARIANTS) &&
        isOptionalStringEnumMember(value.resolution, STORY_HEADER_FOOTER_RESOLUTIONS) &&
        isOptionalStringEnumMember(value.onWrite, STORY_HEADER_FOOTER_ON_WRITE_VALUES)
      );

    case 'headerFooterPart':
      return isNonEmptyString(value.refId);

    case 'footnote':
    case 'endnote':
      return isNonEmptyString(value.noteId);
  }
}

/**
 * Type guard — returns `true` if `locator` targets the document body.
 */
export function isBodyStory(locator: StoryLocator): locator is BodyStoryLocator {
  return locator.storyType === 'body';
}

/**
 * Returns the effective resolution mode for a header/footer slot locator.
 */
export function getStoryHeaderFooterResolution(
  locator: Pick<HeaderFooterSlotStoryLocator, 'resolution'>,
): StoryHeaderFooterResolution {
  return locator.resolution ?? 'effective';
}

/**
 * Returns the effective write mode for a header/footer slot locator.
 */
export function getStoryHeaderFooterOnWrite(
  locator: Pick<HeaderFooterSlotStoryLocator, 'onWrite'>,
): StoryHeaderFooterOnWrite {
  return locator.onWrite ?? 'materializeIfInherited';
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
 * - `{ kind: 'story', storyType: 'headerFooterSlot', section: { kind: 'section', sectionId: 's1' }, headerFooterKind: 'header', variant: 'default' }` → `'story:headerFooterSlot:s1:header:default:effective:materializeIfInherited'`
 * - `{ kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' }` → `'story:headerFooterPart:rId7'`
 */
export function storyLocatorToKey(locator: StoryLocator): string {
  switch (locator.storyType) {
    case 'body':
      return 'story:body';

    case 'headerFooterSlot':
      return [
        'story:headerFooterSlot',
        locator.section.sectionId,
        locator.headerFooterKind,
        locator.variant,
        getStoryHeaderFooterResolution(locator),
        getStoryHeaderFooterOnWrite(locator),
      ].join(':');

    case 'headerFooterPart':
      return `story:headerFooterPart:${locator.refId}`;

    case 'footnote':
      return `story:footnote:${locator.noteId}`;

    case 'endnote':
      return `story:endnote:${locator.noteId}`;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringEnumMember<const T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function isOptionalStringEnumMember<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] | undefined {
  return value === undefined || isStringEnumMember(value, allowed);
}

function isSectionAddress(value: unknown): value is SectionAddress {
  return (
    isObjectRecord(value) &&
    value.kind === 'section' &&
    typeof value.sectionId === 'string' &&
    value.sectionId.length > 0
  );
}
