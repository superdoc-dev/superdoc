/**
 * Replays a non-paragraph node diff into a transaction.
 */
import { Fragment, Slice } from 'prosemirror-model';
import { ReplaceStep } from 'prosemirror-transform';

import { ReplayResult } from './replay-types.ts';

/**
 * Replays a non-paragraph node diff into a transaction.
 *
 * @param params Input bundle for replaying a diff.
 * @param params.tr Transaction to append steps to.
 * @param params.diff Diff payload to replay.
 * @param params.schema Schema used to rebuild nodes.
 * @returns Result summary for the applied diff.
 */
export function replayNonParagraphDiff({
  tr,
  diff,
  schema,
}: {
  tr: import('prosemirror-state').Transaction;
  diff: import('../algorithm/generic-diffing.ts').NodeDiff;
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

  if (diff.nodeType === 'paragraph') {
    skipWithWarning('Non-paragraph handler received a paragraph diff.');
    return result;
  }

  const { pos } = diff;

  if (diff.action === 'added') {
    if (!diff.nodeJSON) {
      skipWithWarning('Missing nodeJSON for added non-paragraph diff.');
      return result;
    }
    try {
      const node = schema.nodeFromJSON(diff.nodeJSON);
      const slice = new Slice(Fragment.from(node), 0, 0);
      const step = new ReplaceStep(pos, pos, slice);
      const stepResult = tr.maybeStep(step);
      if (stepResult.failed) {
        skipWithWarning(`Failed to insert node at pos ${pos}.`);
        return result;
      }
      result.applied += 1;
      return result;
    } catch (error) {
      skipWithWarning(`Invalid nodeJSON for added diff at pos ${pos}.`);
      return result;
    }
  }

  if (diff.action === 'deleted') {
    const node = tr.doc.nodeAt(pos);
    if (!node) {
      skipWithWarning(`No node found at pos ${pos} for deletion.`);
      return result;
    }
    if (node.type.name !== diff.nodeType) {
      skipWithWarning(`Node type mismatch at pos ${pos} for deletion.`);
      return result;
    }
    const step = new ReplaceStep(pos, pos + node.nodeSize, Slice.empty);
    const stepResult = tr.maybeStep(step);
    if (stepResult.failed) {
      skipWithWarning(`Failed to delete node at pos ${pos}.`);
      return result;
    }
    result.applied += 1;
    return result;
  }

  if (diff.action === 'modified') {
    if (!diff.attrsDiff) {
      result.skipped += 1;
      return result;
    }
    const node = tr.doc.nodeAt(pos);
    if (!node) {
      skipWithWarning(`No node found at pos ${pos} for modification.`);
      return result;
    }
    if (node.type.name !== diff.nodeType) {
      skipWithWarning(`Node type mismatch at pos ${pos} for modification.`);
      return result;
    }
    if (!diff.newNodeJSON?.attrs) {
      skipWithWarning(`Missing newNodeJSON.attrs at pos ${pos} for modification.`);
      return result;
    }
    try {
      tr.setNodeMarkup(pos, undefined, diff.newNodeJSON.attrs, node.marks);
      result.applied += 1;
      return result;
    } catch (error) {
      skipWithWarning(`Failed to update node attrs at pos ${pos}.`);
      return result;
    }
  }

  skipWithWarning(`Unsupported diff action for non-paragraph node at pos ${pos}.`);
  return result;
}
