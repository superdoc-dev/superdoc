/**
 * Central story runtime resolution.
 *
 * {@link resolveStoryRuntime} is the single entry point for obtaining a
 * {@link StoryRuntime} from a {@link StoryLocator}. It handles:
 *
 * - **Body** — zero-cost passthrough wrapping the host editor.
 * - **Header/footer** — delegates to {@link resolveHeaderFooterSlotRuntime}
 *   or {@link resolveHeaderFooterPartRuntime} for section-level or direct
 *   part-level resolution.
 * - **Footnote/endnote** — delegates to {@link resolveNoteRuntime} for
 *   note content extraction from the converter cache.
 *
 * All resolved runtimes are cached in a {@link StoryRuntimeCache} attached
 * to the host editor so that repeated accesses to the same story reuse the
 * same editor instance.
 */

import type { StoryLocator, BodyStoryLocator } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { PartChangedEvent } from '../../core/parts/types.js';
import type { StoryRuntime } from './story-types.js';
import { buildStoryKey, BODY_STORY_KEY } from './story-key.js';
import { StoryRuntimeCache } from './runtime-cache.js';
import { DocumentApiAdapterError } from '../errors.js';
import { resolveHeaderFooterSlotRuntime, resolveHeaderFooterPartRuntime } from './header-footer-story-runtime.js';
import { resolveNoteRuntime } from './note-story-runtime.js';
import { isHeaderFooterPartId } from '../../core/parts/adapters/header-footer-part-descriptor.js';
import { initRevision, trackRevisions, restoreRevision } from '../plan-engine/revision-tracker.js';
import { getStoryRevisionStore, getStoryRevision, incrementStoryRevision } from './story-revision-store.js';

// ---------------------------------------------------------------------------
// Cache — one per host editor, attached via WeakMap
// ---------------------------------------------------------------------------

const cacheByHost = new WeakMap<Editor, StoryRuntimeCache>();

/**
 * Tracks which (editor, storyKey) pairs already have a host-store sync
 * listener attached. Prevents duplicate listeners when the same live editor
 * is re-resolved after cache eviction without destruction (e.g., live
 * PresentationEditor sub-editors for header/footer slots).
 */
const hostStoreSyncedKeys = new WeakMap<Editor, Set<string>>();

function hasHostStoreSyncListener(editor: Editor, storyKey: string): boolean {
  return hostStoreSyncedKeys.get(editor)?.has(storyKey) ?? false;
}

function markHostStoreSyncListener(editor: Editor, storyKey: string): void {
  let keys = hostStoreSyncedKeys.get(editor);
  if (!keys) {
    keys = new Set();
    hostStoreSyncedKeys.set(editor, keys);
  }
  keys.add(storyKey);
}

/**
 * Returns the runtime cache for a host editor, creating it on first access.
 *
 * On first creation, subscribes to part-change events so that cached story
 * runtimes are automatically invalidated when underlying parts are mutated
 * through external paths (e.g., `footnotes.update` via `mutatePart`).
 *
 * @param hostEditor - The body (host) editor.
 */
function getOrCreateCache(hostEditor: Editor): StoryRuntimeCache {
  let cache = cacheByHost.get(hostEditor);
  if (!cache) {
    cache = new StoryRuntimeCache();
    cacheByHost.set(hostEditor, cache);
    subscribeToPartChanges(hostEditor);
  }
  return cache;
}

/**
 * Subscribes to editor events that signal part-level mutations so the
 * story runtime cache stays consistent with the converter's derived caches.
 *
 * - `notes-part-changed` → invalidates all footnote and endnote runtimes.
 * - `partChanged` → invalidates all header/footer runtimes when any
 *   header/footer part is mutated through an external path (collab sync,
 *   PresentationEditor sub-editor blur, etc.).
 *
 * The next `resolveStoryRuntime` call will create fresh editors from the
 * updated converter data.
 */
function subscribeToPartChanges(hostEditor: Editor): void {
  // Guard: not all editor instances (e.g., test stubs) expose EventEmitter methods.
  if (typeof hostEditor.on !== 'function') return;

  hostEditor.on('notes-part-changed', () => {
    const cache = cacheByHost.get(hostEditor);
    if (!cache) return;
    cache.invalidateByPrefix('fn:');
    cache.invalidateByPrefix('en:');
  });

  hostEditor.on('partChanged', (event: PartChangedEvent) => {
    const cache = cacheByHost.get(hostEditor);
    if (!cache) return;

    const hasHfPart = event.parts.some((p) => isHeaderFooterPartId(p.partId));
    if (hasHfPart) {
      cache.invalidateByPrefix('hf:');
    }
  });
}

// ---------------------------------------------------------------------------
// Body locator constant
// ---------------------------------------------------------------------------

/** Canonical body locator — avoids allocating a new object on every call. */
const BODY_LOCATOR: BodyStoryLocator = { kind: 'story', storyType: 'body' };

/**
 * Runtime resolution options.
 *
 * Read operations use the default `'read'` intent. Write operations opt into
 * `'write'` so story-specific resolvers may prepare temporary write-only
 * runtimes for stories that do not exist yet.
 */
export interface ResolveStoryRuntimeOptions {
  intent?: 'read' | 'write';
}

// ---------------------------------------------------------------------------
// Body runtime — zero-cost passthrough
// ---------------------------------------------------------------------------

/**
 * Creates a body runtime that wraps the host editor directly.
 *
 * This is a zero-cost passthrough — no child editor is created, no
 * resources need disposal.
 */
