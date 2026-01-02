/**
 * Options that control how diff replay is performed.
 *
 * @property user Identity used for tracked changes.
 * @property applyTrackedChanges Whether to apply tracked changes logic.
 */
export type ReplayDiffsOptions = {
  user: { name: string; email: string; image?: string };
  applyTrackedChanges: boolean;
};

/**
 * Result summary from replaying diffs into a transaction.
 *
 * @property tr Transaction containing the replayed steps.
 * @property appliedDiffs Count of diffs successfully applied.
 * @property skippedDiffs Count of diffs skipped or failed.
 * @property warnings Non-fatal warnings encountered during replay.
 */
export type ReplayDiffsResult = {
  tr: import('prosemirror-state').Transaction;
  appliedDiffs: number;
  skippedDiffs: number;
  warnings: string[];
};

import { trackedTransaction } from '@extensions/track-changes/trackChangesHelpers/trackedTransaction.js';
import { replayDocDiffs } from './replay/replay-doc.ts';

/**
 * Replays a diff result over the current editor state.
 *
 * @param params Input bundle for replaying diffs.
 * @param params.state Editor state anchored to the old document.
 * @param params.diff Diff result to replay.
 * @param params.schema Schema used to rebuild nodes.
 * @param params.options Replay options controlling tracked changes behavior.
 * @returns Summary and transaction containing the replayed steps.
 */
export function replayDiffs({
  state,
  diff,
  schema,
  options,
}: {
  state: import('prosemirror-state').EditorState;
  diff: import('./computeDiff.ts').DiffResult;
  schema: import('prosemirror-model').Schema;
  options: ReplayDiffsOptions;
}): ReplayDiffsResult {
  const tr = state.tr;
  const docReplay = replayDocDiffs({ tr, docDiffs: diff.docDiffs, schema });
  const finalTr = options.applyTrackedChanges
    ? trackedTransaction({
        tr,
        state,
        user: options.user,
      })
    : tr;

  return {
    tr: finalTr,
    appliedDiffs: docReplay.applied,
    skippedDiffs: docReplay.skipped,
    warnings: docReplay.warnings,
  };
}
