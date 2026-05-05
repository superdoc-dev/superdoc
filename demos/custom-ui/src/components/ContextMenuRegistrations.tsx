import { useEffect } from 'react';
import type { ViewportEntityHit } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';
import type { DecidedChangesState } from './useDecidedChanges';

interface Props {
  /**
   * Shared accept/reject dispatcher. The Activity sidebar uses the
   * same store; routing context-menu decisions through it keeps the
   * Resolved audit row in sync regardless of which surface the user
   * clicked.
   */
  decided: DecidedChangesState;
}

/**
 * Registers the demo's context-menu contributions. A real consumer
 * keeps these registrations alive for the session; this component
 * demonstrates the `register({ contextMenu: { group, when } })`
 * surface and `when({ entities })` predicates that scope items to
 * specific click targets.
 */
export function ContextMenuRegistrations({ decided }: Props) {
  const ui = useSuperDocUI();

  useEffect(() => {
    if (!ui) return;
    const trackedChangeId = (entities: ViewportEntityHit[] | undefined) =>
      entities?.find((e) => e.type === 'trackedChange')?.id;
    const commentId = (entities: ViewportEntityHit[] | undefined) =>
      entities?.find((e) => e.type === 'comment')?.id;

    const accept = ui.commands.register<{ entities?: ViewportEntityHit[] }>({
      id: 'demo.acceptSuggestion',
      execute: ({ payload }) => {
        const id = trackedChangeId(payload?.entities);
        if (!id) return false;
        // Route through the shared store so the Resolved audit row
        // shows up — calling `ui.trackChanges.accept(id)` directly
        // would skip the snapshot pass that the sidebar's Resolved
        // section reads from.
        decided.decideChange(id, 'accepted');
        return true;
      },
      contextMenu: {
        label: 'Accept suggestion',
        group: 'review',
        order: 0,
        when: ({ entities }) => entities.some((e) => e.type === 'trackedChange'),
      },
    });
    const reject = ui.commands.register<{ entities?: ViewportEntityHit[] }>({
      id: 'demo.rejectSuggestion',
      execute: ({ payload }) => {
        const id = trackedChangeId(payload?.entities);
        if (!id) return false;
        decided.decideChange(id, 'rejected');
        return true;
      },
      contextMenu: {
        label: 'Reject suggestion',
        group: 'review',
        order: 1,
        when: ({ entities }) => entities.some((e) => e.type === 'trackedChange'),
      },
    });
    const resolve = ui.commands.register<{ entities?: ViewportEntityHit[] }>({
      id: 'demo.resolveComment',
      execute: ({ payload }) => {
        const id = commentId(payload?.entities);
        if (!id) return false;
        ui.comments.resolve(id);
        return true;
      },
      contextMenu: {
        label: 'Resolve comment',
        group: 'comment',
        when: ({ entities }) => entities.some((e) => e.type === 'comment'),
      },
    });

    return () => {
      accept.unregister();
      reject.unregister();
      resolve.unregister();
    };
  }, [ui]);

  return null;
}