function createBodyRuntime(hostEditor: Editor): StoryRuntime {
  return {
    locator: BODY_LOCATOR,
    storyKey: BODY_STORY_KEY,
    editor: hostEditor,
    kind: 'body',
    // No dispose — the host editor outlives all runtimes.
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a {@link StoryLocator} to a {@link StoryRuntime}.
 *
 * When the locator is `undefined` or targets the body, the host editor
 * itself is returned as a zero-cost passthrough runtime.
 *
 * For non-body stories (headers, footers, footnotes, endnotes), the
 * function delegates to story-specific resolution logic:
 * - **headerFooterSlot** — resolves via section variant lookup
 * - **headerFooterPart** — resolves directly by relationship ID
 * - **footnote / endnote** — resolves from the converter's note cache
 *
 * Resolved runtimes are cached by story key so that repeated calls with
 * the same locator return the same editor instance.
 *
 * @param hostEditor - The body (host) editor — always the document's primary editor.
 * @param locator    - The story to resolve. `undefined` defaults to body.
 * @returns A resolved story runtime ready for operation execution.
 *
 * @throws {DocumentApiAdapterError} `STORY_NOT_FOUND` if the targeted
 *   story cannot be located in the converter's data structures.
 * @throws {DocumentApiAdapterError} `INVALID_INPUT` if the locator has
 *   an unrecognized story type.
 */
export function resolveStoryRuntime(
  hostEditor: Editor,
  locator?: StoryLocator,
  options: ResolveStoryRuntimeOptions = {},
): StoryRuntime {
  // -----------------------------------------------------------------------
  // Default: undefined / body — passthrough
  // -----------------------------------------------------------------------
  if (locator === undefined || locator.storyType === 'body') {
    return resolveBodyRuntime(hostEditor);
  }

  // -----------------------------------------------------------------------
  // Non-body stories — validate key and dispatch
  // -----------------------------------------------------------------------
  const storyKey = buildStoryKey(locator);

  // Check the cache first.
  const cache = getOrCreateCache(hostEditor);
  const cached = cache.get(storyKey);
  if (cached) return cached;

  // Dispatch by story type.
  let runtime: StoryRuntime;

  switch (locator.storyType) {
    case 'headerFooterSlot':
      runtime = resolveHeaderFooterSlotRuntime(hostEditor, locator, options);
      break;

    case 'headerFooterPart':
      runtime = resolveHeaderFooterPartRuntime(hostEditor, locator);
      break;

    case 'footnote':
    case 'endnote':
      runtime = resolveNoteRuntime(hostEditor, locator);
      break;

    default: {
      // Exhaustiveness check — should never reach here if StoryLocator is well-typed.
      const _exhaustive: never = locator;
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `Unknown story type on locator: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }

  // Ensure non-body story editors have working per-editor revision tracking
  // so that getRevision(runtime.editor) returns correct values for the
  // compiler's revision checks. Without this, story editors created by
  // createStoryEditor have no revision counter and always report '0'.
  initRevision(runtime.editor);

  // Seed the per-editor revision counter from the host-held store so that
  // recreated editors (after cache eviction) start at the correct revision
  // instead of resetting to 0.
  const store = getStoryRevisionStore(hostEditor);
  if (store) {
    const currentStoreRevision = getStoryRevision(store, storyKey);
    restoreRevision(runtime.editor, currentStoreRevision);
  }

  trackRevisions(runtime.editor);

  // Keep the host-held store in sync with per-editor revision changes.
  // The per-editor counter is used by adapters via getRevision(runtime.editor).
  // The host-held store survives cache eviction of story runtimes.
  //
  // Guard: live sub-editors (e.g., PresentationEditor header/footer editors)
  // survive cache eviction without destruction. Without this guard, each
  // evict → re-resolve cycle would stack another listener on the same editor,
  // causing a single edit to increment the store revision multiple times.
  if (store && !hasHostStoreSyncListener(runtime.editor, storyKey)) {
    markHostStoreSyncListener(runtime.editor, storyKey);
    runtime.editor.on('transaction', ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) {
        incrementStoryRevision(store, storyKey);
      }
    });
  }

  if (runtime.cacheable !== false) {
    cache.set(storyKey, runtime);
  }

  return runtime;
}

/**
 * Resolves the body runtime, using the cache to ensure a single instance.
 */
function resolveBodyRuntime(hostEditor: Editor): StoryRuntime {
  const cache = getOrCreateCache(hostEditor);
  const cached = cache.get(BODY_STORY_KEY);
  if (cached) return cached;

  const runtime = createBodyRuntime(hostEditor);
  cache.set(BODY_STORY_KEY, runtime);
  return runtime;
}

// ---------------------------------------------------------------------------
// Cache access (for testing / advanced usage)
// ---------------------------------------------------------------------------

/**
 * Invalidates a specific cached story runtime, disposing it and removing
 * it from the cache.
 *
 * The next call to {@link resolveStoryRuntime} for the same story key
 * will create a fresh runtime from the current converter data.
 *
 * @param hostEditor - The body (host) editor.
 * @param storyKey   - The canonical story key to invalidate.
 * @returns `true` if the entry existed and was invalidated.
 */
export function invalidateStoryRuntime(hostEditor: Editor, storyKey: string): boolean {
  const cache = cacheByHost.get(hostEditor);
  if (!cache) return false;
  return cache.invalidate(storyKey);
}

/**
 * Returns the {@link StoryRuntimeCache} attached to a host editor.
 *
 * Returns `undefined` if no cache has been created yet (i.e., no runtime
 * has been resolved for this editor).
 *
 * @param hostEditor - The body (host) editor.
 */
export function getStoryRuntimeCache(hostEditor: Editor): StoryRuntimeCache | undefined {
  return cacheByHost.get(hostEditor);
}
