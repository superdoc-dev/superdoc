import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { charOffsetToDocPos } from './executor.ts';
import { textBetweenWithTabs } from '../helpers/text-with-tabs.js';

const NON_BREAKING_HYPHEN = '‑';

/**
 * Repro for the second SD-2746 review finding: text.rewrite trims
 * `originalText` against `replacementText` using a character-offset diff,
 * then maps the resulting offset back to a PM position via `charOffsetToDocPos`.
 *
 * After the leafText fix surfaces noBreakHyphen as U+2011 in `originalText`
 * (via `textBetweenWithTabs`), the mapper must also count that character —
 * otherwise the offset slips past the atom and any edit lands at the wrong
 * PM position. Tab nodes have the same shape (textBetweenWithTabs emits '\t'
 * even though tab is non-leaf), so this fix covers both.
 */
function makeEditorWithNoBreakHyphen() {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {},
          content: [
            { type: 'run', attrs: {}, content: [{ type: 'text', text: 'a' }] },
            { type: 'run', attrs: {}, content: [{ type: 'noBreakHyphen' }] },
            { type: 'run', attrs: {}, content: [{ type: 'text', text: 'b' }] },
          ],
        },
      ],
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor;
}

function paragraphRange(editor: any): { from: number; to: number } {
  let from = -1;
  let to = -1;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (from !== -1) return false;
    if (node.type.name === 'paragraph') {
      from = pos + 1;
      to = pos + 1 + node.content.size;
      return false;
    }
  });
  return { from, to };
}

describe('charOffsetToDocPos with noBreakHyphen atoms (SD-2746)', () => {
  let editor: any | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('originalText (textBetweenWithTabs) matches positions returned by charOffsetToDocPos', () => {
    editor = makeEditorWithNoBreakHyphen();
    const { from, to } = paragraphRange(editor);

    // Mirror the executor's call site: blockSeparator='', leafFallback=''.
    const originalText = textBetweenWithTabs(editor.state.doc, from, to, '', '');
    expect(originalText).toBe(`a${NON_BREAKING_HYPHEN}b`);
    expect(originalText.length).toBe(3);

    // Each character offset (0..3) must round-trip to a coherent PM position
    // such that subsequent text.rewrite slicing lands at the right boundary.
    // Doc structure (positions inside the paragraph):
    //   [1] run-1 open  [2] 'a' content  [3] run-1 close
    //   [4] run-2 open  [5] atom         [6] run-2 close
    //   [7] run-3 open  [8] 'b' content  [9] run-3 close
    // The mapper resolves at the immediate post-atom boundary (pos 6) — both
    // pos 6 and pos 7 are visually equivalent for text insertion ("between
    // atom and 'b'") since they straddle a run boundary; the helper picks
    // the earliest valid spot.
    const expectedByOffset = {
      0: 2, // before 'a'
      1: 3, // after 'a' (boundary at run-1 close)
      2: 6, // after the atom (boundary at run-2 close, equivalent to before 'b')
      3: 9, // after 'b'
    } as Record<number, number>;

    for (const [offsetStr, expectedPos] of Object.entries(expectedByOffset)) {
      const offset = Number(offsetStr);
      expect({ offset, pos: charOffsetToDocPos(editor.state.doc, from, to, offset) }).toEqual({
        offset,
        pos: expectedPos,
      });
    }
  });

  it('common-prefix offset 2 (matching "a‑") lands AFTER the atom, not after "b"', () => {
    // The exact regression the reviewer described: rewriting "a‑b" → "a‑c",
    // the diff computes prefix=2. Without counting the atom in the offset
    // mapper, charOffsetToDocPos walks past 'a' (count=1), skips the atom
    // (count stays 1), then 'b' (count=2 ≥ 2) → returns position AFTER 'b'.
    //
    // With the fix, the atom contributes 1 char (count=2 after atom) so the
    // mapper resolves the offset to the boundary right after the atom,
    // before 'b'. The trailing 'b' is then correctly identified as the only
    // character to replace.
    editor = makeEditorWithNoBreakHyphen();
    const { from, to } = paragraphRange(editor);

    const prefix = 2;
    const pos = charOffsetToDocPos(editor.state.doc, from, to, prefix);

    // Resolved PM position must be at or before 'b'. After 'b' would be 9
    // (the bug); before 'b' is 8; the run boundary just before 'b' is 7.
    expect(pos).toBeLessThanOrEqual(8);
  });

  it('symmetric: suffix from the right side past the atom maps before "a", not before atom', () => {
    // For rewriting "a‑b" → "z‑b", suffix=2 (matching "‑b"). The mapper is
    // called with `origLen - suffix = 1`, which should land just after 'a'.
    editor = makeEditorWithNoBreakHyphen();
    const { from, to } = paragraphRange(editor);

    const pos = charOffsetToDocPos(editor.state.doc, from, to, 1);
    expect(pos).toBe(3); // immediately after 'a' inside its run
  });
});
