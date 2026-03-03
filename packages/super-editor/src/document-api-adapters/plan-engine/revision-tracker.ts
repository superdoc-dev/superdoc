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
 */
export function trackRevisions(editor: Editor): void {
  if (subscribedEditors.has(editor)) return;
  subscribedEditors.add(editor);

  editor.on('transaction', ({ transaction }: { transaction: { docChanged: boolean } }) => {
    if (transaction.docChanged) {
      incrementRevision(editor);
    }
  });
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
