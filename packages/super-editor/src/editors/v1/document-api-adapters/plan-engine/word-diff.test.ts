import { describe, expect, it } from 'vitest';
import { getWordChanges, type WordDiffOp } from './word-diff.ts';

function applyOps(oldText: string, ops: WordDiffOp[]): string {
  // Apply word ops to oldText to produce the expected new text. Ops anchor on
  // oldText offsets and are applied left-to-right with cumulative offset.
  let result = '';
  let cursor = 0;
  for (const op of ops) {
    if (op.type === 'insert') {
      // Copy unchanged text up to the insertion point, then insert.
      result += oldText.slice(cursor, op.insertAt);
      cursor = op.insertAt;
      result += op.newText;
    } else if (op.type === 'delete') {
      result += oldText.slice(cursor, op.oldFrom);
      cursor = op.oldTo;
    } else {
      result += oldText.slice(cursor, op.oldFrom);
      cursor = op.oldTo;
      result += op.newText;
    }
  }
  result += oldText.slice(cursor);
  return result;
}

describe('getWordChanges', () => {
  it('returns empty for identical text', () => {
    expect(getWordChanges('hello world', 'hello world')).toEqual([]);
  });

  it('returns single insert when old is empty', () => {
    expect(getWordChanges('', 'hello')).toEqual([{ type: 'insert', insertAt: 0, newText: 'hello' }]);
  });

  it('returns single delete when new is empty', () => {
    expect(getWordChanges('hello', '')).toEqual([{ type: 'delete', oldFrom: 0, oldTo: 5 }]);
  });

  it('produces correct REPLACE for a single word change', () => {
    const ops = getWordChanges('hello world', 'goodbye world');
    expect(applyOps('hello world', ops)).toBe('goodbye world');
  });

  it('produces correct ops when one word is replaced and the trailing one is kept', () => {
    const ops = getWordChanges('foo bar', 'baz bar');
    expect(applyOps('foo bar', ops)).toBe('baz bar');
  });

  // SD-3044: regression — insert-only groups between EQUAL tokens must anchor
  // to the preceding EQUAL token's end, not to the previous result op's end.
  it('SD-3044: insert between EQUAL tokens uses correct anchor', () => {
    // Pattern: old has an EQUAL token that lands between two insert groups.
    const ops = getWordChanges('a b c', 'x a y b c');
    expect(applyOps('a b c', ops)).toBe('x a y b c');
  });

  it('SD-3044: regression with the exact suffix-trim shape from the Lighthouse fixture', () => {
    // After prefix/suffix trim, the parties-investor block reduces to these
    // strings. The trailing `]` of the second `[insert]` is in the suffix, so
    // `[insert` (without the `]`) becomes a token that matches between old and
    // new. Myers then produces three groups separated by EQUAL tokens — the
    // bug was that the two pure-INSERT groups both anchored to char 8.
    const oldTrimmed = '[insert] of [insert';
    const newTrimmed = 'John James Smith of [insert address';
    const ops = getWordChanges(oldTrimmed, newTrimmed);
    expect(applyOps(oldTrimmed, ops)).toBe(newTrimmed);

    // Specifically the bug produced two inserts at insertAt=8; with the fix,
    // the second insert anchors past the preserved ` of [insert` (offset 19).
    const inserts = ops.filter((o): o is Extract<WordDiffOp, { type: 'insert' }> => o.type === 'insert');
    expect(inserts).toHaveLength(2);
    const insertAts = inserts.map((o) => o.insertAt).sort((a, b) => a - b);
    expect(insertAts[0]).toBe(9); // after the equal space (old[1])
    expect(insertAts[1]).toBe(19); // after the equal `[insert` (old[4])
  });

  it('SD-3044: prefix-only equal anchors first insert past the prefix', () => {
    const ops = getWordChanges('foo', 'foo bar');
    expect(applyOps('foo', ops)).toBe('foo bar');
    // After EQUAL `foo` (length 3), insert anchor must be 3 not 0.
    const inserts = ops.filter((o): o is Extract<WordDiffOp, { type: 'insert' }> => o.type === 'insert');
    if (inserts.length > 0) {
      expect(inserts[0].insertAt).toBe(3);
    }
  });
});
