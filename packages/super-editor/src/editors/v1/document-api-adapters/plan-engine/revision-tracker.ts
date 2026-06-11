/**
 * Monotonic revision counter for optimistic concurrency control.
 *
 * Tracks document revisions as decimal string counters. Increments once
 * per successfully dispatched transaction that changes document state.
 *
 * Revision is advanced by listening to the editor's `transaction` event,
 * so it covers ALL document-changing transactions — plan-engine mutations,
 * direct editor edits, collaboration updates, and plugin-generated changes.
 */

import type { Editor } from '../../core/Editor.js';
import { PlanError } from './errors.js';

const revisionMap = new WeakMap<Editor, number>();
const subscribedEditors = new WeakSet<Editor>();

export function getRevision(editor: Editor): string {
  const rev = revisionMap.get(editor) ?? 0;
  return String(rev);
}

export function incrementRevision(editor: Editor): string {
  const current = revisionMap.get(editor) ?? 0;
  const next = current + 1;
  revisionMap.set(editor, next);
  return String(next);
}

/**
 * Restore revision to a previously captured value.
 *
 * Used for rollback when a compound operation (e.g. structured insert)
 * partially commits parts mutations but the overall operation fails.
 */
export function restoreRevision(editor: Editor, revision: string): void {
  revisionMap.set(editor, Number(revision));
}

export function initRevision(editor: Editor): void {
  if (!revisionMap.has(editor)) {
    revisionMap.set(editor, 0);
  }
}

/**
 * Subscribe to the editor's transaction events so that revision advances
 * on every document-changing transaction, regardless of source.
 *
 * Safe to call multiple times — only subscribes once per editor instance.
 *
 * Transactions tagged with `superdoc/block-identity-repair` are exempt:
 * the repair pass rewrites internal block-identity attrs without changing
 * any caller-visible content, so bumping the optimistic-concurrency counter
 * would invalidate a caller's `expectedRevision` for a non-content change.
 * The repair is also non-undoable (`addToHistory: false`) and its emitted
 * AttrSteps carry no `from`/`to` range, so collaborators see it as
 * remediation rather than an edit.
 */
export function trackRevisions(editor: Editor): void {
  if (subscribedEditors.has(editor)) return;
  subscribedEditors.add(editor);

  editor.on(
    'transaction',
    ({ transaction }: { transaction: { docChanged: boolean; getMeta: (key: string) => unknown } }) => {
      // Meta short-circuit comes BEFORE the docChanged gate so that any future
      // "metadata-only" repair transaction (i.e. non-docChanged) still gets the
      // same special treatment. Today the only repair transactions in flight
      // are doc-changing (AttrSteps land), so both orderings are observably
      // equivalent — keeping the meta check first pins the defensive invariant.
      if (transaction.getMeta?.('superdoc/block-identity-repair')) return;
      if (!transaction.docChanged) return;
      incrementRevision(editor);
    },
  );
}

export function checkRevision(editor: Editor, expectedRevision: string | undefined): void {
  if (expectedRevision === undefined) return;
  const current = getRevision(editor);
  if (expectedRevision !== current) {
    throw new PlanError(
      'REVISION_MISMATCH',
      `REVISION_MISMATCH — expected revision "${expectedRevision}" but document is at "${current}". Re-run query.match to obtain a fresh ref.`,
      undefined,
      {
        expectedRevision,
        currentRevision: current,
        refStability: 'ephemeral',
        remediation: 'Re-run query.match() to obtain a fresh ref valid for the current revision.',
      },
    );
  }
}
