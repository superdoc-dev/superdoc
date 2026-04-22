/**
 * Word-level diff for granular tracked changes.
 *
 * Uses Myers diff on word tokens to produce multiple fine-grained change
 * operations instead of one large replacement. This lets track-changes show
 * individual word edits rather than a single paragraph-level deletion+insertion.
 *
 * Myers diff algorithm adapted from:
 *   packages/super-editor/src/editors/v1/extensions/diffing/algorithm/myers-diff.ts
 */

// ---------------------------------------------------------------------------
// Myers diff (copied from super-editor — no cross-package dependency)
// ---------------------------------------------------------------------------

type MyersOperation = 'equal' | 'insert' | 'delete';
type Sequence<T> = ArrayLike<T>;
type Comparator<T> = (a: T, b: T) => boolean;

function myersDiff<T>(oldSeq: Sequence<T>, newSeq: Sequence<T>, isEqual: Comparator<T>): MyersOperation[] {
  const oldLen = oldSeq.length;
  const newLen = newSeq.length;

  if (oldLen === 0 && newLen === 0) {
    return [];
  }

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

// ---------------------------------------------------------------------------
// Word tokenizer
// ---------------------------------------------------------------------------

export interface WordToken {
  text: string;
  offset: number;
}

/**
 * Splits text into alternating word and whitespace tokens.
 * Each token carries its character offset within the source string.
 */
export function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const regex = /(\s+|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({ text: match[0], offset: match.index });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Word-level diff
// ---------------------------------------------------------------------------

export type WordDiffOp =
  | { type: 'equal'; oldFrom: number; oldTo: number }
  | { type: 'replace'; oldFrom: number; oldTo: number; newText: string }
  | { type: 'delete'; oldFrom: number; oldTo: number }
  | { type: 'insert'; insertAt: number; newText: string };

/**
 * Computes word-level diff operations between two text strings.
 *
 * Returns an array of operations with character offsets into the old text.
 * Only non-equal operations need to be applied; equal ops are included for
 * completeness but can be filtered out.
 */
export function computeWordDiff(oldText: string, newText: string): WordDiffOp[] {
  if (oldText === newText) {
    return [];
  }

  const oldTokens = tokenizeWords(oldText);
  const newTokens = tokenizeWords(newText);

  if (oldTokens.length === 0 && newTokens.length === 0) {
    return [];
  }

  if (oldTokens.length === 0) {
    return [{ type: 'insert', insertAt: 0, newText }];
  }

  if (newTokens.length === 0) {
    return [{ type: 'delete', oldFrom: 0, oldTo: oldText.length }];
  }

  const ops = myersDiff(oldTokens, newTokens, (a, b) => a.text === b.text);

  // Walk the operations and build indexed steps
  const steps: Array<{ type: MyersOperation; oldIdx: number; newIdx: number }> = [];
  let oldIdx = 0;
  let newIdx = 0;
  for (const op of ops) {
    steps.push({ type: op, oldIdx, newIdx });
    if (op === 'equal') {
      oldIdx++;
      newIdx++;
    } else if (op === 'delete') {
      oldIdx++;
    } else {
      newIdx++;
    }
  }

  // Group consecutive operations and pair adjacent delete+insert as replace
  return groupWordOps(steps, oldTokens, newTokens);
}

/**
 * Groups raw Myers operations into high-level word diff ops.
 * Adjacent delete+insert sequences become a single replace op.
 */
function groupWordOps(
  steps: Array<{ type: MyersOperation; oldIdx: number; newIdx: number }>,
  oldTokens: WordToken[],
  newTokens: WordToken[],
): WordDiffOp[] {
  const result: WordDiffOp[] = [];
  let i = 0;

  while (i < steps.length) {
    const step = steps[i];

    if (step.type === 'equal') {
      const token = oldTokens[step.oldIdx];
      result.push({
        type: 'equal',
        oldFrom: token.offset,
        oldTo: token.offset + token.text.length,
      });
      i++;
      continue;
    }

    // Collect contiguous delete+insert block
    let deleteStart = -1;
    let deleteEnd = -1;
    let insertText = '';

    while (i < steps.length && (steps[i].type === 'delete' || steps[i].type === 'insert')) {
      const s = steps[i];
      if (s.type === 'delete') {
        const token = oldTokens[s.oldIdx];
        if (deleteStart === -1) {
          deleteStart = token.offset;
        }
        deleteEnd = token.offset + token.text.length;
      } else {
        const token = newTokens[s.newIdx];
        insertText += token.text;
      }
      i++;
    }

    if (deleteStart !== -1 && insertText.length > 0) {
      result.push({ type: 'replace', oldFrom: deleteStart, oldTo: deleteEnd, newText: insertText });
    } else if (deleteStart !== -1) {
      result.push({ type: 'delete', oldFrom: deleteStart, oldTo: deleteEnd });
    } else if (insertText.length > 0) {
      // Find insertion point: either at the end of previous old token or start of text
      const prevStep = i > 0 ? steps[i - 1] : null;
      let insertAt: number;
      if (prevStep && prevStep.type === 'equal') {
        const prevToken = oldTokens[prevStep.oldIdx];
        insertAt = prevToken.offset + prevToken.text.length;
      } else if (result.length > 0) {
        const lastOp = result[result.length - 1];
        insertAt = 'oldTo' in lastOp ? lastOp.oldTo : 'insertAt' in lastOp ? lastOp.insertAt : 0;
      } else {
        insertAt = 0;
      }
      result.push({ type: 'insert', insertAt, newText: insertText });
    }
  }

  return result;
}

/**
 * Returns only the non-equal operations from a word diff.
 */
export function getWordChanges(oldText: string, newText: string): WordDiffOp[] {
  return computeWordDiff(oldText, newText).filter((op) => op.type !== 'equal');
}
