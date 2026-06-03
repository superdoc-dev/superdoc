// @ts-check
/**
 * Story locator helpers for the review graph.
 *
 * A review graph is built per story editor. The body, headers, footers,
 * footnotes, and endnotes each keep their own PM coordinate space and their
 * own raw Word-id namespaces; the graph never crosses those boundaries.
 *
 * `TrackedChangeIndexImpl` remains the host-level aggregator that composes
 * per-story graph projections (`packages/super-editor/.../document-api-
 * adapters/tracked-changes/tracked-change-index.ts`). This module owns the
 * locator type used by the graph itself so the graph stays decoupled from
 * the document-api adapter layer.
 */

/**
 * Public-style story locator that mirrors the `StoryLocator` exported from
 * `@superdoc/document-api`. Duplicated as a local typedef so this module
 * does not import from document-api adapters (the graph must stay below the
 * adapter layer per phase0-001 boundaries).
 *
 * @typedef {Object} StoryLocator
 * @property {'story'} kind
 * @property {'body'|'header'|'footer'|'headerFooterPart'|'footnote'|'endnote'} storyType
 * @property {string} [refId]
 * @property {string} [noteId]
 */

/** @type {StoryLocator} */
export const BODY_STORY = Object.freeze({ kind: 'story', storyType: 'body' });

/**
 * Deterministic stable key for a story locator. Used as the cache key for
 * graph snapshots. Mirrors the same shape as the document-api adapter's
 * `buildStoryKey` so cache lookups stay consistent across layers without a
 * cross-layer import.
 *
 * @param {StoryLocator | null | undefined} locator
 * @returns {string}
 */
export const buildStoryKey = (locator) => {
  if (!locator) return 'body';
  const { storyType, refId, noteId } = locator;
  switch (storyType) {
    case 'body':
      return 'body';
    case 'header':
      return `header:${refId ?? ''}`;
    case 'footer':
      return `footer:${refId ?? ''}`;
    case 'headerFooterPart':
      return `hf:${refId ?? ''}`;
    case 'footnote':
      return `fn:${noteId ?? ''}`;
    case 'endnote':
      return `en:${noteId ?? ''}`;
    default:
      return `unknown:${storyType ?? ''}`;
  }
};

/**
 * Compare two locators for equality.
 *
 * @param {StoryLocator | null | undefined} a
 * @param {StoryLocator | null | undefined} b
 * @returns {boolean}
 */
export const storyLocatorsEqual = (a, b) => buildStoryKey(a) === buildStoryKey(b);
