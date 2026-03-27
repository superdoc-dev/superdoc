/**
 * Lazy self-healing cache staleness tracker.
 *
 * When an `afterCommit` hook fails, the affected partId is marked stale.
 * Consumers check staleness before reading derived caches and attempt
 * a rebuild if the cache is stale. On successful rebuild (or on the next
 * successful afterCommit), the stale flag is cleared.
 *
 * This avoids permanently degraded state from transient afterCommit failures.
 */

import type { Editor } from '../Editor.js';

const stalePartIds = new WeakMap<Editor, Set<string>>();

/** Mark a part's derived cache as stale after an afterCommit failure. */
export function markPartCacheStale(editor: Editor, partId: string): void {
  let set = stalePartIds.get(editor);
  if (!set) {
    set = new Set();
    stalePartIds.set(editor, set);
  }
  set.add(partId);
}

/** Check whether a part's derived cache is stale. */
export function isPartCacheStale(editor: Editor, partId: string): boolean {
  return stalePartIds.get(editor)?.has(partId) ?? false;
}

/** Clear the stale flag after a successful cache rebuild or afterCommit. */
export function clearPartCacheStale(editor: Editor, partId: string): void {
  stalePartIds.get(editor)?.delete(partId);
}
