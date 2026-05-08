// @ts-check
/**
 * Verify whether the round-2 change to `normalizeClonedRowInsertCellAttrs`
 * (now also forces `colspan: 1` and strips `gridSpan`) corrupts the row
 * geometry when a horizontally-merged source cell is cloned.
 *
 * Hypothesis: `insertRowInTable` advances `col` by the SOURCE cell's
 * original colspan (line 862), but the cloned cell now has `colspan: 1`,
 * so a 3-col-spanning source produces ONE singleton cell while the loop
 * advances by 3. Result: the inserted row is `map.width - 2` cells wide
 * instead of having a matching merged cell or 3 singletons. The PM
 * table-map ends up inconsistent.
 *
 * Before the round-2 change, the helper only set `rowspan: 1`, leaving
 * `colspan` from the source intact. So this is a regression introduced
 * by the round-2 helper.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

let docxData;

beforeAll(async () => {
  docxData = await loadTestDataForEditorTests('table-merged-cells.docx');
});

function findFirstTableWithHorizontalMerge(doc) {
  // Pick the LAST row that has a single full-width spanning cell so the bug
  // (loop advances by source colspan, but cloned cell is colspan: 1) is most
  // visible: source row has 1 cell, expected new row should also have a
  // matching colspan-N cell or N singletons summing to N.
  let target = null;
  doc.descendants((node, pos) => {
    if (target) return false;
    if (node.type.name !== 'table') return true;
    let bestRow = -1;
    let bestColspan = 1;
    let rowIdx = -1;
    node.forEach((row) => {
      rowIdx++;
      if (row.type.name !== 'tableRow') return;
      // Pick rows whose first cell has the largest colspan.
      const firstCell = row.firstChild;
      if (!firstCell || firstCell.type.name !== 'tableCell') return;
      const colspan = firstCell.attrs?.colspan ?? 1;
      if (colspan > bestColspan) {
        bestColspan = colspan;
        bestRow = rowIdx;
      }
    });
    if (bestRow !== -1) target = { node, pos, mergedRowIndex: bestRow, sourceColspan: bestColspan };
    return false;
  });
  return target;
}

describe('insertRow above a horizontally merged source row', () => {
  it('produces an inserted row whose total column count matches the table width', () => {
    const { editor } = initTestEditor({
      content: docxData.docx,
      media: docxData.media,
      mediaFiles: docxData.mediaFiles,
      fonts: docxData.fonts,
      element: null,
    });

    const target = findFirstTableWithHorizontalMerge(editor.state.doc);
    expect(target, 'fixture must contain a table with a horizontally merged cell').not.toBeNull();

    const tableId = target.node.attrs?.sdBlockId;
    expect(tableId).toBeTruthy();

    // Capture pre-state: table width = first row's colspan-summed width.
    const beforeWidth = (() => {
      const firstRow = target.node.firstChild;
      let w = 0;
      firstRow.forEach((c) => {
        w += c.attrs?.colspan ?? 1;
      });
      return w;
    })();

    // Insert a row immediately AFTER the merged-cell row, cloning from it.
    // tablesInsertRow `position: 'after'` clones the source row's cell
    // structure (column widths / shading) onto the new row.
    // eslint-disable-next-line no-console
    console.log('[insertRow probe pre-state]', {
      tableId,
      mergedRowIndex: target.mergedRowIndex,
      sourceColspan: target.sourceColspan,
      beforeWidth,
      sourceRow: (() => {
        const sr = target.node.child(target.mergedRowIndex);
        const cells = [];
        sr.forEach((c) => cells.push({ cs: c.attrs?.colspan ?? 1 }));
        return cells;
      })(),
    });

    const result = editor.doc.tables.insertRow({
      target: { kind: 'block', nodeType: 'table', nodeId: tableId },
      rowIndex: target.mergedRowIndex,
      position: 'below',
    });
    expect(result.success, `insertRow should succeed; got ${JSON.stringify(result)}`).toBe(true);

    // Re-locate the table and inspect the inserted row's column-width sum.
    let updatedTable = null;
    editor.state.doc.descendants((node) => {
      if (updatedTable) return false;
      if (node.type.name !== 'table') return true;
      // First table with one more row than before
      if (node.childCount === target.node.childCount + 1) updatedTable = node;
      return false;
    });
    expect(updatedTable).not.toBeNull();

    // Dump the entire table post-insert so we can see what actually happened.
    let postRows = [];
    updatedTable.forEach((row, _, ri) => {
      const cells = [];
      row.forEach((c) => {
        const tcp = c.attrs?.tableCellProperties ?? {};
        cells.push({
          cs: c.attrs?.colspan ?? 1,
          rs: c.attrs?.rowspan ?? 1,
          gs: tcp.gridSpan,
        });
      });
      postRows.push({ ri, cells });
    });
    // eslint-disable-next-line no-console
    console.log('[insertRow probe full post-state]', JSON.stringify(postRows, null, 2));

    const insertedRow = updatedTable.child(target.mergedRowIndex + 1);
    let insertedColspanSum = 0;
    let cellSpans = [];
    insertedRow.forEach((c) => {
      const cs = c.attrs?.colspan ?? 1;
      insertedColspanSum += cs;
      cellSpans.push(cs);
    });

    // eslint-disable-next-line no-console
    console.log('[insertRow horizontal-merge probe]', {
      tableId,
      mergedRowIndex: target.mergedRowIndex,
      beforeWidth,
      insertedRowChildCount: insertedRow.childCount,
      insertedColspanSum,
      cellSpans,
    });

    // The inserted row should mirror the SOURCE row's cell shape (cell count
    // and colspans), not collapse a colspan-3 source into 3 singletons. The
    // pre-round-2 helper preserved this; the round-2 helper resets colspan
    // and strips gridSpan, so PM normalization expands the resulting too-narrow
    // row to N singletons - losing the merge geometry that the source had.
    const sourceRowCells = (() => {
      const sr = updatedTable.child(target.mergedRowIndex);
      const cells = [];
      sr.forEach((c) => cells.push(c.attrs?.colspan ?? 1));
      return cells;
    })();
    expect(
      cellSpans,
      `inserted row should preserve source row's cell shape ${JSON.stringify(sourceRowCells)}; saw ${JSON.stringify(cellSpans)}`,
    ).toEqual(sourceRowCells);
  });
});
