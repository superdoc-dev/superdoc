/**
 * Options that control how diff replay is performed.
 */
export type ReplayDiffsOptions = {
  user: { name: string; email: string; image?: string };
  applyTrackedChanges: boolean;
};

/**
 * Result summary from replaying diffs into a transaction.
 */
export type ReplayDiffsResult = {
  tr: import('prosemirror-state').Transaction;
  appliedDiffs: number;
  skippedDiffs: number;
  warnings: string[];
};

/**
 * Replays a diff result over the current editor state.
 */
export function replayDiffs(): ReplayDiffsResult {
  throw new Error('replayDiffs is not implemented yet.');
}
