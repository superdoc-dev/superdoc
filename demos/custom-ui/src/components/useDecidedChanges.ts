import { useCallback, useEffect, useState } from 'react';
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

  const decideChange = useCallback(
    (id: string, decision: 'accepted' | 'rejected') => {
      if (!ui) return;
      // Capture a snapshot from the live feed BEFORE we mutate, since
      // accept/reject removes the tracked-change row entirely.
      const liveItem = trackChanges.items.find((it) => it.id === id);
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
    [ui, trackChanges.items],
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

  return { decidedChanges, decideChange };
}
