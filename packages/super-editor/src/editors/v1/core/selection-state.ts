/**
 * Shared selection-state module.
 *
 * Owns:
 * - the canonical plugin key for custom selection management
 * - a reader for the transaction-mapped preserved selection
 * - the tracked selection handle plugin and types
 *
 * All code that needs to read preserved selection state or reference the
 * custom-selection plugin key should import from this module — not from the
 * custom-selection extension directly. This keeps the dependency graph clean:
 *
 *   shared state module ← extension
 *   shared state module ← adapters
 *   shared state module ← other extensions
 */

import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorState, Selection, SelectionBookmark, Transaction } from 'prosemirror-state';

// ---------------------------------------------------------------------------
// Custom selection plugin key + preserved selection reader
// ---------------------------------------------------------------------------

/**
 * Plugin key for the custom selection management plugin.
 *
 * Previously defined in `extensions/custom-selection/custom-selection.js`.
 * Moved here so that adapter code and other extensions can reference it
 * without importing from the extension module.
 */
export const CustomSelectionPluginKey = new PluginKey('CustomSelection');

/**
 * Reads the transaction-mapped preserved selection from the custom-selection
 * PM plugin state.
 *
 * Returns `null` when:
 * - the plugin is not registered (headless mode, minimal configs, tests)
 * - the plugin has no preserved selection
 *
 * This is the only safe source of preserved selection for the selection
 * bridge. `editor.options.preservedSelection` and `editor.options.lastSelection`
 * are raw snapshots that are never transaction-mapped — do not use them.
 */
export function getPreservedSelection(state: EditorState): Selection | null {
  const focusState = CustomSelectionPluginKey.getState(state);
  return focusState?.preservedSelection ?? null;
}

// ---------------------------------------------------------------------------
// Tracked selection handles
// ---------------------------------------------------------------------------

/**
 * Accessor interface for resolving and releasing handles against the editor
 * that owns them. This avoids a direct import of `Editor` (which would
 * create a circular dependency) while still binding each handle to its
 * specific editor instance.
 */
export interface SelectionHandleOwner {
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
}

/**
 * Custom bookmark for non-empty TextSelections that keeps both range edges
 * inclusive when content is inserted exactly at the boundary.
 *
 * ProseMirror's built-in TextBookmark maps both ends with default assoc=1,
 * which shifts the left edge rightward on exact-boundary inserts. For this
 * feature we want the preserved/tracked text range to continue covering the
 * inserted content on both sides, matching the pre-bookmark behavior.
 */
class InclusiveTextSelectionBookmark implements SelectionBookmark {
  constructor(
    readonly anchor: number,
    readonly head: number,
  ) {}

  map(mapping: Transaction['mapping']): SelectionBookmark {
    const isForward = this.anchor <= this.head;
    return new InclusiveTextSelectionBookmark(
      mapping.map(this.anchor, isForward ? -1 : 1),
      mapping.map(this.head, isForward ? 1 : -1),
    );
  }

  resolve(doc: EditorState['doc']): Selection {
    return TextSelection.between(doc.resolve(this.anchor), doc.resolve(this.head));
  }
}

/**
 * Returns the bookmark representation used by tracked selection handles and
 * preserved selection remapping.
 *
 * Non-empty TextSelections use an inclusive bookmark so inserts at either
 * edge remain inside the tracked range. Other selection kinds use ProseMirror's
 * built-in bookmark implementation to preserve their native semantics.
 */
export function createSelectionTrackingBookmark(selection: Selection): SelectionBookmark {
  if (selection instanceof TextSelection && !selection.empty) {
    return new InclusiveTextSelectionBookmark(selection.anchor, selection.head);
  }

  return selection.getBookmark();
}

/**
 * An opaque, session-local handle representing a captured editor selection.
 *
 * The handle stores a `SelectionBookmark` that is automatically mapped through
 * every transaction in the owning editor's plugin state. When you're ready
 * to act on it, call `editor.resolveSelectionHandle(handle)` or
 * `presentationEditor.resolveSelectionHandle(handle)` to get a fresh
 * `ResolveRangeOutput` / `SelectionCommandContext`.
 *
 * Handles are the correct abstraction for deferred UI command flows (AI,
 * confirmation dialogs, async toolbar chains) where a delay exists between
 * selection capture and mutation.
 *
 * For immediate mutations (toolbar click → instant command), use the snapshot
 * convenience methods (`getCurrentSelectionRange` / `getEffectiveSelectionRange`)
 * which capture and resolve in one call.
 *
 * **Important**: the handle is bound to the specific editor instance that
 * captured it. In layout mode, switching header/footer sessions does not
 * invalidate existing handles — they continue to resolve against their
 * owning editor. The `surface` label is stored for context construction only.
 */
