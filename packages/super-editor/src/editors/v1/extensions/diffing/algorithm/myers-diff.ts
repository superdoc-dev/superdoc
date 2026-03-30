/**
 * A primitive Myers diff operation describing equality, insertion, or deletion.
 */
export type MyersOperation = 'equal' | 'insert' | 'delete';

/**
 * Minimal read-only sequence abstraction required by the diff algorithm.
 */
type Sequence<T> = ArrayLike<T>;
/**
 * Equality predicate applied while traversing sequences.
 */
type Comparator<T> = (a: T, b: T) => boolean;

/**
 * Computes a Myers diff operation list for arbitrary sequences.
 *
 * @param oldSeq Original sequence to compare.
 * @param newSeq Updated sequence to compare.
 * @param isEqual Equality predicate used to determine matching elements.
 * @returns Ordered list of diff operations describing how to transform {@link oldSeq} into {@link newSeq}.
 */
export function myersDiff<T>(oldSeq: Sequence<T>, newSeq: Sequence<T>, isEqual: Comparator<T>): MyersOperation[] {
  const oldLen = oldSeq.length;
  const newLen = newSeq.length;

  if (oldLen === 0 && newLen === 0) {
    return [];
  }

  // Myers diff bookkeeping: +2 padding keeps diagonal lookups in bounds.
  const max = oldLen + newLen;
  const size = 2 * max + 3;
  const offset = max + 1;
  const v = new Array<number>(size).fill(-1);
  v[offset + 1] = 0;

  const trace: number[][] = [];
  let foundPath = false;

  for (let d = 0; d <= max && !foundPath; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      const index = offset + k;
      let x: number;

      if (k === -d || (k !== d && v[index - 1] < v[index + 1])) {
        x = v[index + 1];
      } else {
        x = v[index - 1] + 1;
      }

      let y = x - k;
      while (x < oldLen && y < newLen && isEqual(oldSeq[x], newSeq[y])) {
        x += 1;
        y += 1;
      }

      v[index] = x;

      if (x >= oldLen && y >= newLen) {
        foundPath = true;
        break;
      }
    }
    trace.push(v.slice());
  }

  return backtrackMyers(trace, oldLen, newLen, offset);
}

/**
 * Reconstructs the shortest edit script by walking the previously recorded V vectors.
 *
 * @param trace Snapshot of diagonal furthest-reaching points per edit distance.
 * @param oldLen Length of the original sequence.
 * @param newLen Length of the target sequence.
 * @param offset Offset applied to diagonal indexes to keep array lookups positive.
 * @returns Concrete step-by-step operations transforming {@link oldLen} chars into {@link newLen} chars.
 */
function backtrackMyers(trace: number[][], oldLen: number, newLen: number, offset: number): MyersOperation[] {
  const operations: MyersOperation[] = [];
  let x = oldLen;
  let y = newLen;

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d - 1];
    const k = x - y;
    const index = offset + k;

    let prevK: number;
    if (k === -d || (k !== d && v[index - 1] < v[index + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevIndex = offset + prevK;
    const prevX = v[prevIndex];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      operations.push('equal');
    }

    if (x === prevX) {
      y -= 1;
      operations.push('insert');
    } else {
      x -= 1;
      operations.push('delete');
    }
  }

  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    operations.push('equal');
  }

  while (x > 0) {
    x -= 1;
    operations.push('delete');
  }

  while (y > 0) {
    y -= 1;
    operations.push('insert');
  }

  return operations.reverse();
}
