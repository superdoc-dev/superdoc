import { Fragment, Slice } from 'prosemirror-model';
import { ReplaceStep, AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';

import { applyAttrsDiff } from './replay-attrs.ts';
import { marksFromDiff } from './marks-from-diff.ts';
import { ReplayResult } from './replay-types.ts';

/**
 * Replays a single inline diff into a transaction.
 *
 * @param params Input bundle for replaying an inline diff.
 * @param params.tr Transaction to append steps to.
 * @param params.diff Inline diff payload to replay.
 * @param params.schema Schema used to rebuild nodes and marks.
 * @param params.paragraphEndPos Fallback insertion anchor when startPos is missing.
 * @returns Result summary for the applied inline diff.
 */
export function replayInlineDiff({
  tr,
  diff,
  schema,
  paragraphEndPos,
}: {
  tr: import('prosemirror-state').Transaction;
  diff: import('../algorithm/inline-diffing.ts').InlineDiffResult;
  schema: import('prosemirror-model').Schema;
  paragraphEndPos: number;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  /**
   * Records a skipped inline diff with a warning message.
   *
   * @param message Warning to record for a skipped diff.
   */
  const skipWithWarning = (message: string) => {
    result.skipped += 1;
    result.warnings.push(message);
  };

  const isAddition = diff.action === 'added';
  const isDeletion = diff.action === 'deleted';
  const isModification = diff.action === 'modified';

  let from = diff.startPos ?? null;
  let to = diff.endPos ?? null;

  if (isAddition && from === null) {
    from = paragraphEndPos;
    to = paragraphEndPos;
  }

  if (!isAddition && (from === null || to === null)) {
    skipWithWarning('Missing inline diff anchor positions.');
    return result;
  }

  if (from === null) {
    skipWithWarning('Missing inline diff start position.');
    return result;
  }

  if (to === null) {
    to = from;
  }

  if (diff.kind === 'text') {
    const textForRange = diff.action === 'modified' ? diff.oldText : diff.text;
    const rangeLength = typeof textForRange === 'string' ? textForRange.length : null;
    if (!isAddition && rangeLength !== null && from !== null) {
      to = from + rangeLength;
    } else if (!isAddition && to !== null && from !== null) {
      to = to + 1;
    }

    if (isAddition) {
      if (!diff.text) {
        skipWithWarning('Missing text content for inline addition.');
        return result;
      }
      const marks = marksFromDiff({
        schema,
        action: diff.action,
        marks: diff.marks,
      });
      const textNode = schema.text(diff.text, marks);
      const slice = new Slice(Fragment.from(textNode), 0, 0);
      const step = new ReplaceStep(from, from, slice);
      const stepResult = tr.maybeStep(step);
      if (stepResult.failed) {
        skipWithWarning(`Failed to insert text at ${from}.`);
        return result;
      }
      result.applied += 1;
      return result;
    }

    if (isDeletion) {
      const step = new ReplaceStep(from, to, Slice.empty);
      const stepResult = tr.maybeStep(step);
      if (stepResult.failed) {
        skipWithWarning(`Failed to delete text at ${from}-${to}.`);
        return result;
      }
      result.applied += 1;
      return result;
    }

    if (isModification) {
      if (diff.newText == null) {
        skipWithWarning('Missing newText for inline modification.');
        return result;
      }
      const marks = marksFromDiff({
        schema,
        action: diff.action,
        marks: diff.marks,
        marksDiff: diff.marksDiff,
        oldMarks: [],
      });
      marks.forEach((mark) => {
        const step = new AddMarkStep(from, to!, mark);
        const stepResult = tr.maybeStep(step);
        if (stepResult.failed) {
          skipWithWarning(`Failed to add mark ${mark.type.name} at ${from}-${to}.`);
        }
      });

      (diff.marksDiff?.deleted ?? []).forEach((markEntry) => {
        const markType = schema.marks[markEntry.name];
        if (!markType) {
          skipWithWarning(`Unknown mark type ${markEntry.name} for deletion.`);
          return;
        }
        const mark = markType.create(markEntry.attrs || {});
        const step = new RemoveMarkStep(from, to!, mark);
        const stepResult = tr.maybeStep(step);
        if (stepResult.failed) {
          skipWithWarning(`Failed to remove mark ${mark.type.name} at ${from}-${to}.`);
        }
      });

      result.applied += 1;
      return result;
    }
  }

  if (diff.kind === 'inlineNode') {
    if (isAddition) {
      if (!diff.nodeJSON) {
        skipWithWarning('Missing nodeJSON for inline node addition.');
        return result;
      }
      try {
        const node = schema.nodeFromJSON(diff.nodeJSON);
        const slice = new Slice(Fragment.from(node), 0, 0);
        const step = new ReplaceStep(from, from, slice);
        const stepResult = tr.maybeStep(step);
        if (stepResult.failed) {
          skipWithWarning(`Failed to insert inline node at ${from}.`);
          return result;
        }
        result.applied += 1;
        return result;
      } catch (error) {
        skipWithWarning('Invalid nodeJSON for inline node addition.');
        return result;
      }
    }

    if (isDeletion) {
      const node = tr.doc.nodeAt(from);
      if (!node) {
        skipWithWarning(`No inline node found at ${from} for deletion.`);
        return result;
      }
      to = from + node.nodeSize;
      const step = new ReplaceStep(from, to, Slice.empty);
      const stepResult = tr.maybeStep(step);
      if (stepResult.failed) {
        skipWithWarning(`Failed to delete inline node at ${from}-${to}.`);
        return result;
      }
      result.applied += 1;
      return result;
    }

    if (isModification) {
      if (!diff.newNodeJSON) {
        skipWithWarning('Missing newNodeJSON for inline node modification.');
        return result;
      }
      try {
        const existingNode = tr.doc.nodeAt(from);
        if (!existingNode) {
          skipWithWarning(`No inline node found at ${from} for modification.`);
          return result;
        }
        to = from + existingNode.nodeSize;
        const node = schema.nodeFromJSON(diff.newNodeJSON);
        const slice = new Slice(Fragment.from(node), 0, 0);
        const step = new ReplaceStep(from, to, slice);
        const stepResult = tr.maybeStep(step);
        if (stepResult.failed) {
          skipWithWarning(`Failed to replace inline node at ${from}-${to}.`);
          return result;
        }
        result.applied += 1;
        return result;
      } catch (error) {
        skipWithWarning('Invalid newNodeJSON for inline node modification.');
        return result;
      }
    }
  }

  skipWithWarning('Unsupported inline diff operation.');
  return result;
}

/**
 * Extracts mark JSON entries from the inline node at the given position.
 *
 * @param doc Document to inspect for marks.
 * @param pos Position used to resolve a candidate inline node.
 * @returns Mark JSON entries for the inline node at the position.
 */
const getMarksAtPosition = (
  doc: import('prosemirror-model').Node,
  pos: number,
): Array<{ type: string; attrs?: Record<string, unknown> }> => {
  const resolved = doc.resolve(pos);
  const candidate = resolved.nodeAfter || resolved.nodeBefore;
  if (!candidate || !candidate.isInline) {
    return [];
  }
  return candidate.marks.map((mark) => ({
    type: mark.type.name,
    attrs: mark.attrs ?? {},
  }));
};

/**
 * Applies a run-attributes diff to the nearest run node at a position.
 *
 * @param tr Transaction to update.
 * @param pos Document position to resolve.
 * @param diff Run-attributes diff to apply.
 * @returns Result describing whether the update was applied.
 */
const applyRunAttrsDiff = (
  tr: import('prosemirror-state').Transaction,
  pos: number,
  diff: import('../algorithm/attributes-diffing.ts').AttributesDiff,
): { applied: number; warning?: string } => {
  const resolved = tr.doc.resolve(pos);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== 'run') {
      continue;
    }
    const nodePos = resolved.before(depth);
    const updatedAttrs = applyAttrsDiff({ attrs: node.attrs, diff });
    try {
      tr.setNodeMarkup(nodePos, undefined, updatedAttrs, node.marks);
      return { applied: 1 };
    } catch (error) {
      return { applied: 0, warning: `Failed to update run attrs at ${nodePos}.` };
    }
  }
  return { applied: 0, warning: `No run node found at ${pos} for run-attr update.` };
};
