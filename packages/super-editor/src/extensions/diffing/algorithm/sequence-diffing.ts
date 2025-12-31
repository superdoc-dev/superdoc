import { myersDiff, type MyersOperation } from './myers-diff.ts';

/**
 * Comparator used to determine whether two sequence values are equal.
 */
type Comparator<T> = (a: T, b: T) => boolean;

/**
 * Discrete operation emitted by the Myers diff before higher-level mapping.
 */
type OperationStep =
  | { type: 'equal'; oldIdx: number; newIdx: number }
  | { type: 'delete'; oldIdx: number; newIdx: number }
  | { type: 'insert'; oldIdx: number; newIdx: number };

/**
 * Hooks and comparators used to translate raw Myers operations into domain-specific diffs.
 */
export interface SequenceDiffOptions<T, Added, Deleted, Modified> {
  /** Comparator to determine whether two items are equivalent. */
  comparator?: Comparator<T>;
  /** Builder invoked for insertions in the new sequence. */
  buildAdded: (item: T, oldIdx: number, previousOldItem: T | undefined, newIdx: number) => Added | null | undefined;
  /** Builder invoked for deletions in the old sequence. */
  buildDeleted: (item: T, oldIdx: number, newIdx: number) => Deleted | null | undefined;
  /** Builder invoked for modifications between old and new items. */
  buildModified: (oldItem: T, newItem: T, oldIdx: number, newIdx: number) => Modified | null | undefined;
  /** Predicate to emit modifications even when items compare equal. */
  shouldProcessEqualAsModification?: (oldItem: T, newItem: T, oldIdx: number, newIdx: number) => boolean;
  /** Predicate to treat delete+insert pairs as a modification. */
  canTreatAsModification?: (deletedItem: T, insertedItem: T, oldIdx: number, newIdx: number) => boolean;
  /** Optional reordering hook for Myers operations before mapping. */
  reorderOperations?: (operations: MyersOperation[]) => MyersOperation[];
}

/**
 * Generic sequence diff helper built on top of Myers algorithm.
 * Allows callers to provide custom comparators and payload builders that determine how
 * additions, deletions, and modifications should be reported.
 *
 * @param oldSeq Original sequence to diff from.
 * @param newSeq Target sequence to diff against.
 * @param options Hook bundle that controls how additions/deletions/modifications are emitted.
 * @returns Sequence of mapped diff payloads produced by the caller-provided builders.
 */
export function diffSequences<T, Added, Deleted, Modified>(
  oldSeq: T[],
  newSeq: T[],
  options: SequenceDiffOptions<T, Added, Deleted, Modified>,
): Array<Added | Deleted | Modified> {
  if (!options) {
    throw new Error('diffSequences requires an options object.');
  }

  const comparator: Comparator<T> = options.comparator ?? ((a: T, b: T) => a === b);
  const reorder = options.reorderOperations ?? ((ops: MyersOperation[]) => ops);
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

  const diffs: Array<Added | Deleted | Modified> = [];
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
      if (diff != null) {
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
        if (diff != null) {
          diffs.push(diff);
        }
        i += 1;
      } else {
        const diff = options.buildDeleted(oldSeq[step.oldIdx], step.oldIdx, step.newIdx);
        if (diff != null) {
          diffs.push(diff);
        }
      }
      continue;
    }

    if (step.type === 'insert') {
      const diff = options.buildAdded(newSeq[step.newIdx], step.oldIdx, oldSeq[step.oldIdx - 1], step.newIdx);
      if (diff != null) {
        diffs.push(diff);
      }
    }
  }

  return diffs;
}

/**
 * Translates the raw Myers operations into indexed steps so higher-level logic can reason about positions.
 *
 * @param operations Myers diff operations produced for the input sequences.
 * @returns Indexed steps that reference the original `oldSeq` and `newSeq` positions.
 */
function buildOperationSteps(operations: MyersOperation[]): OperationStep[] {
  let oldIdx = 0;
  let newIdx = 0;
  const steps: OperationStep[] = [];

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
 *
 * @param operations Raw Myers operations.
 * @returns Normalized operation sequence with deletes and inserts paired.
 */
export function reorderDiffOperations(operations: MyersOperation[]): MyersOperation[] {
  const normalized: MyersOperation[] = [];

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
