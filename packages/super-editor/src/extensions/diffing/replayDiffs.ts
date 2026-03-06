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

import { replayDocDiffs } from './replay/replay-doc';
import { replayComments } from './replay/replay-comments';
import { replayStyles } from './replay/replay-styles';
import { replayNumbering } from './replay/replay-numbering';

type ReplayDiffsParams = {
  tr: import('prosemirror-state').Transaction;
  diff: import('./computeDiff').DiffResult;
  schema: import('prosemirror-model').Schema;
  comments?: import('./algorithm/comment-diffing').CommentInput[];
  editor?: {
    emit?: (event: string, payload: unknown) => void;
    options?: {
      documentId?: string | null;
    };
    converter?: {
      translatedLinkedStyles?: {
        docDefaults?: Record<string, unknown>;
        latentStyles?: Record<string, unknown>;
        styles?: Record<string, Record<string, unknown>>;
      } | null;
      translatedNumbering?: {
        abstracts?: Record<string, unknown>;
        definitions?: Record<string, unknown>;
      } | null;
      numbering?: {
        abstracts?: Record<string, unknown>;
        definitions?: Record<string, unknown>;
      } | null;
      convertedXml?: Record<string, unknown>;
      documentModified?: boolean;
      promoteToGuid?: () => string;
    } | null;
  };
};

/**
 * Replays a diff result over the current editor state.
 *
 * @param params Input bundle for replaying diffs.
 * @param params.tr Transaction to append steps to.
 * @param params.diff Diff result to replay.
 * @param params.schema Schema used to rebuild nodes.
 * @param params.comments Mutable comment store to replay comment diffs into.
 * @param params.editor Editor instance used to emit comment update events.
 * @returns Summary and transaction containing the replayed steps.
 */
export function replayDiffs({ tr, diff, schema, comments = [], editor }: ReplayDiffsParams): ReplayDiffsResult {
  const docReplay = replayDocDiffs({ tr, docDiffs: diff.docDiffs, schema });
  const commentsReplay = replayComments({ comments, commentDiffs: diff.commentDiffs, editor });
  const stylesReplay = replayStyles({ stylesDiff: diff.stylesDiff, editor });
  const numberingReplay = replayNumbering({ numberingDiff: diff.numberingDiff, editor });

  return {
    tr,
    appliedDiffs: docReplay.applied + commentsReplay.applied + stylesReplay.applied + numberingReplay.applied,
    skippedDiffs: docReplay.skipped + commentsReplay.skipped + stylesReplay.skipped + numberingReplay.skipped,
    warnings: [
      ...docReplay.warnings,
      ...commentsReplay.warnings,
      ...stylesReplay.warnings,
      ...numberingReplay.warnings,
    ],
  };
}
