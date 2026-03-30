/**
 * Per-story revision counters held on the host editor.
 *
 * Each story within a document has its own monotonic revision counter.
 * The counters live on the **host editor** (the body editor) so they
 * survive disposal of non-body story runtimes — a footnote editor may
 * be evicted from cache, but its revision must persist so that stale
 * refs can be detected when the runtime is re-created.
 *
 * ## Design rationale
 *
 * Storing revision counters on the host rather than on individual story
 * editors avoids two problems:
 * 1. Evicted runtimes lose their state — re-creating the editor would
 *    reset the counter, making all outstanding refs appear valid.
 * 2. The host editor is always alive (never evicted), providing a stable
 *    anchor for the full lifetime of the document session.
 */

import type { Editor } from '../../core/Editor.js';
import type { StoryRuntime } from './story-types.js';
import { getRevision } from '../plan-engine/revision-tracker.js';

// ---------------------------------------------------------------------------
// Store type
// ---------------------------------------------------------------------------

/**
 * A collection of per-story revision counters.
 *
 * Each entry maps a canonical story key (from {@link buildStoryKey}) to its
 * current revision number. Revisions start at `0` and increment on every
 * document-changing transaction within that story.
 */
export interface StoryRevisionStore {
  /** Per-story revision counters keyed by canonical story key. */
  readonly counters: Map<string, number>;
}

// ---------------------------------------------------------------------------
// WeakMap anchor — attaches the store to the host editor instance
// ---------------------------------------------------------------------------

const storeByEditor = new WeakMap<Editor, StoryRevisionStore>();

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Initializes a {@link StoryRevisionStore} and attaches it to the host editor.
 *
 * If a store already exists on this editor, the existing store is returned
 * unchanged — this is safe to call multiple times.
 *
 * @param editor - The host (body) editor instance.
 * @returns The attached store.
 */
export function initStoryRevisionStore(editor: Editor): StoryRevisionStore {
  const existing = storeByEditor.get(editor);
  if (existing) return existing;

  const store: StoryRevisionStore = { counters: new Map() };
  storeByEditor.set(editor, store);
  return store;
}

/**
 * Retrieves the {@link StoryRevisionStore} previously attached to the host editor.
 *
 * @param editor - The host (body) editor instance.
 * @returns The store, or `undefined` if {@link initStoryRevisionStore} has not been called.
 */
export function getStoryRevisionStore(editor: Editor): StoryRevisionStore | undefined {
  return storeByEditor.get(editor);
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/**
 * Returns the current revision string for a story.
 *
 * If the story has no recorded revision yet, returns `'0'`.
 *
 * @param store - The host-held revision store.
 * @param storyKey - Canonical story key (from {@link buildStoryKey}).
 * @returns A decimal string representing the current revision.
 */
export function getStoryRevision(store: StoryRevisionStore, storyKey: string): string {
  const rev = store.counters.get(storyKey) ?? 0;
  return String(rev);
}

/**
 * Increments the revision counter for a story and returns the new value.
 *
 * If the story has no recorded revision yet, it is initialized to `0` and
 * then incremented to `1`.
 *
 * @param store - The host-held revision store.
 * @param storyKey - Canonical story key (from {@link buildStoryKey}).
 * @returns A decimal string representing the new (post-increment) revision.
 */
export function incrementStoryRevision(store: StoryRevisionStore, storyKey: string): string {
  const current = store.counters.get(storyKey) ?? 0;
  const next = current + 1;
  store.counters.set(storyKey, next);
  return String(next);
}

// ---------------------------------------------------------------------------
// Unified revision accessor
// ---------------------------------------------------------------------------

/**
 * Gets the revision for a story runtime, using the host-held store for
 * non-body stories and the standard per-editor revision for body.
 *
 * Body stories use the existing per-editor revision counter (attached to
 * the host editor via {@link initRevision}/{@link trackRevisions}).
 * Non-body stories use the host-held {@link StoryRevisionStore} so that
 * revision counters survive cache eviction of story runtimes.
 *
 * @param hostEditor - The body (host) editor instance.
 * @param runtime    - The resolved story runtime.
 * @returns A decimal string representing the current revision.
 */
export function getStoryRuntimeRevision(hostEditor: Editor, runtime: StoryRuntime): string {
  if (runtime.kind === 'body') {
    return getRevision(hostEditor);
  }
  const store = getStoryRevisionStore(hostEditor);
  if (!store) return '0';
  return getStoryRevision(store, runtime.storyKey);
}
