import { useEffect } from 'react';
import type { ViewportEntityHit } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';

/**
 * Registers the demo's context-menu contributions. A real consumer
 * keeps these registrations alive for the session; this component
 * demonstrates the `register({ contextMenu: { group, when } })`
 * surface and `when({ entities })` predicates that scope items to
 * specific click targets.
 */
export function ContextMenuRegistrations() {
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
        ui.trackChanges.accept(id);
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
        ui.trackChanges.reject(id);
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
