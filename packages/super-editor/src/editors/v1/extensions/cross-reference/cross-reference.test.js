import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { getTextAdapter } from '../../document-api-adapters/get-text-adapter.js';
import { textBetweenWithTabs } from '../../document-api-adapters/helpers/text-with-tabs.js';
import { charOffsetToDocPos } from '../../document-api-adapters/plan-engine/executor.ts';

/**
 * Regression tests for cross-reference text extraction.
 *
 * A `crossReference` is an inline atom whose visible text (the cached Word
 * field result, e.g. "9.1") lives only in the `resolvedText` attribute — it
 * has no text children. Without a `leafText` spec, every flattening API
 * (`getText`, `node.textContent`, SearchIndex, the rewrite char-diff) dropped
 * the reference while the rendered document showed it, so extracted clause
 * text read "clauses  and above" instead of "clauses 9.1 and above".
 *
 * These tests pin the `leafText` contract end-to-end: extraction through the
 * real get-text adapter, and offset accounting through `charOffsetToDocPos`,
 * which must mirror `textBetweenWithTabs` exactly (see the noBreakHyphen
 * rewrite integration tests for the single-char analogue — crossReference is
 * the first multi-char leafText atom).
 */
function makeEditorWithCrossRef({ resolvedText = '9.1', target = '_Ref171508269' } = {}) {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {},
          content: [
            { type: 'run', attrs: {}, content: [{ type: 'text', text: 'clauses ' }] },
            {
              type: 'run',
              attrs: {},
              content: [
                {
                  type: 'crossReference',
                  attrs: {
                    fieldType: 'REF',
                    instruction: `REF ${target} \\w \\h`,
                    target,
                    display: 'numberFullContext',
                    resolvedText,
                  },
                },
              ],
            },
            { type: 'run', attrs: {}, content: [{ type: 'text', text: ' and above' }] },
          ],
        },
      ],
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor;
}

function paragraphRange(editor) {
  let from = -1;
  let to = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from !== -1) return false;
    if (node.type.name === 'paragraph') {
      from = pos + 1;
      to = pos + 1 + node.content.size;
      return false;
    }
  });
  return { from, to };
}

describe('crossReference leafText', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('getText includes the resolved cross-reference text', () => {
    editor = makeEditorWithCrossRef();
    expect(getTextAdapter(editor, {})).toBe('clauses 9.1 and above');
  });

  it('falls back to the bookmark target when resolvedText is empty', () => {
    editor = makeEditorWithCrossRef({ resolvedText: '', target: '_Ref171508269' });
    expect(getTextAdapter(editor, {})).toBe('clauses _Ref171508269 and above');
  });

  it('node.textContent (blocks.list includeText path) includes the resolved text', () => {
    editor = makeEditorWithCrossRef();
    let paragraph;
    editor.state.doc.descendants((node) => {
      if (!paragraph && node.type.name === 'paragraph') paragraph = node;
      return !paragraph;
    });
    expect(paragraph.textContent).toBe('clauses 9.1 and above');
  });

  it('charOffsetToDocPos counts the multi-char atom so rewrite offsets stay aligned', () => {
    editor = makeEditorWithCrossRef();
    const { from, to } = paragraphRange(editor);

    // Mirror the executor's call site: blockSeparator='', leafFallback=''.
    const originalText = textBetweenWithTabs(editor.state.doc, from, to, '', '');
    expect(originalText).toBe('clauses 9.1 and above');

    let atomPos = -1;
    let atomSize = 0;
    editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'crossReference') {
        atomPos = pos;
        atomSize = node.nodeSize;
        return false;
      }
      return true;
    });
    expect(atomPos).toBeGreaterThan(-1);

    const beforeAtom = 'clauses '.length; // offset 8
    const afterAtom = 'clauses 9.1'.length; // offset 11

    // Offset at the atom's left edge resolves at or before the atom (the
    // mapper picks the earliest visually-equivalent boundary — here the end
    // of the preceding text run), with no visible chars between.
    const leftEdgePos = charOffsetToDocPos(editor.state.doc, from, to, beforeAtom);
    expect(leftEdgePos).toBeLessThanOrEqual(atomPos);
    expect(textBetweenWithTabs(editor.state.doc, leftEdgePos, atomPos, '', '')).toBe('');
    // Offsets landing inside the atom ("9.1" cannot be sliced mid-glyph)
    // and at its right edge resolve immediately after the atom.
    expect(charOffsetToDocPos(editor.state.doc, from, to, beforeAtom + 1)).toBe(atomPos + atomSize);
    expect(charOffsetToDocPos(editor.state.doc, from, to, afterAtom)).toBe(atomPos + atomSize);
    // Offsets past the atom account for all 3 chars: ' and above' starts
    // 1 position into the trailing run (run open token) after the atom's run
    // close token.
    const afterAtomTextStart = charOffsetToDocPos(editor.state.doc, from, to, afterAtom + 1);
    expect(textBetweenWithTabs(editor.state.doc, afterAtomTextStart, to, '', '')).toBe('and above');
  });
});
