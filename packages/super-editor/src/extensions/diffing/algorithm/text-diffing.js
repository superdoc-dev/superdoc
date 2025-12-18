import { myersDiff } from './myers-diff.js';

/**
 * Computes text-level additions and deletions between two strings using Myers diff algorithm, mapping back to document positions.
 * @param {string} oldText - Source text.
 * @param {string} newText - Target text.
 * @param {(index: number) => number|null} oldPositionResolver - Maps string indexes to the original document.
 * @param {(index: number) => number|null} [newPositionResolver=oldPositionResolver] - Maps string indexes to the updated document.
 * @returns {Array<object>} List of addition/deletion ranges with document positions and text content.
 */
export function getTextDiff(oldText, newText, oldPositionResolver, newPositionResolver = oldPositionResolver) {
  const oldLen = oldText.length;
  const newLen = newText.length;

  if (oldLen === 0 && newLen === 0) {
    return [];
  }

  const operations = myersDiff(oldText, newText, (a, b) => a === b);
  return buildDiffFromOperations(operations, oldText, newText, oldPositionResolver, newPositionResolver);
}

/**
 * Groups edit operations into contiguous additions/deletions and maps them to document positions.
 *
 * @param {Array<'equal'|'delete'|'insert'>} operations - Raw operation list produced by the backtracked Myers path.
 * @param {string} oldText - Source text.
 * @param {string} newText - Target text.
 * @param {(index: number) => number|null} oldPositionResolver - Maps string indexes to the previous document.
 * @param {(index: number) => number|null} newPositionResolver - Maps string indexes to the updated document.
 * @returns {Array<object>} Final diff payload matching the existing API surface.
 */
function buildDiffFromOperations(operations, oldText, newText, oldPositionResolver, newPositionResolver) {
  const diffs = [];
  let change = null;
  let oldIdx = 0;
  let newIdx = 0;
  const resolveOld = oldPositionResolver ?? (() => null);
  const resolveNew = newPositionResolver ?? resolveOld;

  /** Flushes the current change block into the diffs list. */
  const flushChange = () => {
    if (!change || change.text.length === 0) {
      change = null;
      return;
    }

    if (change.type === 'delete') {
      const startIdx = resolveOld(change.startOldIdx);
      const endIdx = resolveOld(change.endOldIdx);
      diffs.push({
        type: 'deletion',
        startIdx,
        endIdx,
        text: change.text,
      });
    } else if (change.type === 'insert') {
      const startIdx = resolveNew(change.startNewIdx);
      const endIdx = resolveNew(change.endNewIdx);
      diffs.push({
        type: 'addition',
        startIdx,
        endIdx,
        text: change.text,
      });
    }

    change = null;
  };

  for (const op of operations) {
    if (op === 'equal') {
      flushChange();
      oldIdx += 1;
      newIdx += 1;
      continue;
    }

    if (!change || change.type !== op) {
      flushChange();
      if (op === 'delete') {
        change = { type: 'delete', startOldIdx: oldIdx, endOldIdx: oldIdx, text: '' };
      } else if (op === 'insert') {
        change = { type: 'insert', startNewIdx: newIdx, endNewIdx: newIdx, text: '' };
      }
    }

    if (op === 'delete') {
      change.text += oldText[oldIdx];
      oldIdx += 1;
      change.endOldIdx = oldIdx;
    } else if (op === 'insert') {
      change.text += newText[newIdx];
      newIdx += 1;
      change.endNewIdx = newIdx;
    }
  }

  flushChange();

  return diffs;
}
