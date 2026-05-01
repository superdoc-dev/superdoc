/**
 * NoteEditorRegistry
 *
 * Keeps footnote and endnote editors alive between presentation-mode story
 * sessions so their local history can still participate in the document-wide
 * undo/redo queue after the user leaves the note.
 *
 * Why a separate registry (not just the StoryRuntimeCache)?
 *   - Lifetime is tied to the UI session's need for reachable history, not
 *     to the adapter-layer runtime cache.
 *   - The runtime cache disposes entries on prefix invalidation without
 *     consulting the coordinator; this registry routes invalidations through
 *     explicit `purge()` + events so the coordinator can drop stale global
 *     entries in lockstep.
 *   - Idle disposal policy lives here (a story runtime cache miss should not
 *     kill an editor the coordinator still references).
 *
 * See `plans/unified-history.md`, Phase 2.
 */

import type { FootnoteStoryLocator, EndnoteStoryLocator } from '@superdoc/document-api';
import type { Editor } from '../../Editor.js';
import { EventEmitter } from '../../EventEmitter.js';

type NoteLocator = FootnoteStoryLocator | EndnoteStoryLocator;

/**
 * Callback that persists the current PM state of a note editor back to the
 * canonical OOXML part. Obtained from `resolveNoteRuntime` at session
 * activation and cached here so coordinator-driven replays can commit
 * without rebuilding the runtime.
 */
export type NoteCommitHook = (hostEditor: Editor, noteEditor: Editor) => void;

/**
 * Event types emitted by NoteEditorRegistry.
 */
type NoteRegistryEvents = {
  editorCreated: [payload: { storyKey: string; editor: Editor; locator: NoteLocator }];
  editorDisposed: [payload: { storyKey: string; reason: 'purge' | 'idle' | 'cap' | 'destroy' }];
};

interface NoteRegistryEntry {
  storyKey: string;
  locator: NoteLocator;
  editor: Editor;
  commit: NoteCommitHook | null;
  lastAccessMs: number;
  pinned: boolean;
  /** Set of factory-owned disposers to run when the editor is disposed. */
  disposers: Set<() => void>;
}

export interface NoteEditorRegistryOptions {
  /**
   * Maximum number of unpinned editors kept in memory. Pinned entries are
   * always preserved and do not count against this cap.
   */
  capacity?: number;
  /**
   * Milliseconds after which an unpinned entry becomes eligible for idle
   * disposal. `0` disables idle disposal.
   */
  idleTtlMs?: number;
  /**
   * Called when entries are auto-disposed so the coordinator can purge its
   * global entries in the same tick.
   */
  onBeforeAutoDispose?: (storyKey: string) => void;
  /**
   * Wall-clock provider (injected for tests).
   */
  now?: () => number;
  /**
   * Schedules an idle sweep. Injected for tests. When omitted the registry
   * uses `setInterval` / `clearInterval`.
   */
  scheduleSweep?: (callback: () => void, intervalMs: number) => () => void;
}

const DEFAULT_CAPACITY = 20;
const DEFAULT_IDLE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SWEEP_INTERVAL_MS = 30 * 1000;

export class NoteEditorRegistry extends EventEmitter<NoteRegistryEvents> {
  readonly #entries = new Map<string, NoteRegistryEntry>();
  readonly #capacity: number;
  readonly #idleTtlMs: number;
  readonly #now: () => number;
  readonly #onBeforeAutoDispose?: (storyKey: string) => void;
  readonly #scheduleSweep: (callback: () => void, intervalMs: number) => () => void;
  #cancelSweep: (() => void) | null = null;

  constructor(options: NoteEditorRegistryOptions = {}) {
    super();
    this.#capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY);
    this.#idleTtlMs = Math.max(0, options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS);
    this.#now = options.now ?? (() => Date.now());
    this.#onBeforeAutoDispose = options.onBeforeAutoDispose;
    this.#scheduleSweep = options.scheduleSweep ?? defaultScheduleSweep;
  }

  /**
   * Get the persistent editor for a story key, or `null` if none is tracked.
   * Accessing an entry refreshes its lastAccess timestamp.
   */
  get(storyKey: string): Editor | null {
    const entry = this.#entries.get(storyKey);
    if (!entry) return null;
    entry.lastAccessMs = this.#now();
    return entry.editor;
  }

  /**
   * Register a newly created note editor. `commit` is the runtime hook that
   * persists the editor's state back to the canonical OOXML part.
   */
  register(input: { storyKey: string; locator: NoteLocator; editor: Editor; commit?: NoteCommitHook | null }): void {
    const existing = this.#entries.get(input.storyKey);
    if (existing) {
      existing.editor = input.editor;
      existing.locator = input.locator;
      existing.commit = input.commit ?? null;
      existing.lastAccessMs = this.#now();
      return;
    }

    const entry: NoteRegistryEntry = {
      storyKey: input.storyKey,
      locator: input.locator,
      editor: input.editor,
      commit: input.commit ?? null,
      lastAccessMs: this.#now(),
      pinned: false,
      disposers: new Set(),
    };
    this.#entries.set(input.storyKey, entry);
    this.emit('editorCreated', { storyKey: input.storyKey, editor: input.editor, locator: input.locator });
    this.#syncSweepSchedule();
    this.#enforceCapacity();
  }

