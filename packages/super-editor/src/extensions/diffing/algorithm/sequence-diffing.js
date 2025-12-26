import { myersDiff } from './myers-diff.js';

/**
 * @typedef {Object} SequenceDiffOptions
 * @property {(a: any, b: any) => boolean} [comparator] equality test passed to Myers diff
 * @property {(item: any, index: number) => any} buildAdded maps newly inserted entries
 * @property {(item: any, index: number) => any} buildDeleted maps removed entries
 * @property {(oldItem: any, newItem: any, oldIndex: number, newIndex: number) => any|null} buildModified maps paired entries. If it returns null/undefined, it means no modification should be recorded.
 * @property {(oldItem: any, newItem: any, oldIndex: number, newIndex: number) => boolean} [shouldProcessEqualAsModification] decides if equal-aligned entries should emit a modification
 * @property {(oldItem: any, newItem: any, oldIndex: number, newIndex: number) => boolean} [canTreatAsModification] determines if delete/insert pairs are modifications
 * @property {(operations: Array<'equal'|'delete'|'insert'>) => Array<'equal'|'delete'|'insert'>} [reorderOperations] optional hook to normalize raw Myers operations
 */

/**
 * Generic sequence diff helper built on top of Myers algorithm.
 * Allows callers to provide custom comparators and payload builders that determine how
 * additions, deletions, and modifications should be reported.
 * @param {Array<any>} oldSeq
 * @param {Array<any>} newSeq
 * @param {SequenceDiffOptions} options
 * @returns {Array<any>}
 */
export function diffSequences(oldSeq, newSeq, options) {
  if (!options) {
    throw new Error('diffSequences requires an options object.');
  }

  const comparator = options.comparator ?? ((a, b) => a === b);
  const reorder = options.reorderOperations ?? ((ops) => ops);
  const canTreatAsModification = options.canTreatAsModification;
  const shouldProcessEqualAsModification = options.shouldProcessEqualAsModification;

  if (typeof options.buildAdded !== 'function') {
    throw new Error('diffSequences requires a buildAdded option.');
  }
  if (typeof options.buildDeleted !== 'function') {
    throw new Error('diffSequences requires a buildDeleted option.');
  }
  if (typeof options.buildModified !== 'function') {
    throw new Error('diffSequences requires a buildModified option.');
  }

  const operations = reorder(myersDiff(oldSeq, newSeq, comparator));
  const steps = buildOperationSteps(operations);

  const diffs = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];

    if (step.type === 'equal') {
      if (!shouldProcessEqualAsModification) {
        continue;
      }
      const oldItem = oldSeq[step.oldIdx];
      const newItem = newSeq[step.newIdx];
      if (!shouldProcessEqualAsModification(oldItem, newItem, step.oldIdx, step.newIdx)) {
        continue;
      }
      const diff = options.buildModified(oldItem, newItem, step.oldIdx, step.newIdx);
      if (diff) {
        diffs.push(diff);
      }
      continue;
    }

    if (step.type === 'delete') {
      const nextStep = steps[i + 1];
      if (
        nextStep?.type === 'insert' &&
        typeof canTreatAsModification === 'function' &&
        canTreatAsModification(oldSeq[step.oldIdx], newSeq[nextStep.newIdx], step.oldIdx, nextStep.newIdx)
      ) {
        const diff = options.buildModified(oldSeq[step.oldIdx], newSeq[nextStep.newIdx], step.oldIdx, nextStep.newIdx);
        if (diff) {
          diffs.push(diff);
        }
        i += 1;
      } else {
        diffs.push(options.buildDeleted(oldSeq[step.oldIdx], step.oldIdx, step.newIdx));
      }
      continue;
    }

    if (step.type === 'insert') {
      diffs.push(options.buildAdded(newSeq[step.newIdx], step.oldIdx, step.newIdx));
    }
  }

  return diffs;
}

/**
 * Translates the raw Myers operations into indexed steps so higher-level logic can reason about positions.
 * @param {Array<'equal'|'delete'|'insert'>} operations
 * @returns {Array<object>}
 */
function buildOperationSteps(operations) {
  let oldIdx = 0;
  let newIdx = 0;
  const steps = [];

  for (const op of operations) {
    if (op === 'equal') {
      steps.push({ type: 'equal', oldIdx, newIdx });
      oldIdx += 1;
      newIdx += 1;
    } else if (op === 'delete') {
      steps.push({ type: 'delete', oldIdx, newIdx });
      oldIdx += 1;
    } else if (op === 'insert') {
      steps.push({ type: 'insert', oldIdx, newIdx });
      newIdx += 1;
    }
  }

  return steps;
}

/**
 * Normalizes interleaved delete/insert operations so consumers can treat replacements as paired steps.
 * @param {Array<'equal'|'delete'|'insert'>} operations
 * @returns {Array<'equal'|'delete'|'insert'>}
 */
export function reorderDiffOperations(operations) {
  const normalized = [];

  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    if (op !== 'delete') {
      normalized.push(op);
      continue;
    }

    let deleteCount = 0;
    while (i < operations.length && operations[i] === 'delete') {
      deleteCount += 1;
      i += 1;
    }

    let insertCount = 0;
    let insertCursor = i;
    while (insertCursor < operations.length && operations[insertCursor] === 'insert') {
      insertCount += 1;
      insertCursor += 1;
    }

    const pairCount = Math.min(deleteCount, insertCount);
    for (let k = 0; k < pairCount; k += 1) {
      normalized.push('delete', 'insert');
    }
    for (let k = pairCount; k < deleteCount; k += 1) {
      normalized.push('delete');
    }
    for (let k = pairCount; k < insertCount; k += 1) {
      normalized.push('insert');
    }

    i = insertCursor - 1;
  }

  return normalized;
}
