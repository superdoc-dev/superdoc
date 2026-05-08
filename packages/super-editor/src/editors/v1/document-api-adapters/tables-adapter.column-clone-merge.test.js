// @ts-check
/**
 * Verify that inserting a column adjacent to a merged cell does not corrupt
 * the table map by carrying rowspan / gridSpan / vMerge from the source cell.
 *
 * Hypothesis: `normalizeClonedColumnInsertCellAttrs` resets `colspan` only.
 * Sister helper `normalizeCellAttrsForSingleCell` (the canonical reset) also
 * clears `rowspan` and deletes `tableCellProperties.gridSpan` /
 * `tableCellProperties.vMerge`. The column-clone path skips those, so when
 * the source cell carries any merge metadata, the inserted column inherits
 * it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

let docxData;

beforeAll(async () => {
  docxData = await loadTestDataForEditorTests('table-merged-cells.docx');
});

function findFirstMergedTable(doc) {
  let target = null;
  doc.descendants((node, pos) => {
    if (target) return false;
    if (node.type.name !== 'table') return true;
    let hasMerge = false;
    node.descendants((c) => {
      if (hasMerge) return false;
      if (c.type.name !== 'tableCell') return true;
      const a = c.attrs ?? {};
      const tcp = a.tableCellProperties ?? {};
      if ((a.rowspan && a.rowspan > 1) || tcp.vMerge || tcp.gridSpan) hasMerge = true;
      return true;
    });
    if (hasMerge) target = { node, pos };
    return false;
  });
  return target;
}

describe('insertColumn next to merged cells', () => {
  it('does not carry rowspan / gridSpan / vMerge into newly inserted cells', () => {
    const { editor } = initTestEditor({
      content: docxData.docx,
      media: docxData.media,
      mediaFiles: docxData.mediaFiles,
      fonts: docxData.fonts,
      element: null,
    });

    const before = findFirstMergedTable(editor.state.doc);
    expect(before, 'fixture must contain a table with merged cells').not.toBeNull();
    const tableId = before.node.attrs?.sdBlockId;
    const beforeRows = before.node.childCount;
    const beforeColCount = before.node.firstChild?.childCount ?? 0;

    const result = editor.doc.tables.insertColumn({
      target: { kind: 'block', nodeType: 'table', nodeId: tableId },
      position: 'last',
    });

    expect(result.success, `insertColumn should succeed; result: ${JSON.stringify(result)}`).toBe(true);

    // Re-locate the same table - it may have moved or the sdBlockId may have
    // been regenerated. Find the first table that has the same row count and
    // one more column than before.
    const expectedColCount = beforeColCount + 1;
    let after = null;
    editor.state.doc.descendants((node) => {
      if (after) return false;
      if (node.type.name !== 'table') return true;
      if (node.childCount === beforeRows && (node.firstChild?.childCount ?? 0) >= expectedColCount) {
        after = node;
      }
      return false;
    });
    expect(after, 'updated table not found post-insert').not.toBeNull();

    const offendingCells = [];
    let rowsExamined = 0;
    after.forEach((row) => {
      if (row.type.name !== 'tableRow') return;
      const lastCell = row.lastChild;
      if (!lastCell || lastCell.type.name !== 'tableCell') {
        rowsExamined++;
        return;
      }
      const a = lastCell.attrs ?? {};
      const tcp = a.tableCellProperties ?? {};
      const issues = [];
      if (a.rowspan && a.rowspan !== 1) issues.push(`rowspan=${a.rowspan}`);
      if (a.colspan && a.colspan !== 1) issues.push(`colspan=${a.colspan}`);
      if (tcp.gridSpan) issues.push(`tableCellProperties.gridSpan=${JSON.stringify(tcp.gridSpan)}`);
      if (tcp.vMerge) issues.push(`tableCellProperties.vMerge=${JSON.stringify(tcp.vMerge)}`);
      if (issues.length > 0) offendingCells.push({ rowIndex: rowsExamined, issues });
      rowsExamined++;
    });

    // eslint-disable-next-line no-console
    console.log('[insertColumn merge-clone probe]', {
      tableId,
      beforeRows,
      beforeColCount,
      afterColCount: after.firstChild?.childCount,
      offendingCells,
    });

    expect(
      offendingCells,
      `inserted cells must not carry merge metadata; saw: ${JSON.stringify(offendingCells)}`,
    ).toEqual([]);
  });
});
