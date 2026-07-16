import { beforeEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';

import { initTestEditor } from '@tests/helpers/helpers.js';

import { selectionCollapsesAcrossTableCells, stabilizeTextSelectionAcrossTableCells } from './SelectionHelpers.js';

/**
 * SD-3328: Dragging a body selection into (or through) a table collapses the selection when
 * the head lands at the start of a cell block. prosemirror-tables' `normalizeSelection`
 * rewrites such a TextSelection to the anchor block's own bounds. An empty paragraph in a
 * cell is always at `parentOffset === 0`, so it always triggers the collapse, while text in a
 * cell (parentOffset > 0) does not. `selectionCollapsesAcrossTableCells` detects exactly the
 * frames that would collapse so the drag handler can preserve the last good selection.
 *
 * These tests pin the detector against the REAL table plugin: the helper must return `true`
 * exactly when a dispatched selection actually collapses.
 */
const DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'run', content: [{ type: 'text', text: 'Body paragraph before the table' }] }],
    },
    {
      type: 'table',
      attrs: { tableProperties: {}, grid: [{ col: 1500 }] },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'run', content: [{ type: 'text', text: 'Cell paragraph text' }] }],
                },
                // Empty paragraph inside the cell — the position that triggers the collapse.
                { type: 'paragraph' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('selectionCollapsesAcrossTableCells (SD-3328)', () => {
  let editor;

  beforeEach(() => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: DOC }));
  });

  /** Resolve representative positions in the built document. */
  function positions() {
    const doc = editor.state.doc;
    let bodyPos = null;
    let cellTextPos = null;
    let emptyCellParaPos = null;

    doc.descendants((node, pos) => {
      if (node.isText && bodyPos === null && node.text.includes('Body paragraph')) {
        bodyPos = pos + 5; // mid body text
      }
      if (node.isText && cellTextPos === null && node.text.includes('Cell paragraph')) {
        cellTextPos = pos + 5; // mid cell text
      }
    });

    doc.descendants((node, pos) => {
      if (emptyCellParaPos !== null) return false;
      if (node.type.name === 'paragraph' && node.content.size === 0) {
        const $pos = doc.resolve(pos);
        let inTable = false;
        for (let depth = $pos.depth; depth > 0; depth--) {
          if ($pos.node(depth).type.name === 'table') inTable = true;
        }
        if (inTable) emptyCellParaPos = pos + 1; // inside the empty cell paragraph
      }
    });

    return { bodyPos, cellTextPos, emptyCellParaPos };
  }

  /** Whether dispatching TextSelection(anchor -> target) actually keeps the head at target. */
  function dispatchKeepsHead(anchor, target) {
    const doc = editor.state.doc;
    const applied = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(doc, anchor, target)));
    return applied.selection.head === target;
  }

  it('flags the body -> empty-cell-paragraph drag but not the body -> cell-text drag', () => {
    const { bodyPos, cellTextPos, emptyCellParaPos } = positions();
    expect(bodyPos).not.toBeNull();
    expect(cellTextPos).not.toBeNull();
    expect(emptyCellParaPos).not.toBeNull();

    const doc = editor.state.doc;
    expect(selectionCollapsesAcrossTableCells(doc, bodyPos, emptyCellParaPos)).toBe(true);
    expect(selectionCollapsesAcrossTableCells(doc, bodyPos, cellTextPos)).toBe(false);
    expect(selectionCollapsesAcrossTableCells(doc, bodyPos, bodyPos)).toBe(false); // collapsed selection
  });

  it('matches the real table-plugin normalization: flags exactly the selections that collapse', () => {
    const { bodyPos, cellTextPos, emptyCellParaPos } = positions();
    const doc = editor.state.doc;

    // Ground truth from the real prosemirror-tables plugin (runs in initTestEditor):
    // body -> empty cell paragraph collapses (head does NOT survive), body -> cell text survives.
    expect(dispatchKeepsHead(bodyPos, emptyCellParaPos)).toBe(false);
    expect(dispatchKeepsHead(bodyPos, cellTextPos)).toBe(true);

    // The detector must agree with that ground truth for every endpoint.
    for (const target of [emptyCellParaPos, cellTextPos]) {
      const flagged = selectionCollapsesAcrossTableCells(doc, bodyPos, target);
      const collapses = !dispatchKeepsHead(bodyPos, target);
      expect(flagged).toBe(collapses);
    }
  });

  it('stabilizes empty-textblock endpoints in both drag directions', () => {
    const { bodyPos, emptyCellParaPos } = positions();
    const doc = editor.state.doc;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const forward = stabilizeTextSelectionAcrossTableCells(doc, bodyPos, emptyCellParaPos);
      expect(forward).not.toBeNull();
      expect(forward).toEqual({
        selAnchor: bodyPos,
        selHead: emptyCellParaPos + 1,
      });
      expect(dispatchKeepsHead(forward.selAnchor, forward.selHead)).toBe(true);

      const backward = stabilizeTextSelectionAcrossTableCells(doc, emptyCellParaPos, bodyPos);
      expect(backward).not.toBeNull();
      expect(backward).toEqual({
        selAnchor: emptyCellParaPos + 1,
        selHead: bodyPos,
      });
      expect(dispatchKeepsHead(backward.selAnchor, backward.selHead)).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('leaves non-collapsing selections unchanged', () => {
    const { bodyPos, cellTextPos } = positions();
    const doc = editor.state.doc;

    expect(stabilizeTextSelectionAcrossTableCells(doc, bodyPos, cellTextPos)).toEqual({
      selAnchor: bodyPos,
      selHead: cellTextPos,
    });
  });
});