  /**
   * Attach a disposer that must run when the registry disposes the editor.
   * The session factory uses this to tear down hidden host DOM.
   */
  attachDisposer(storyKey: string, disposer: () => void): void {
    const entry = this.#entries.get(storyKey);
    if (!entry) {
      disposer();
      return;
    }
    entry.disposers.add(disposer);
  }

  /** Update the commit hook for an already-registered note editor. */
  setCommitHook(storyKey: string, commit: NoteCommitHook | null): void {
    const entry = this.#entries.get(storyKey);
    if (!entry) return;
    entry.commit = commit;
  }

  /** Return the commit hook captured at registration time, if any. */
  getCommitHook(storyKey: string): NoteCommitHook | null {
    return this.#entries.get(storyKey)?.commit ?? null;
  }

  /** Pin prevents idle/cap disposal for this entry. */
  pin(storyKey: string): void {
    const entry = this.#entries.get(storyKey);
    if (!entry) return;
    entry.pinned = true;
    entry.lastAccessMs = this.#now();
    this.#syncSweepSchedule();
  }

  unpin(storyKey: string): void {
    const entry = this.#entries.get(storyKey);
    if (!entry) return;
    entry.pinned = false;
    this.#syncSweepSchedule();
    this.#enforceCapacity();
  }

  isPinned(storyKey: string): boolean {
    return this.#entries.get(storyKey)?.pinned ?? false;
  }

  /** Refresh the lastAccess timestamp. Called while a session is live. */
  touch(storyKey: string): void {
    const entry = this.#entries.get(storyKey);
    if (!entry) return;
    entry.lastAccessMs = this.#now();
  }

  /** Purge a single entry, disposing the editor and notifying observers. */
  purge(storyKey: string, reason: 'purge' | 'idle' | 'cap' | 'destroy' = 'purge'): void {
    const entry = this.#entries.get(storyKey);
    if (!entry) return;
    this.#entries.delete(storyKey);
    this.#syncSweepSchedule();
    this.#disposeEntry(entry, reason);
  }

  /** The current number of tracked entries (pinned + unpinned). */
  get size(): number {
    return this.#entries.size;
  }

  /** Iterate over the current set of tracked story keys. */
  keys(): string[] {
    return Array.from(this.#entries.keys());
  }

  /**
   * Manually trigger the idle sweep. Called by the internal timer and by
   * tests.
   */
  runIdleSweep(): void {
    if (this.#idleTtlMs <= 0) return;
    const cutoff = this.#now() - this.#idleTtlMs;
    for (const [storyKey, entry] of this.#entries) {
      if (entry.pinned) continue;
      if (entry.lastAccessMs > cutoff) continue;
      this.#entries.delete(storyKey);
      this.#disposeEntry(entry, 'idle');
    }
    this.#syncSweepSchedule();
  }

  /** Dispose all entries and stop the sweep timer. */
  destroy(): void {
    this.#cancelSweep?.();
    this.#cancelSweep = null;
    for (const entry of this.#entries.values()) {
      this.#disposeEntry(entry, 'destroy');
    }
    this.#entries.clear();
    this.removeAllListeners();
  }

  /**
   * Enforce the unpinned capacity cap by disposing the oldest unpinned
   * entries. Runs after each `register()` and can also be driven by
   * external callers after pin/unpin toggles.
   */
  #enforceCapacity(): void {
    const unpinned: NoteRegistryEntry[] = [];
    for (const entry of this.#entries.values()) {
      if (!entry.pinned) unpinned.push(entry);
    }
    if (unpinned.length <= this.#capacity) return;

    unpinned.sort((a, b) => a.lastAccessMs - b.lastAccessMs);
    const excess = unpinned.length - this.#capacity;
    for (let i = 0; i < excess; i += 1) {
      const victim = unpinned[i];
      this.#entries.delete(victim.storyKey);
      this.#disposeEntry(victim, 'cap');
    }
    this.#syncSweepSchedule();
  }

  #syncSweepSchedule(): void {
    if (this.#idleTtlMs <= 0) {
      this.#cancelSweep?.();
      this.#cancelSweep = null;
      return;
    }

    const hasSweepableEntries = Array.from(this.#entries.values()).some((entry) => !entry.pinned);
    if (!hasSweepableEntries) {
      this.#cancelSweep?.();
      this.#cancelSweep = null;
      return;
    }

    if (this.#cancelSweep) {
      return;
    }

    this.#cancelSweep = this.#scheduleSweep(() => this.runIdleSweep(), SWEEP_INTERVAL_MS);
  }

  #disposeEntry(entry: NoteRegistryEntry, reason: 'purge' | 'idle' | 'cap' | 'destroy'): void {
    if (reason !== 'purge' && reason !== 'destroy') {
      this.#onBeforeAutoDispose?.(entry.storyKey);
    }
    entry.disposers.forEach((disposer) => {
      try {
        disposer();
      } catch (error) {
        console.warn('[NoteEditorRegistry] disposer threw:', error);
      }
    });
    try {
      entry.editor.destroy?.();
    } catch (error) {
      console.warn('[NoteEditorRegistry] editor.destroy threw:', error);
    }
    this.emit('editorDisposed', { storyKey: entry.storyKey, reason });
  }
}

const defaultScheduleSweep = (callback: () => void, intervalMs: number): (() => void) => {
  if (typeof setInterval !== 'function') return () => {};
  const handle = setInterval(callback, intervalMs);
  return () => clearInterval(handle);
};
