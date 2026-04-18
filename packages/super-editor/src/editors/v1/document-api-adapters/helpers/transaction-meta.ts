import type { Transaction } from 'prosemirror-state';

/**
 * Applies metadata required for direct (non-tracked) document-api mutations.
 * This prevents active track-changes sessions from transforming direct writes.
 *
 * @param tr - The ProseMirror transaction to annotate
 * @returns The same transaction, with `inputType` and `skipTrackChanges` meta set
 */
export function applyDirectMutationMeta(tr: Transaction): Transaction {
  tr.setMeta('inputType', 'programmatic');
  tr.setMeta('skipTrackChanges', true);
  return tr;
}

/**
 * Applies metadata required for tracked mutations implemented via raw transactions.
 * Tracked write operations that call tracked commands directly do not use this helper.
 *
 * @param tr - The ProseMirror transaction to annotate
 * @returns The same transaction, with `inputType` and `forceTrackChanges` meta set
 */
export function applyTrackedMutationMeta(tr: Transaction): Transaction {
  tr.setMeta('inputType', 'programmatic');
  tr.setMeta('forceTrackChanges', true);
  return tr;
}
