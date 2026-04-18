/**
 * Internal story runtime types.
 *
 * A "story runtime" represents a resolved content story — the editor instance,
 * metadata, and lifecycle hooks needed to execute document-api operations
 * against that story's content.
 *
 * These types are internal to the adapter layer and should NOT be exposed
 * to public consumers.
 */

import type { Editor } from '../../core/Editor.js';
import type { StoryLocator } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Story kind — broad classification
// ---------------------------------------------------------------------------

/** Broad category of a content story. */
export type StoryKind = 'body' | 'headerFooter' | 'note';

// ---------------------------------------------------------------------------
// StoryRuntime — resolved handle to a story's editor and metadata
// ---------------------------------------------------------------------------

/**
 * A resolved story runtime — provides the editor and metadata needed
 * to execute document-api operations against a specific story.
 *
 * Runtimes are cached by {@link storyKey} and may be evicted when the
 * cache reaches capacity. The optional {@link dispose} callback is invoked
 * on eviction to release resources.
 */
export interface StoryRuntime {
  /** The locator that was resolved to produce this runtime. */
  locator: StoryLocator;

  /** Canonical cache key for this story (deterministic, one-way). */
  storyKey: string;

  /** The ProseMirror editor for this story's content. */
  editor: Editor;

  /** Broad category of the story. */
  kind: StoryKind;

  /**
   * Whether this runtime may be stored in the shared runtime cache.
   *
   * Defaults to `true` when omitted. Runtimes that represent a temporary
   * write-only view of a story that does not yet exist should set this to
   * `false` so dry-runs and failed writes do not pollute later reads.
   */
  cacheable?: boolean;

  /** Called when the runtime is being disposed (evicted or invalidated). */
  dispose?: () => void;

  /**
   * Persists the story editor's current state back to the canonical OOXML part.
   *
   * Called after a successful mutation to sync changes from the in-memory
   * ProseMirror state to the document's parts storage. For body stories
   * this is a no-op (ProseMirror handles persistence directly). For
   * non-body stories, this writes back through `mutatePart` / `exportSubEditorToPart`.
   *
   * @param hostEditor - The host (body) editor, needed for parts runtime access.
   */
  commit?: (hostEditor: Editor) => void;
}
