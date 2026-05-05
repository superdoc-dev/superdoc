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
  /**
   * Open the comment composer with the current selection. Wired to
   * the same App-level open/close state the toolbar's Comment button
   * uses, so a context-menu trigger lands on the same composer.
   */
  onComposeComment(): void;
}

/**
 * Registers the demo's context-menu contributions. A real consumer
 * keeps these registrations alive for the session; this component
 * demonstrates the `register({ contextMenu: { group, when } })`
 * surface and `when({ entities })` predicates that scope items to
 * specific click targets.
 */
export function ContextMenuRegistrations({ decided, onComposeComment }: Props) {
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

    // Always-on fallback items so right-click on plain selected text
    // produces a useful menu instead of feeling "dead". The
    // `custom-selection` PM extension preventDefaults every right-click
    // inside the editor (regardless of `disableContextMenu`), so the
    // browser's native menu is suppressed there. Without these
    // entries the menu would be empty whenever the click isn't over a
    // tracked change or comment.
    const bold = ui.commands.register({
      id: 'demo.bold',
      execute: () => {
        ui.commands.get('bold')?.execute();
        return true;
      },
      contextMenu: {
        label: 'Bold',
        group: 'format',
        order: 0,
        when: ({ selection }) => !selection.empty,
      },
    });
    const italic = ui.commands.register({
      id: 'demo.italic',
      execute: () => {
        ui.commands.get('italic')?.execute();
        return true;
      },
      contextMenu: {
        label: 'Italic',
        group: 'format',
        order: 1,
        when: ({ selection }) => !selection.empty,
      },
    });
    const copy = ui.commands.register({
      id: 'demo.copy',
      execute: () => {
        const text = ui.selection.getSnapshot().quotedText;
        if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        return true;
      },
      contextMenu: {
        label: 'Copy',
        group: 'clipboard',
        when: ({ selection }) => !selection.empty,
      },
    });
    const comment = ui.commands.register({
      id: 'demo.commentSelection',
      execute: () => {
        onComposeComment();
        return true;
      },
      contextMenu: {
        label: 'Comment on selection',
        group: 'comment',
        // Need both a non-empty selection AND a positional target —
        // the latter so `createFromCapture` has somewhere to anchor.
        when: ({ selection }) => !selection.empty && selection.target !== null,
      },
    });

    return () => {
      accept.unregister();
      reject.unregister();
      resolve.unregister();
      bold.unregister();
      italic.unregister();
      copy.unregister();
      comment.unregister();
    };
  }, [ui, onComposeComment, decided]);

  return null;
}
