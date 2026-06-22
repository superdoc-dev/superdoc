import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSuperDocTrackChanges, useSuperDocUI } from 'superdoc/ui/react';

export interface DecidedChange {
  id: string;
  decision: 'accepted' | 'rejected';
  decidedAt: number;
  /** Snapshot taken before the doc-api call so we can render it post-accept. */
  snapshot: { type?: string; author?: string; authorEmail?: string; excerpt?: string };
}

export interface DecidedChangesState {
  decidedChanges: Map<string, DecidedChange>;
  decideChange(id: string, decision: 'accepted' | 'rejected'): void;
}

/**
 * Shared decided-changes store for the demo. The Activity sidebar's
 * accept/reject buttons AND the right-click context menu both route
 * through `decideChange` so the Resolved audit row renders regardless
 * of which surface fired the decision. Without this, a context-menu
 * accept would call `ui.trackChanges.accept(id)` directly and the
 * change would vanish (live feed drops it; sidebar never snapshotted
 * it).
 *
 * State is intentionally component-local for the demo — a real product
 * would persist decisions in its own store.
 */
export function useDecidedChanges(): DecidedChangesState {
  const ui = useSuperDocUI();
  const trackChanges = useSuperDocTrackChanges();
  const [decidedChanges, setDecidedChanges] = useState<Map<string, DecidedChange>>(() => new Map());

  // Ref-mirror the live items so `decideChange` can read them without
  // listing them in its `useCallback` deps. Without this, the callback
  // identity changes on every track-change tick, the wrapper object
  // below breaks reference, and any consumer that lists the wrapper in
  // an effect's deps re-runs that effect (and registers/unregisters
  // any contributed commands) on every doc edit.
  const itemsRef = useRef(trackChanges.items);
  itemsRef.current = trackChanges.items;

  const decideChange = useCallback(
    (id: string, decision: 'accepted' | 'rejected') => {
      if (!ui) return;
      // Snapshot from the live feed BEFORE we mutate, since
      // accept/reject removes the tracked-change row entirely.
      const liveItem = itemsRef.current.find((it) => it.id === id);
      const change = (liveItem?.change ?? null) as DecidedChange['snapshot'] | null;
      if (decision === 'accepted') ui.trackChanges.accept(id);
      else ui.trackChanges.reject(id);
      if (change) {
        setDecidedChanges((prev) => {
          const next = new Map(prev);
          next.set(id, { id, decision, decidedAt: Date.now(), snapshot: change });
          return next;
        });
      }
    },
    [ui],
  );

  // Reconcile against the live feed: when a previously-decided id
  // reappears (undo, collaborator restore, etc.), drop it from the
  // local roll-up.
  useEffect(() => {
    setDecidedChanges((prev) => {
      if (prev.size === 0) return prev;
      const liveChangeIds = new Set<string>();
      for (const item of trackChanges.items) liveChangeIds.add(item.id);
      let mutated = false;
      const next = new Map(prev);
      for (const id of prev.keys()) {
        if (liveChangeIds.has(id)) {
          next.delete(id);
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [trackChanges.items]);

  // Memoize the wrapper so consumers passing the result into an
  // effect (e.g. `ContextMenuRegistrations` whose deps include the
  // returned object) only see a fresh reference when the underlying
  // state actually changes, not on every parent render. Combined with
  // the items-ref above, the wrapper now changes only when
  // `decidedChanges` does.
  return useMemo(() => ({ decidedChanges, decideChange }), [decidedChanges, decideChange]);
}
