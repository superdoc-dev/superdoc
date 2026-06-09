import { beforeEach, describe, expect, it } from 'vitest';
import { CellSelection } from 'prosemirror-tables';

import { initTestEditor } from '@tests/helpers/helpers.js';

import { resolveCellContext, resolveCrossCellSelection } from './TableSelectionUtilities.js';

/**
 * SD-3328 (Option 2): dragging a selection across table cells should produce a CellSelection,
 * not a text selection that prosemirror-tables collapses. The drag handler decides this from the
 * resolved PM positions via resolveCrossCellSelection, which must hold across direction and only
 * fire for genuine cross-cell drags within one table.
 */
const makeTable = (emptyLastCell) => ({
  type: 'table',
  attrs: { tableProperties: {}, grid: [{ col: 1500 }, { col: 1500 }] },
  content: [
    {
      type: 'tableRow',
      content: [cell('A1'), cell('B1')],
    },
    {
      type: 'tableRow',
      content: [cell('A2'), emptyLastCell ? emptyCell() : cell('B2')],
    },
  ],
});
const cell = (text) => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
  content: [{ type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text }] }] }],
});
const emptyCell = () => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
  content: [{ type: 'paragraph' }],
});
const DOC = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'Body paragraph' }] }] },
    makeTable(true), // table 1, last cell empty (the user's collapse trigger)
    { type: 'paragraph', content: [{ type: 'run', content: [{ type: 'text', text: 'Between tables' }] }] },
    makeTable(false), // table 2
  ],
};

describe('cross-cell selection resolution (SD-3328)', () => {
  let editor;

  beforeEach(() => {
    ({ editor } = initTestEditor({ loadFromSchema: true, content: DOC }));
  });

  /** Positions inside representative nodes of the built document. */
  function positions() {
    const doc = editor.state.doc;
    const tableCellPositions = []; // one position inside each cell, in document order
    let bodyInside = null;
    let emptyCellInside = null;

    doc.descendants((node, pos) => {
      if (node.isText && bodyInside === null && node.text.includes('Body paragraph')) {
        bodyInside = pos + 1;
      }
      if (node.type.name === 'tableCell') {
        tableCellPositions.push(pos + 1); // inside the cell
        if (emptyCellInside === null && node.content.size > 0 && node.firstChild?.content.size === 0) {
          emptyCellInside = pos + 1; // inside the empty cell's empty paragraph
        }
      }
    });

    return { bodyInside, tableCellPositions, emptyCellInside };
  }

  it('resolves a cell context inside a cell and nothing in the body', () => {
    const { bodyInside, tableCellPositions } = positions();
    const doc = editor.state.doc;

    expect(resolveCellContext(doc, bodyInside)).toBeNull();

    const cellCtx = resolveCellContext(doc, tableCellPositions[0]);
    expect(cellCtx).not.toBeNull();
    // The cell position points at the cell node (its nodeAfter is the cell).
    expect(doc.resolve(cellCtx.cellPos).nodeAfter?.type.name).toBe('tableCell');
    expect(doc.resolve(cellCtx.tablePos).nodeAfter?.type.name).toBe('table');
  });

  it('returns cell positions for a cross-cell drag within one table, in either direction', () => {
    const { tableCellPositions } = positions();
    const doc = editor.state.doc;
    const [a1, b1] = tableCellPositions; // first two cells of table 1

    const forward = resolveCrossCellSelection(doc, a1, b1);
    const backward = resolveCrossCellSelection(doc, b1, a1);
    expect(forward).not.toBeNull();
    expect(backward).not.toBeNull();
    // Direction is preserved: anchor stays the anchor.
    expect(forward.anchorCellPos).toBe(backward.headCellPos);
    expect(forward.headCellPos).toBe(backward.anchorCellPos);

    // The resulting positions build a real CellSelection spanning two cells.
    const sel = CellSelection.create(doc, forward.anchorCellPos, forward.headCellPos);
    let cellCount = 0;
    sel.forEachCell(() => (cellCount += 1));
    expect(cellCount).toBe(2);
  });

  it('treats a drag that ends on an empty cell paragraph as cross-cell (the reported case)', () => {
    const { tableCellPositions, emptyCellInside } = positions();
    const doc = editor.state.doc;
    expect(emptyCellInside).not.toBeNull();

    // Backward: anchor on the empty cell paragraph, head in an earlier cell of the same table.
    const result = resolveCrossCellSelection(doc, emptyCellInside, tableCellPositions[0]);
    expect(result).not.toBeNull();
    expect(() => CellSelection.create(doc, result.anchorCellPos, result.headCellPos)).not.toThrow();
  });

  it('returns null when it is not a cross-cell drag', () => {
    const { bodyInside, tableCellPositions } = positions();
    const doc = editor.state.doc;

    // Same cell -> text selection.
    expect(resolveCrossCellSelection(doc, tableCellPositions[0], tableCellPositions[0] + 1)).toBeNull();
    // Body to cell -> not both in cells.
    expect(resolveCrossCellSelection(doc, bodyInside, tableCellPositions[0])).toBeNull();
    // Different tables -> null (last cells belong to table 1 vs table 2).
    const firstTableCell = tableCellPositions[0];
    const secondTableCell = tableCellPositions[tableCellPositions.length - 1];
    expect(resolveCrossCellSelection(doc, firstTableCell, secondTableCell)).toBeNull();
  });
});
