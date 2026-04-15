/**
 * Word-level diff for granular text replacements.
 *
 * Produces multiple fine-grained change operations instead of one large
 * replacement, so that tracked changes show individual word edits.
 */

import { myersDiff } from '../../extensions/diffing/algorithm/myers-diff.js';

// ---------------------------------------------------------------------------
// Word tokenizer
// ---------------------------------------------------------------------------

interface WordToken {
  text: string;
  offset: number;
}

function tokenizeWords(text: string): WordToken[] {
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
  | { type: 'replace'; oldFrom: number; oldTo: number; newText: string }
  | { type: 'delete'; oldFrom: number; oldTo: number }
  | { type: 'insert'; insertAt: number; newText: string };

/**
 * Computes word-level diff and returns only the non-equal (change) operations.
 * Character offsets are relative to the input strings.
 */
export function getWordChanges(oldText: string, newText: string): WordDiffOp[] {
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

  // Build indexed steps
  const steps: Array<{ type: 'equal' | 'insert' | 'delete'; oldIdx: number; newIdx: number }> = [];
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

  // Group consecutive operations, pairing adjacent delete+insert as replace
  const result: WordDiffOp[] = [];
  let i = 0;

  while (i < steps.length) {
    const step = steps[i];

    if (step.type === 'equal') {
      i++;
      continue;
    }

    let deleteStart = -1;
    let deleteEnd = -1;
    let insertText = '';

    while (i < steps.length && (steps[i].type === 'delete' || steps[i].type === 'insert')) {
      const s = steps[i];
      if (s.type === 'delete') {
        const token = oldTokens[s.oldIdx];
        if (deleteStart === -1) deleteStart = token.offset;
        deleteEnd = token.offset + token.text.length;
      } else {
        insertText += newTokens[s.newIdx].text;
      }
      i++;
    }

    if (deleteStart !== -1 && insertText.length > 0) {
      result.push({ type: 'replace', oldFrom: deleteStart, oldTo: deleteEnd, newText: insertText });
    } else if (deleteStart !== -1) {
      result.push({ type: 'delete', oldFrom: deleteStart, oldTo: deleteEnd });
    } else if (insertText.length > 0) {
      const prevStep = i > 0 ? steps[i - 1] : null;
      let insertAt = 0;
      if (prevStep && prevStep.type === 'equal') {
        const prevToken = oldTokens[prevStep.oldIdx];
        insertAt = prevToken.offset + prevToken.text.length;
      } else if (result.length > 0) {
        const lastOp = result[result.length - 1];
        insertAt = 'oldTo' in lastOp ? lastOp.oldTo : 'insertAt' in lastOp ? lastOp.insertAt : 0;
      }
      result.push({ type: 'insert', insertAt, newText: insertText });
    }
  }

  return result;
}
