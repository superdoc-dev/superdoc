import { Fragment, Slice } from 'prosemirror-model';
import { ReplaceStep, AddMarkStep, RemoveMarkStep } from 'prosemirror-transform';

import { deepEquals } from '../algorithm/attributes-diffing';
import { applyAttrsDiff } from './replay-attrs';
import { marksFromDiff } from './marks-from-diff';
import { ReplayResult } from './replay-types';

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
  diff: import('../algorithm/inline-diffing').InlineDiffResult;
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
        oldMarks: getMarksAtPosition(tr.doc, from),
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
      (diff.marksDiff?.modified ?? []).forEach((markEntry) => {
        const markType = schema.marks[markEntry.name];
        if (!markType) {
          skipWithWarning(`Unknown mark type ${markEntry.name} for modification.`);
          return;
        }
        const oldMark = markType.create(markEntry.oldAttrs || {});
        const step = new RemoveMarkStep(from, to!, oldMark);
        const stepResult = tr.maybeStep(step);
        if (stepResult.failed) {
          skipWithWarning(`Failed to remove old mark ${oldMark.type.name} at ${from}-${to}.`);
        }
      });

      if (diff.runAttrsDiff) {
        // Metadata attributes are independent of mark replay and can always be applied.
        const metadataDiff = filterAttributesDiffByPath(diff.runAttrsDiff, (path) => !path.startsWith('runProperties'));
        if (metadataDiff) {
          const metadataReplayResult = applyRunAttrsDiffInRange(tr, from, to!, metadataDiff);
          if (metadataReplayResult.warning) {
            skipWithWarning(metadataReplayResult.warning);
          }
        }

        // runProperties can overlap with mark-derived formatting. Apply these paths
        // only when marks are unchanged to avoid double-applying style deltas.
        if (!diff.marksDiff) {
          const runPropertiesDiff = filterAttributesDiffByPath(diff.runAttrsDiff, (path) =>
            path.startsWith('runProperties'),
          );
          if (runPropertiesDiff) {
            const runPropertiesReplayResult = applyRunAttrsDiffInRange(tr, from, to!, runPropertiesDiff);
            if (runPropertiesReplayResult.warning) {
              skipWithWarning(runPropertiesReplayResult.warning);
            }
          }
        }
      }

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
 * Applies a run-attributes diff to every run intersecting an inline text range.
 *
 * @param tr Transaction to update.
 * @param from Inclusive range start.
 * @param to Exclusive range end.
 * @param diff Run-attributes diff to apply.
 * @returns Result describing whether any warnings occurred.
 */
const applyRunAttrsDiffInRange = (
  tr: import('prosemirror-state').Transaction,
  from: number,
  to: number,
  diff: import('../algorithm/attributes-diffing').AttributesDiff,
): { warning?: string } => {
  const runEntries: Array<{ pos: number; node: import('prosemirror-model').Node }> = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'run') {
      runEntries.push({ pos, node });
      return false;
    }
    return undefined;
  });

  if (runEntries.length === 0) {
    return { warning: `No run nodes found in ${from}-${to} for run-attr update.` };
  }

  const failures: string[] = [];
  runEntries.forEach(({ pos, node }) => {
    const updatedAttrs = applyAttrsDiff({ attrs: node.attrs, diff });
    if (deepEquals(updatedAttrs, node.attrs)) {
      return;
    }

    try {
      tr.setNodeMarkup(pos, undefined, updatedAttrs, node.marks);
    } catch (error) {
      failures.push(`Failed to update run attrs at ${pos}.`);
    }
  });

  if (failures.length > 0) {
    return { warning: failures.join(' ') };
  }
  return {};
};

/**
 * Produces a subset of an attributes diff filtered by dotted-path predicate.
 *
 * @param diff Source attributes diff.
 * @param predicate Path predicate deciding which entries are kept.
 * @returns Filtered diff or null when no entries match.
 */
const filterAttributesDiffByPath = (
  diff: import('../algorithm/attributes-diffing').AttributesDiff,
  predicate: (path: string) => boolean,
): import('../algorithm/attributes-diffing').AttributesDiff | null => {
  const filtered: import('../algorithm/attributes-diffing').AttributesDiff = {
    added: {},
    deleted: {},
    modified: {},
  };

  Object.entries(diff.added || {}).forEach(([path, value]) => {
    if (predicate(path)) {
      filtered.added[path] = value;
    }
  });

  Object.entries(diff.deleted || {}).forEach(([path, value]) => {
    if (predicate(path)) {
      filtered.deleted[path] = value;
    }
  });

  Object.entries(diff.modified || {}).forEach(([path, value]) => {
    if (predicate(path)) {
      filtered.modified[path] = value;
    }
  });

  const hasChanges =
    Object.keys(filtered.added).length > 0 ||
    Object.keys(filtered.deleted).length > 0 ||
    Object.keys(filtered.modified).length > 0;

  return hasChanges ? filtered : null;
};

/**
 * Extracts mark JSON entries from the inline node at a given position.
 *
 * @param doc Document to inspect.
 * @param pos Position used to resolve an inline node.
 * @returns Mark entries from the inline node at the position.
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
