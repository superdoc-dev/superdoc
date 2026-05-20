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
 * Registers the demo's context-menu contributions.
 *
 * Each registration declares its own visibility via `when({ entities,
 * insideSelection, ... })` and reads the click subject from
 * `context.entities` / `context.selection` inside `execute`. Both
 * predicate and handler see the same {@link ViewportContext} bundle
 * the menu was opened on, so the demo doesn't thread payloads through
 * the menu UI to keep them in sync.
 */
export function ContextMenuRegistrations({ decided, onComposeComment }: Props) {
  const ui = useSuperDocUI();

  useEffect(() => {
    if (!ui) return;
    const trackedChangeId = (entities: ReadonlyArray<ViewportEntityHit> | undefined) =>
      entities?.find((e) => e.type === 'trackedChange')?.id;
    const commentId = (entities: ReadonlyArray<ViewportEntityHit> | undefined) =>
      entities?.find((e) => e.type === 'comment')?.id;

    const accept = ui.commands.register({
      id: 'demo.acceptSuggestion',
      execute: ({ context }) => {
        const id = trackedChangeId(context?.entities);
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
    const reject = ui.commands.register({
      id: 'demo.rejectSuggestion',
      execute: ({ context }) => {
        const id = trackedChangeId(context?.entities);
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
    const resolve = ui.commands.register({
      id: 'demo.resolveComment',
      execute: ({ context }) => {
        const id = commentId(context?.entities);
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

    // Selection-scoped items. The `insideSelection` predicate field
    // gates these to clicks INSIDE the painted selection rects, so a
    // stale selection from elsewhere in the doc doesn't leak into a
    // right-click far away. The controller computes that flag once
    // per menu open and hands the same value to every predicate.
    //
    // Format items (Bold / Italic / Link) deliberately live in the
    // floating bubble menu rather than here. The right-click target
    // model is "the thing under the pointer," and a format toggle
    // doesn't belong to a target — it belongs to the active
    // selection. The bubble menu owns that.
    const copy = ui.commands.register({
      id: 'demo.copy',
      execute: ({ context }) => {
        const text = context?.selection.quotedText ?? ui.selection.getSnapshot().quotedText;
        if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        return true;
      },
      contextMenu: {
        label: 'Copy',
        group: 'clipboard',
        when: ({ selection, insideSelection }) => !selection.empty && insideSelection === true,
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
        when: ({ selection, insideSelection }) =>
          !selection.empty && selection.target !== null && insideSelection === true,
      },
    });

    // Point-anchored insert. Reads `context.position.target` (a
    // collapsed SelectionTarget at the click point) and inserts
    // directly at the click. Without the bundle, this would fire
    // `editor.doc.insert` against `state.selection.selectionTarget`
    // and silently land at the user's prior selection somewhere else
    // in the doc, making the menu label a lie.
    //
    // Gated on three conditions so it only shows on plain caret-only
    // text:
    //   - `position !== null`: a caret resolved (excludes clicks
    //     outside the painted host).
    //   - `insideSelection !== true`: the click isn't inside the
    //     active selection (Copy / Comment on selection own that
    //     case).
    //   - `entities.length === 0`: the click isn't on a tracked
    //     change or comment (Accept / Reject / Resolve own those).
    //     Without this gate, right-clicking a tracked change would
    //     surface both Accept/Reject AND "Insert clause here", and
    //     picking the latter would insert into the entity's range
    //     instead of acting on the entity.
    const SAMPLE_CLAUSE =
      'Each party agrees to maintain the confidentiality of all information disclosed by the other party in connection with this agreement.';
    const insertHere = ui.commands.register({
      id: 'demo.insertClauseHere',
      execute: ({ context, editor }) => {
        const target = context?.position?.target;
        if (!target || !editor?.doc?.insert) return false;
        const receipt = editor.doc.insert({ value: SAMPLE_CLAUSE, type: 'text', target });
        return receipt?.success === true;
      },
      contextMenu: {
        label: 'Insert clause here',
        group: 'review',
        order: 10,
        when: ({ entities, position, insideSelection }) =>
          entities.length === 0 && position !== null && insideSelection !== true,
      },
    });

    return () => {
      accept.unregister();
      reject.unregister();
      resolve.unregister();
      copy.unregister();
      comment.unregister();
      insertHere.unregister();
    };
  }, [ui, onComposeComment, decided]);

  return null;
}
