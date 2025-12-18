/**
 * Computes a Myers diff operation list for arbitrary sequences.
 * @param {Array|String} oldSeq
 * @param {Array|String} newSeq
 * @param {(a: any, b: any) => boolean} isEqual
 * @returns {Array<'equal'|'insert'|'delete'>}
 */
export function myersDiff(oldSeq, newSeq, isEqual) {
  const oldLen = oldSeq.length;
  const newLen = newSeq.length;

  if (oldLen === 0 && newLen === 0) {
    return [];
  }

  // Myers diff bookkeeping: +2 padding keeps diagonal lookups in bounds.
  const max = oldLen + newLen;
  const size = 2 * max + 3;
  const offset = max + 1;
  const v = new Array(size).fill(-1);
  v[offset + 1] = 0;

  const trace = [];
  let foundPath = false;

  for (let d = 0; d <= max && !foundPath; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      const index = offset + k;
      let x;

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
 * @param {Array<number[]>} trace - Snapshot of diagonal furthest-reaching points per edit distance.
 * @param {number} oldLen - Length of the original string.
 * @param {number} newLen - Length of the target string.
 * @param {number} offset - Offset applied to diagonal indexes to keep array lookups positive.
 * @returns {Array<'equal'|'delete'|'insert'>} Concrete step-by-step operations.
 */
function backtrackMyers(trace, oldLen, newLen, offset) {
  const operations = [];
  let x = oldLen;
  let y = newLen;

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d - 1];
    const k = x - y;
    const index = offset + k;

    let prevK;
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
