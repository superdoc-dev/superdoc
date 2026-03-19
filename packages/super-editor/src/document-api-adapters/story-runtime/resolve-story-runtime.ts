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
import type { StoryRuntime } from './story-types.js';
import { buildStoryKey, BODY_STORY_KEY } from './story-key.js';
import { StoryRuntimeCache } from './runtime-cache.js';
import { DocumentApiAdapterError } from '../errors.js';
import { resolveHeaderFooterSlotRuntime, resolveHeaderFooterPartRuntime } from './header-footer-story-runtime.js';
import { resolveNoteRuntime } from './note-story-runtime.js';
import { initRevision, trackRevisions, restoreRevision } from '../plan-engine/revision-tracker.js';
import { getStoryRevisionStore, getStoryRevision, incrementStoryRevision } from './story-revision-store.js';

// ---------------------------------------------------------------------------
// Cache — one per host editor, attached via WeakMap
// ---------------------------------------------------------------------------

const cacheByHost = new WeakMap<Editor, StoryRuntimeCache>();

/**
 * Returns the runtime cache for a host editor, creating it on first access.
 *
 * @param hostEditor - The body (host) editor.
 */
function getOrCreateCache(hostEditor: Editor): StoryRuntimeCache {
  let cache = cacheByHost.get(hostEditor);
  if (!cache) {
    cache = new StoryRuntimeCache();
    cacheByHost.set(hostEditor, cache);
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Body locator constant
// ---------------------------------------------------------------------------

/** Canonical body locator — avoids allocating a new object on every call. */
const BODY_LOCATOR: BodyStoryLocator = { kind: 'story', storyType: 'body' };

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
export function resolveStoryRuntime(hostEditor: Editor, locator?: StoryLocator): StoryRuntime {
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
      runtime = resolveHeaderFooterSlotRuntime(hostEditor, locator);
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
  if (store) {
    runtime.editor.on('transaction', ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) {
        incrementStoryRevision(store, storyKey);
      }
    });
  }

  cache.set(storyKey, runtime);
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
