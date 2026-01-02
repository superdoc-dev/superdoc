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

/**
 * Replays a diff result over the current editor state.
 *
 * @returns Placeholder replay result until implemented.
 */
export function replayDiffs(): ReplayDiffsResult {
  throw new Error('replayDiffs is not implemented yet.');
}
