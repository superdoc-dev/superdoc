import { Fragment, Slice } from 'prosemirror-model';
import { ReplaceStep } from 'prosemirror-transform';

import { replayInlineDiff } from './replay-inline.ts';
import { ReplayResult } from './replay-types.ts';

/**
 * Replays a paragraph diff into a transaction.
 *
 * @param params Input bundle for replaying a paragraph diff.
 * @param params.tr Transaction to append steps to.
 * @param params.diff Paragraph diff payload to replay.
 * @param params.schema Schema used to rebuild nodes.
 * @returns Result summary for the applied paragraph diff.
 */
export function replayParagraphDiff({
  tr,
  diff,
  schema,
}: {
  tr: import('prosemirror-state').Transaction;
  diff: import('../algorithm/paragraph-diffing.ts').ParagraphDiff;
  schema: import('prosemirror-model').Schema;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  /**
   * Records a skipped diff with a warning message.
   *
   * @param message Warning to record for a skipped diff.
   */
  const skipWithWarning = (message: string) => {
    result.skipped += 1;
    result.warnings.push(message);
  };

  const { pos } = diff;
  if (pos < 0 || pos > tr.doc.content.size) {
    skipWithWarning(`Position ${pos} outside of document.`);
    return result;
  }

  if (diff.action === 'added') {
    if (!diff.nodeJSON) {
      skipWithWarning('Missing nodeJSON for added paragraph diff.');
      return result;
    }
    try {
      const node = schema.nodeFromJSON(diff.nodeJSON);
      const slice = new Slice(Fragment.from(node), 0, 0);
      const step = new ReplaceStep(pos, pos, slice);
      const stepResult = tr.maybeStep(step);
      if (stepResult.failed) {
        skipWithWarning(`Failed to insert paragraph at pos ${pos}.`);
        return result;
      }
      result.applied += 1;
      return result;
    } catch (error) {
      skipWithWarning(`Invalid nodeJSON for added paragraph at pos ${pos}.`);
      return result;
    }
  }

  if (diff.action === 'deleted') {
    const node = tr.doc.nodeAt(pos);
    if (!node) {
      skipWithWarning(`No paragraph found at pos ${pos} for deletion.`);
      return result;
    }
    if (node.type.name !== 'paragraph') {
      skipWithWarning(`Node type mismatch at pos ${pos} for paragraph deletion.`);
      return result;
    }
    const step = new ReplaceStep(pos, pos + node.nodeSize, Slice.empty);
    const stepResult = tr.maybeStep(step);
    if (stepResult.failed) {
      skipWithWarning(`Failed to delete paragraph at pos ${pos}.`);
      return result;
    }
    result.applied += 1;
    return result;
  }

  if (diff.action === 'modified') {
    const node = tr.doc.nodeAt(pos);
    if (!node) {
      skipWithWarning(`No paragraph found at pos ${pos} for modification.`);
      return result;
    }
    if (node.type.name !== 'paragraph') {
      skipWithWarning(`Node type mismatch at pos ${pos} for paragraph modification.`);
      return result;
    }

    if (diff.attrsDiff) {
      if (!diff.newNodeJSON?.attrs) {
        skipWithWarning(`Missing newNodeJSON attrs at pos ${pos} for paragraph modification.`);
        return result;
      }
      try {
        tr.setNodeMarkup(pos, undefined, diff.newNodeJSON.attrs, node.marks);
        result.applied += 1;
      } catch (error) {
        skipWithWarning(`Failed to update paragraph attrs at pos ${pos}.`);
        return result;
      }
    }

    const paragraphEndPos = pos + 1 + node.content.size;
    const contentDiffs = [...(diff.contentDiff ?? [])].sort((a, b) => {
      const aPos = a.startPos ?? paragraphEndPos;
      const bPos = b.startPos ?? paragraphEndPos;
      if (aPos === bPos) return 0;
      return aPos - bPos;
    });
    for (let idx = contentDiffs.length - 1; idx >= 0; idx -= 1) {
      const inlineDiff = contentDiffs[idx];
      const inlineResult = replayInlineDiff({
        tr,
        diff: inlineDiff,
        schema,
        paragraphEndPos,
      });
      result.applied += inlineResult.applied;
      result.skipped += inlineResult.skipped;
      result.warnings.push(...inlineResult.warnings);
    }

    return result;
  }

  skipWithWarning(`Unsupported paragraph diff action at pos ${pos}.`);
  return result;
}
