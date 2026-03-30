/**
 * Story runtime module — multi-story resolution, caching, and ref encoding.
 *
 * This module is the internal backbone for executing document-api operations
 * against any content story (body, header/footer, footnote, endnote).
 *
 * @module story-runtime
 */

// Types
export type { StoryRuntime, StoryKind } from './story-types.js';

// Story key utilities
export { buildStoryKey, parseStoryKeyType, BODY_STORY_KEY } from './story-key.js';

// V4 ref codec
export type { StoryRefV3, StoryRefV4, StoryRefV4Node } from './story-ref-codec.js';
export { encodeV4Ref, decodeRef, isV4Ref } from './story-ref-codec.js';

// Per-story revision store
export type { StoryRevisionStore } from './story-revision-store.js';
export {
  initStoryRevisionStore,
  getStoryRevisionStore,
  getStoryRevision,
  incrementStoryRevision,
  getStoryRuntimeRevision,
} from './story-revision-store.js';

// Runtime cache
export { StoryRuntimeCache } from './runtime-cache.js';

// Resolution
export { resolveStoryRuntime, getStoryRuntimeCache } from './resolve-story-runtime.js';
export { resolveStoryFromInput, resolveStoryFromRef, resolveMutationStory } from './resolve-story-context.js';

// Story-specific resolvers
export { resolveHeaderFooterSlotRuntime, resolveHeaderFooterPartRuntime } from './header-footer-story-runtime.js';
export { resolveNoteRuntime } from './note-story-runtime.js';
