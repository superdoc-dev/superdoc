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

import { replayDocDiffs } from './replay/replay-doc.ts';

/**
 * Replays a diff result over the current editor state.
 *
 * @param params Input bundle for replaying diffs.
 * @param params.tr Transaction to append steps to.
 * @param params.diff Diff result to replay.
 * @param params.schema Schema used to rebuild nodes.
 * @returns Summary and transaction containing the replayed steps.
 */
export function replayDiffs({
  tr,
  diff,
  schema,
}: {
  tr: import('prosemirror-state').Transaction;
  diff: import('./computeDiff.ts').DiffResult;
  schema: import('prosemirror-model').Schema;
}): ReplayDiffsResult {
  const docReplay = replayDocDiffs({ tr, docDiffs: diff.docDiffs, schema });

  return {
    tr,
    appliedDiffs: docReplay.applied,
    skippedDiffs: docReplay.skipped,
    warnings: docReplay.warnings,
  };
}
