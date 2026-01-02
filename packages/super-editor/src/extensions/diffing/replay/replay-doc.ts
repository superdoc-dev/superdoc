import { ReplayResult } from './replay-types.ts';
import { replayNonParagraphDiff } from './replay-non-paragraph.ts';
import { replayParagraphDiff } from './replay-paragraph.ts';

/**
 * Orchestrates replay for document-level diffs.
 *
 * @param params Input bundle for replaying document diffs.
 * @param params.tr Transaction to append steps to.
 * @param params.docDiffs Document diffs to replay (in original order).
 * @param params.schema Schema used to rebuild nodes.
 * @returns Result summary for the applied diffs.
 */
export function replayDocDiffs({
  tr,
  docDiffs,
  schema,
}: {
  tr: import('prosemirror-state').Transaction;
  docDiffs: import('../algorithm/generic-diffing.ts').NodeDiff[];
  schema: import('prosemirror-model').Schema;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  for (let idx = docDiffs.length - 1; idx >= 0; idx -= 1) {
    const diff = docDiffs[idx];
    const handlerResult =
      diff.nodeType === 'paragraph'
        ? replayParagraphDiff({ tr, diff, schema })
        : replayNonParagraphDiff({ tr, diff, schema });
    result.applied += handlerResult.applied;
    result.skipped += handlerResult.skipped;
    result.warnings.push(...handlerResult.warnings);
  }

  return result;
}