export type SelectionHandle = {
  /** Opaque identifier for this handle. */
  readonly id: number;
  /** Which editing surface the selection was captured on. */
  readonly surface: 'body' | 'header' | 'footer';
  /** Whether the original captured selection was non-empty. */
  readonly wasNonEmpty: boolean;
  /**
   * The editor instance that owns this handle's bookmark.
   * Opaque to callers — used internally by resolve/release.
   * @internal
   */
  readonly _owner: SelectionHandleOwner;
};

/** Internal entry stored in the plugin state. Not exported. */
type HandleEntry = {
  id: number;
  bookmark: SelectionBookmark;
  wasNonEmpty: boolean;
};

type HandlePluginState = {
  entries: Map<number, HandleEntry>;
};

type HandlePluginMeta = { action: 'capture'; entry: HandleEntry } | { action: 'release'; id: number };

let nextHandleId = 1;

export const SelectionHandlePluginKey = new PluginKey<HandlePluginState>('selectionHandle');

/**
 * Creates the tracked selection handle plugin.
 *
 * On every transaction, all stored bookmarks are mapped through the transform
 * so handle positions stay current. This is the same mechanism ProseMirror's
 * history uses to track selections across edits.
 */
export function createSelectionHandlePlugin(): Plugin<HandlePluginState> {
  return new Plugin<HandlePluginState>({
    key: SelectionHandlePluginKey,
    state: {
      init(): HandlePluginState {
        return { entries: new Map() };
      },
      apply(tr: Transaction, prev: HandlePluginState): HandlePluginState {
        const meta = tr.getMeta(SelectionHandlePluginKey) as HandlePluginMeta | undefined;

        // Start from the previous entries — we may need to map them.
        let entries = prev.entries;

        // Map all bookmarks through document changes
        if (tr.docChanged && entries.size > 0) {
          const next = new Map<number, HandleEntry>();
          for (const [id, entry] of entries) {
            next.set(id, { ...entry, bookmark: entry.bookmark.map(tr.mapping) });
          }
          entries = next;
        }

        // Apply meta actions
        if (meta?.action === 'capture') {
          if (entries === prev.entries) entries = new Map(entries);
          entries.set(meta.entry.id, meta.entry);
        } else if (meta?.action === 'release') {
          if (entries.has(meta.id)) {
            if (entries === prev.entries) entries = new Map(entries);
            entries.delete(meta.id);
          }
        }

        return entries === prev.entries ? prev : { entries };
      },
    },
  });
}

/**
 * Captures a PM selection as a tracked handle, stored in the owner's
 * plugin state.
 *
 * The returned handle is permanently bound to `owner` — resolving and
 * releasing always go through that specific editor instance, even if the
 * active header/footer session changes.
 */
export function captureSelectionHandle(
  owner: SelectionHandleOwner,
  selection: Selection,
  surface: 'body' | 'header' | 'footer',
): SelectionHandle {
  const id = nextHandleId++;
  const bookmark = createSelectionTrackingBookmark(selection);
  const wasNonEmpty = !selection.empty;

  const entry: HandleEntry = { id, bookmark, wasNonEmpty };
  const tr = owner.state.tr.setMeta(SelectionHandlePluginKey, { action: 'capture', entry } satisfies HandlePluginMeta);
  owner.dispatch(tr);

  return { id, surface, wasNonEmpty, _owner: owner };
}

/**
 * Resolves a tracked handle back into a live PM selection by reading from
 * the owning editor's plugin state.
 *
 * Returns `null` when:
 * - the handle has been released
 * - the plugin is not registered
 * - a previously non-empty selection collapsed to empty (content was deleted)
 */
export function resolveHandleToSelection(handle: SelectionHandle): Selection | null {
  const { state } = handle._owner;
  const pluginState = SelectionHandlePluginKey.getState(state);
  if (!pluginState) return null;

  const entry = pluginState.entries.get(handle.id);
  if (!entry) return null;

  const resolved = entry.bookmark.resolve(state.doc);

  // If the original selection was non-empty but has collapsed (the content
  // was deleted), return null rather than silently acting at a caret.
  if (entry.wasNonEmpty && resolved.empty) return null;

  return resolved;
}

/**
 * Releases a tracked handle, removing it from the owning editor's plugin state.
 *
 * Always release handles when done to avoid unbounded accumulation.
 */
export function releaseSelectionHandle(handle: SelectionHandle): void {
  const { state, dispatch } = handle._owner;
  const tr = state.tr.setMeta(SelectionHandlePluginKey, {
    action: 'release',
    id: handle.id,
  } satisfies HandlePluginMeta);
  dispatch(tr);
}

/** Resets the handle ID counter. Only for tests. */
export function _resetHandleIdCounter(): void {
  nextHandleId = 1;
}
