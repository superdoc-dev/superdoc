import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { AllSelection, EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { CellSelection, TableMap } from 'prosemirror-tables';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { createTable } from './tableHelpers/createTable.js';
import { normalizeNewTableAttrs } from './tableHelpers/normalizeNewTableAttrs.js';
import { DEFAULT_TBL_LOOK } from '@superdoc/style-engine/ooxml';
import { promises as fs } from 'fs';

// Cache DOCX data to avoid repeated file loading
let cachedBlankDoc = null;
let cachedBordersDoc = null;
let cachedNoTableStyleDoc = null;

/**
 * Find the first table position within the provided document.
 * @param {import('prosemirror-model').Node} doc
 * @returns {number|null}
 */
function findTablePos(doc) {
  let tablePos = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      tablePos = pos;
      return false;
    }
    return true;
  });
  return tablePos;
}

describe('Table commands', async () => {
  let editor;
  let schema;
  let templateMarkType;
  let templateBlockType;
  let templateBlockAttrs;
  let table;

  // Load DOCX data once before all tests
  beforeAll(async () => {
    cachedBlankDoc = await loadTestDataForEditorTests('blank-doc.docx');
    cachedBordersDoc = await loadTestDataForEditorTests('SD-978-remove-table-borders.docx');
    cachedNoTableStyleDoc = await loadTestDataForEditorTests('ooxml-bold-rstyle-linked-combos-demo.docx');
  });

  const setupTestTable = async () => {
    const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    ({ schema } = editor);

    templateMarkType = schema.marks.bold || schema.marks.strong || null;
    templateBlockType = schema.nodes.heading || schema.nodes.paragraph;
    templateBlockAttrs = templateBlockType === schema.nodes.heading ? { level: 3 } : null;

    table = createTable(schema, 2, 2, false);
    const rows = [];
    table.forEach((row, _offset, index) => {
      if (index === table.childCount - 1) {
        const cellType = schema.nodes.tableCell;
        const mark = templateMarkType ? templateMarkType.create() : null;
        const styledText = schema.text('Styled Template', mark ? [mark] : undefined);
        const styledBlock = templateBlockType.create(templateBlockAttrs, styledText);
        const secondBlock = schema.nodes.paragraph.create(null, schema.text('Baseline'));
        const firstCell = cellType.create(row.firstChild.attrs, styledBlock);
        const secondCell = cellType.create(row.lastChild.attrs, secondBlock);
        rows.push(row.type.create(row.attrs, [firstCell, secondCell]));
      } else {
        rows.push(row);
      }
    });
    table = table.type.create(table.attrs, rows);

    const doc = schema.nodes.doc.create(null, [table]);
    const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });

    editor.setState(nextState);
  };

  afterEach(async () => {
    editor?.destroy();
    editor = null;
    schema = null;
    templateMarkType = null;
    templateBlockType = null;
    templateBlockAttrs = null;
  });

  describe('appendRowsWithContent', async () => {
    beforeEach(async () => {
      await setupTestTable();
    });

    it('appends values as a new row at the end', async () => {
      const tablePos = findTablePos(editor.state.doc);
      expect(tablePos).not.toBeNull();

      const didAppend = editor.commands.appendRowsWithContent({
        tablePos,
        valueRows: [['One', 'Two']],
      });

      expect(didAppend).toBe(true);

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable?.type.name).toBe('table');
      expect(updatedTable.childCount).toBe(3);

      const lastRow = updatedTable.lastChild;
      const cellTexts = lastRow.content.content.map((cell) => cell.textContent);
      expect(cellTexts).toEqual(['One', 'Two']);
    });

    it('copies template marks when copyRowStyle is true', async () => {
      const tablePos = findTablePos(editor.state.doc);
      expect(tablePos).not.toBeNull();

      const didAppend = editor.commands.appendRowsWithContent({
        tablePos,
        valueRows: [['Styled Copy', 'Other']],
        copyRowStyle: true,
      });

      expect(didAppend).toBe(true);

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      const newLastRow = updatedTable.lastChild;
      const firstCell = newLastRow.firstChild;
      const blockNode = firstCell.firstChild;
      const textNode = blockNode.firstChild.firstChild;

      expect(blockNode.type).toBe(templateBlockType);
      if (templateBlockAttrs) {
        expect(blockNode.attrs).toMatchObject(templateBlockAttrs);
      }

      if (templateMarkType) {
        const hasMark = textNode.marks.some((mark) => mark.type === templateMarkType);
        expect(hasMark).toBe(true);
      }
    });
  });

  describe('addRowAfter', async () => {
    beforeEach(async () => {
      await setupTestTable();
    });

    it('preserves paragraph formatting from source row', async () => {
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);

      // Position cursor in the last row (which has styled content)
      const lastRowPos = tablePos + 1 + table.child(0).nodeSize;
      const cellPos = lastRowPos + 1;
      const textPos = cellPos + 2;
      editor.commands.setTextSelection(textPos);

      // Add row after
      const didAdd = editor.commands.addRowAfter();
      expect(didAdd).toBe(true);

      // Check the new row
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(3);

      const newRow = updatedTable.child(2);

      // Check ALL cells preserve formatting, not just the first
      newRow.forEach((cell, _, cellIndex) => {
        const blockNode = cell.firstChild;
        expect(blockNode.type).toBe(templateBlockType);
        if (templateBlockAttrs) {
          expect(blockNode.attrs).toMatchObject(templateBlockAttrs);
        }
      });
    });
  });

  describe('addRowBefore', async () => {
    beforeEach(async () => {
      await setupTestTable();
    });

    it('preserves paragraph formatting from source row', async () => {
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);

      // Position cursor in the last row (which has styled content)
      const lastRowPos = tablePos + 1 + table.child(0).nodeSize;
      const cellPos = lastRowPos + 1;
      const textPos = cellPos + 2;
      editor.commands.setTextSelection(textPos);

      // Add row before
      const didAdd = editor.commands.addRowBefore();
      expect(didAdd).toBe(true);

      // Check the new row (inserted at index 1, pushing styled row to index 2)
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(3);

      const newRow = updatedTable.child(1);
      const firstCell = newRow.firstChild;
      const blockNode = firstCell.firstChild;

      // Should preserve block type and attrs
      expect(blockNode.type).toBe(templateBlockType);
      if (templateBlockAttrs) {
        expect(blockNode.attrs).toMatchObject(templateBlockAttrs);
      }
    });
  });

  describe('addRow with merged cells (rowspan)', async () => {
    /**
     * Creates a table with a vertically merged cell (rowspan=2) in the first column.
     * Structure:
     * | Cell A (rowspan=2) | Cell B |
     * |                    | Cell C |
     */
    const setupTableWithRowspan = async () => {
      let { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      const RowType = schema.nodes.tableRow;
      const CellType = schema.nodes.tableCell;
      const TableType = schema.nodes.table;

      // First row: cell with rowspan=2, normal cell
      const cellA = CellType.create(
        { rowspan: 2, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell A')),
      );
      const cellB = CellType.create(
        { rowspan: 1, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell B')),
      );
      const row1 = RowType.create(null, [cellA, cellB]);

      // Second row: only one cell (first column occupied by rowspan)
      const cellC = CellType.create(
        { rowspan: 1, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell C')),
      );
      const row2 = RowType.create(null, [cellC]);

      table = TableType.create(null, [row1, row2]);

      const doc = schema.nodes.doc.create(null, [table]);
      const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
      editor.setState(nextState);
    };

    beforeEach(async () => {
      await setupTableWithRowspan();
    });

    it('addRowBefore: increases rowspan of spanning cell when inserting above spanned row', async () => {
      const { TextSelection } = await import('prosemirror-state');
      const { TableMap } = await import('prosemirror-tables');
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);
      const map = TableMap.get(table);

      // Cell C is at row 1, column 1 (column 0 is occupied by Cell A's rowspan)
      const cellCPosInTable = map.map[3]; // row 1 * width 2 + col 1 = index 3
      const absoluteCellCPos = tablePos + 1 + cellCPosInTable;

      // Position inside Cell C's paragraph (+2 for cell open + paragraph open)
      const textPos = absoluteCellCPos + 2;

      // Use TextSelection directly (editor.commands.setTextSelection has issues with table cells)
      const sel = TextSelection.create(editor.state.doc, textPos);
      const tr = editor.state.tr.setSelection(sel);
      editor.view.dispatch(tr);

      // Add row before the second row
      const didAdd = editor.commands.addRowBefore();
      expect(didAdd).toBe(true);

      // Check the updated table
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(3); // Now 3 rows

      // The first cell (Cell A) should now have rowspan=3
      const firstRow = updatedTable.child(0);
      const cellA = firstRow.firstChild;
      expect(cellA.attrs.rowspan).toBe(3);
      expect(cellA.textContent).toBe('Cell A');
    });

    it('addRowAfter: increases rowspan of spanning cell when inserting below first row', async () => {
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);

      // Position cursor in the first row (row index 0)
      let firstRowPos = tablePos + 1;
      // Skip the first cell (Cell A with rowspan) and go to second cell (Cell B)
      let cellBPos = firstRowPos + 1 + table.child(0).firstChild.nodeSize;
      let textPos = cellBPos + 2;
      editor.commands.setTextSelection(textPos);

      // Add row after the first row
      const didAdd = editor.commands.addRowAfter();
      expect(didAdd).toBe(true);

      // Check the updated table
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(3); // Now 3 rows

      // The first cell (Cell A) should now have rowspan=3
      const firstRow = updatedTable.child(0);
      const cellA = firstRow.firstChild;
      expect(cellA.attrs.rowspan).toBe(3);
      expect(cellA.textContent).toBe('Cell A');
    });

    it('addRowBefore on first row: does not affect rowspan (no cells span from above)', async () => {
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);

      // Position cursor in the first row, first cell
      let firstRowPos = tablePos + 1;
      let cellPos = firstRowPos + 1;
      let textPos = cellPos + 2;
      editor.commands.setTextSelection(textPos);

      // Add row before the first row
      const didAdd = editor.commands.addRowBefore();
      expect(didAdd).toBe(true);

      // Check the updated table
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(3); // Now 3 rows

      // The new row should be at index 0, original first row now at index 1
      // Cell A (now in row 1) should still have rowspan=2 (unchanged)
      const originalFirstRow = updatedTable.child(1);
      const cellA = originalFirstRow.firstChild;
      expect(cellA.attrs.rowspan).toBe(2);
      expect(cellA.textContent).toBe('Cell A');

      // New row should have 2 cells with rowspan=1
      const newRow = updatedTable.child(0);
      expect(newRow.childCount).toBe(2);
      newRow.forEach((cell) => {
        expect(cell.attrs.rowspan).toBe(1);
      });
    });

    it('addRowAfter: uses correct formatting from source cell when first column is spanned', async () => {
      // This test verifies Issue 2: cursor formatting should come from the
      // first CREATED cell, not sourceRow.firstChild (which may be spanned)
      const { TextSelection } = await import('prosemirror-state');
      const { TableMap } = await import('prosemirror-tables');
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);
      const map = TableMap.get(table);

      // Cell C is at row 1, column 1 (column 0 is occupied by Cell A's rowspan)
      const cellCPosInTable = map.map[3]; // row 1 * width 2 + col 1 = index 3
      const absoluteCellCPos = tablePos + 1 + cellCPosInTable;

      // Position inside Cell C's paragraph
      const textPos = absoluteCellCPos + 2;
      const sel = TextSelection.create(editor.state.doc, textPos);
      const tr = editor.state.tr.setSelection(sel);
      editor.view.dispatch(tr);

      // Add row after the second row
      const didAdd = editor.commands.addRowAfter();
      expect(didAdd).toBe(true);

      // Table should now have 3 rows and be structurally valid
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(3);

      // TableMap.get should not throw (table is valid)
      expect(() => TableMap.get(updatedTable)).not.toThrow();
    });
  });

  describe('addRow with colspan + rowspan combination', async () => {
    /**
     * Creates a table with a cell that has both colspan=2 AND rowspan=2.
     * This is a common pattern in Word documents (e.g., a header spanning multiple rows and columns).
     * Structure (3x3 table):
     * | Cell A (colspan=2, rowspan=2) | Cell B |
     * |                               | Cell C |
     * | Cell D                | Cell E| Cell F |
     */
    const setupTableWithColspanAndRowspan = async () => {
      let { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      const RowType = schema.nodes.tableRow;
      const CellType = schema.nodes.tableCell;
      const TableType = schema.nodes.table;

      // First row: cell with colspan=2 AND rowspan=2, plus one normal cell
      const cellA = CellType.create(
        { rowspan: 2, colspan: 2 },
        schema.nodes.paragraph.create(null, schema.text('Cell A')),
      );
      const cellB = CellType.create(
        { rowspan: 1, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell B')),
      );
      const row1 = RowType.create(null, [cellA, cellB]);

      // Second row: only cell C (columns 0-1 occupied by Cell A's colspan+rowspan)
      const cellC = CellType.create(
        { rowspan: 1, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell C')),
      );
      const row2 = RowType.create(null, [cellC]);

      // Third row: three normal cells
      const cellD = CellType.create(
        { rowspan: 1, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell D')),
      );
      const cellE = CellType.create(
        { rowspan: 1, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell E')),
      );
      const cellF = CellType.create(
        { rowspan: 1, colspan: 1 },
        schema.nodes.paragraph.create(null, schema.text('Cell F')),
      );
      const row3 = RowType.create(null, [cellD, cellE, cellF]);

      table = TableType.create(null, [row1, row2, row3]);

      const doc = schema.nodes.doc.create(null, [table]);
      const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
      editor.setState(nextState);
    };

    beforeEach(async () => {
      await setupTableWithColspanAndRowspan();
    });

    it('addRowBefore: increases rowspan of cell with both colspan and rowspan', async () => {
      const { TextSelection } = await import('prosemirror-state');
      const { TableMap } = await import('prosemirror-tables');
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);
      const map = TableMap.get(table);

      // Cell C is at row 1, column 2 (columns 0-1 are occupied by Cell A)
      // TableMap index: row 1 * width 3 + col 2 = 5
      const cellCPosInTable = map.map[5];
      const absoluteCellCPos = tablePos + 1 + cellCPosInTable;
      const textPos = absoluteCellCPos + 2;

      const sel = TextSelection.create(editor.state.doc, textPos);
      const tr = editor.state.tr.setSelection(sel);
      editor.view.dispatch(tr);

      // Add row before the second row (which is within Cell A's rowspan)
      const didAdd = editor.commands.addRowBefore();
      expect(didAdd).toBe(true);

      // Check the updated table
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(4); // Now 4 rows

      // Cell A should now have rowspan=3 (was 2, increased by 1)
      const firstRow = updatedTable.child(0);
      const cellA = firstRow.firstChild;
      expect(cellA.attrs.rowspan).toBe(3);
      expect(cellA.attrs.colspan).toBe(2); // colspan unchanged
      expect(cellA.textContent).toBe('Cell A');

      // Table should be structurally valid
      expect(() => TableMap.get(updatedTable)).not.toThrow();
    });

    it('addRowAfter on row 1: inserts row within colspan+rowspan cell extent', async () => {
      const { TableMap } = await import('prosemirror-tables');
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);

      // Position cursor in Cell B (row 0, col 2)
      const map = TableMap.get(table);
      const cellBPosInTable = map.map[2]; // row 0 * width 3 + col 2 = 2
      const absoluteCellBPos = tablePos + 1 + cellBPosInTable;
      const textPos = absoluteCellBPos + 2;
      editor.commands.setTextSelection(textPos);

      // Add row after the first row
      const didAdd = editor.commands.addRowAfter();
      expect(didAdd).toBe(true);

      // Check the updated table
      const updatedTable = editor.state.doc.nodeAt(tablePos);
      expect(updatedTable.childCount).toBe(4); // Now 4 rows

      // Cell A should now have rowspan=3
      const firstRow = updatedTable.child(0);
      const cellA = firstRow.firstChild;
      expect(cellA.attrs.rowspan).toBe(3);
      expect(cellA.attrs.colspan).toBe(2);

      // Table should be structurally valid
      expect(() => TableMap.get(updatedTable)).not.toThrow();
    });
  });

  describe('toggleHeaderRow preserves cell attributes (IT-550)', async () => {
    beforeEach(async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      // Create a 2x2 table with explicit cell attributes
      const CellType = schema.nodes.tableCell;
      const RowType = schema.nodes.tableRow;
      const TableType = schema.nodes.table;

      const cellAttrs = {
        colspan: 1,
        rowspan: 1,
        colwidth: [150],
        widthUnit: 'px',
        widthType: 'dxa',
        background: { color: 'FF0000' },
        tableCellProperties: { cellWidth: { value: 2250, type: 'dxa' } },
      };

      const makeCell = (text) => CellType.create(cellAttrs, schema.nodes.paragraph.create(null, schema.text(text)));

      const row1 = RowType.create(null, [makeCell('A'), makeCell('B')]);
      const row2 = RowType.create(null, [makeCell('C'), makeCell('D')]);
      table = TableType.create(null, [row1, row2]);

      const doc = schema.nodes.doc.create(null, [table]);
      const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
      editor.setState(nextState);
    });

    it('toggleHeaderRow preserves widthUnit, widthType, background, and tableCellProperties', async () => {
      const tablePos = findTablePos(editor.state.doc);
      expect(tablePos).not.toBeNull();

      // Position cursor in first row
      editor.commands.setTextSelection(tablePos + 3);

      // Toggle first row to header
      const didToggle = editor.commands.toggleHeaderRow();
      expect(didToggle).toBe(true);

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      const firstRow = updatedTable.child(0);

      // First row cells should now be tableHeader type
      firstRow.forEach((cell) => {
        expect(cell.type.name).toBe('tableHeader');
        // Critical attrs that were previously dropped
        expect(cell.attrs.widthUnit).toBe('px');
        expect(cell.attrs.widthType).toBe('dxa');
        expect(cell.attrs.colwidth).toEqual([150]);
        expect(cell.attrs.background).toEqual({ color: 'FF0000' });
        expect(cell.attrs.tableCellProperties).toEqual({ cellWidth: { value: 2250, type: 'dxa' } });
      });

      // Second row should remain tableCell
      const secondRow = updatedTable.child(1);
      secondRow.forEach((cell) => {
        expect(cell.type.name).toBe('tableCell');
      });
    });
  });

  describe('toggleHeaderRow sets repeatHeader and cell types atomically', async () => {
    /** Set up a 3×2 table (3 rows, 2 cols) with cursor positioned inside the table. */
    const setupPlainTable = async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      const table = createTable(schema, 3, 2, false);
      const doc = schema.nodes.doc.create(null, [table]);
      const nextState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
      editor.setState(nextState);
    };

    it('toggleHeaderRow sets repeatHeader on the target row', async () => {
      await setupPlainTable();
      const tablePos = findTablePos(editor.state.doc);

      // Place cursor in the first row
      editor.commands.setTextSelection(tablePos + 3);
      const didToggle = editor.commands.toggleHeaderRow();
      expect(didToggle).toBe(true);

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      const firstRow = updatedTable.child(0);

      // Cell types should be tableHeader
      firstRow.forEach((cell) => expect(cell.type.name).toBe('tableHeader'));
      // repeatHeader should be set
      expect(firstRow.attrs.tableRowProperties?.repeatHeader).toBe(true);

      // Other rows are unaffected
      const secondRow = updatedTable.child(1);
      secondRow.forEach((cell) => expect(cell.type.name).toBe('tableCell'));
      expect(secondRow.attrs.tableRowProperties?.repeatHeader).toBeFalsy();
    });

    it('toggleHeaderRow un-toggles header back to body row', async () => {
      await setupPlainTable();
      const tablePos = findTablePos(editor.state.doc);

      // Toggle on, then off
      editor.commands.setTextSelection(tablePos + 3);
      editor.commands.toggleHeaderRow();
      editor.commands.toggleHeaderRow();

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      const firstRow = updatedTable.child(0);
      firstRow.forEach((cell) => expect(cell.type.name).toBe('tableCell'));
      expect(firstRow.attrs.tableRowProperties?.repeatHeader).toBe(false);
    });

    it('undo reverts both cell types and repeatHeader in one step', async () => {
      await setupPlainTable();
      const tablePos = findTablePos(editor.state.doc);

      editor.commands.setTextSelection(tablePos + 3);
      editor.commands.toggleHeaderRow();

      // Verify header is on
      let table = editor.state.doc.nodeAt(tablePos);
      expect(table.child(0).firstChild.type.name).toBe('tableHeader');
      expect(table.child(0).attrs.tableRowProperties?.repeatHeader).toBe(true);

      // Single undo should revert both
      editor.commands.undo();
      table = editor.state.doc.nodeAt(tablePos);
      expect(table.child(0).firstChild.type.name).toBe('tableCell');
      expect(table.child(0).attrs.tableRowProperties?.repeatHeader).toBeFalsy();
    });

    it('works on non-first rows', async () => {
      await setupPlainTable();
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);
      const tableStart = tablePos + 1;
      const map = TableMap.get(table);

      // Position cursor in row 1, col 0 — use TableMap for reliable offset
      const row1CellOffset = map.map[1 * map.width]; // first cell of row 1
      const textPos = tableStart + row1CellOffset + 2; // +2: into cell, into paragraph
      const sel = TextSelection.create(editor.state.doc, textPos);
      editor.view.dispatch(editor.state.tr.setSelection(sel));

      editor.commands.toggleHeaderRow();

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      // Row 0 should be unaffected
      expect(updatedTable.child(0).firstChild.type.name).toBe('tableCell');
      expect(updatedTable.child(0).attrs.tableRowProperties?.repeatHeader).toBeFalsy();
      // Row 1 should be toggled
      expect(updatedTable.child(1).firstChild.type.name).toBe('tableHeader');
      expect(updatedTable.child(1).attrs.tableRowProperties?.repeatHeader).toBe(true);
    });

    it('handles multi-row CellSelection', async () => {
      await setupPlainTable();
      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);
      const tableStart = tablePos + 1;
      const map = TableMap.get(table);

      // Select cells spanning rows 0 and 1
      const firstCellOffset = map.map[0]; // row 0, col 0
      const lastCellOffset = map.map[1 * map.width + (map.width - 1)]; // row 1, last col
      const sel = CellSelection.create(editor.state.doc, tableStart + firstCellOffset, tableStart + lastCellOffset);
      editor.view.dispatch(editor.state.tr.setSelection(sel));

      editor.commands.toggleHeaderRow();

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      // Rows 0 and 1 should be headers
      for (const rowIdx of [0, 1]) {
        const row = updatedTable.child(rowIdx);
        row.forEach((cell) => expect(cell.type.name).toBe('tableHeader'));
        expect(row.attrs.tableRowProperties?.repeatHeader).toBe(true);
      }
      // Row 2 should be unaffected
      const row2 = updatedTable.child(2);
      row2.forEach((cell) => expect(cell.type.name).toBe('tableCell'));
      expect(row2.attrs.tableRowProperties?.repeatHeader).toBeFalsy();
    });

    it('preserves cell attributes during type conversion (IT-550 guardrail)', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      const cellAttrs = {
        colspan: 1,
        rowspan: 1,
        colwidth: [150],
        widthUnit: 'px',
        widthType: 'dxa',
        background: { color: 'FF0000' },
        tableCellProperties: { cellWidth: { value: 2250, type: 'dxa' } },
      };

      const makeCell = (text) =>
        schema.nodes.tableCell.create(cellAttrs, schema.nodes.paragraph.create(null, schema.text(text)));
      const row = schema.nodes.tableRow.create(null, [makeCell('A'), makeCell('B')]);
      const bodyRow = schema.nodes.tableRow.create(null, [makeCell('C'), makeCell('D')]);
      const table = schema.nodes.table.create(null, [row, bodyRow]);
      const doc = schema.nodes.doc.create(null, [table]);
      editor.setState(EditorState.create({ schema, doc, plugins: editor.state.plugins }));

      const tablePos = findTablePos(editor.state.doc);
      editor.commands.setTextSelection(tablePos + 3);
      editor.commands.toggleHeaderRow();

      const updatedRow = editor.state.doc.nodeAt(tablePos).child(0);
      updatedRow.forEach((cell) => {
        expect(cell.type.name).toBe('tableHeader');
        expect(cell.attrs.colwidth).toEqual([150]);
        expect(cell.attrs.widthUnit).toBe('px');
        expect(cell.attrs.widthType).toBe('dxa');
        expect(cell.attrs.background).toEqual({ color: 'FF0000' });
        expect(cell.attrs.tableCellProperties).toEqual({ cellWidth: { value: 2250, type: 'dxa' } });
      });
    });

    it('preserves header-column cells when toggling a header row off', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      // Build a 2×2 table where column 0 is a header column and row 0 is a header row.
      // Row 0: [tableHeader, tableHeader]  (header row + header column)
      // Row 1: [tableHeader, tableCell]    (header column only)
      const hCell = (text) =>
        schema.nodes.tableHeader.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
      const bCell = (text) =>
        schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
      const row0 = schema.nodes.tableRow.create({ tableRowProperties: { repeatHeader: true } }, [
        hCell('A'),
        hCell('B'),
      ]);
      const row1 = schema.nodes.tableRow.create(null, [hCell('C'), bCell('D')]);
      const table = schema.nodes.table.create(null, [row0, row1]);
      const doc = schema.nodes.doc.create(null, [table]);
      editor.setState(EditorState.create({ schema, doc, plugins: editor.state.plugins }));

      const tablePos = findTablePos(editor.state.doc);
      editor.commands.setTextSelection(tablePos + 3);

      // Toggle row 0 OFF
      editor.commands.toggleHeaderRow();

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      const updatedRow0 = updatedTable.child(0);

      // repeatHeader should be false
      expect(updatedRow0.attrs.tableRowProperties?.repeatHeader).toBe(false);
      // Column 0 (header column) should remain tableHeader
      expect(updatedRow0.child(0).type.name).toBe('tableHeader');
      // Column 1 should revert to tableCell
      expect(updatedRow0.child(1).type.name).toBe('tableCell');

      // Row 1 should be completely unaffected
      expect(updatedTable.child(1).child(0).type.name).toBe('tableHeader');
      expect(updatedTable.child(1).child(1).type.name).toBe('tableCell');
    });

    it('correctly toggles rows in tables with rowspan merges', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      // Build a 3×2 table where cell A spans rows 0-1 (rowspan=2).
      // Row 0: [A (rowspan=2), B]
      // Row 1: [             , C]  (A continues)
      // Row 2: [D,             E]
      const cell = (text, attrs = {}) =>
        schema.nodes.tableCell.create(
          { colspan: 1, rowspan: 1, ...attrs },
          schema.nodes.paragraph.create(null, schema.text(text)),
        );
      const row0 = schema.nodes.tableRow.create(null, [cell('A', { rowspan: 2 }), cell('B')]);
      const row1 = schema.nodes.tableRow.create(null, [cell('C')]);
      const row2 = schema.nodes.tableRow.create(null, [cell('D'), cell('E')]);
      const table = schema.nodes.table.create(null, [row0, row1, row2]);
      const doc = schema.nodes.doc.create(null, [table]);
      editor.setState(EditorState.create({ schema, doc, plugins: editor.state.plugins }));

      const tablePos = findTablePos(editor.state.doc);
      const tableStart = tablePos + 1;
      const tableNode = editor.state.doc.nodeAt(tablePos);
      const map = TableMap.get(tableNode);

      // Select cells spanning rows 0 and 1 (which includes the merged cell A)
      const topLeft = map.map[0]; // row 0, col 0 — cell A
      const bottomRight = map.map[1 * map.width + (map.width - 1)]; // row 1, last col — cell C
      const sel = CellSelection.create(editor.state.doc, tableStart + topLeft, tableStart + bottomRight);
      editor.view.dispatch(editor.state.tr.setSelection(sel));

      editor.commands.toggleHeaderRow();

      const updatedTable = editor.state.doc.nodeAt(tablePos);
      // Both rows 0 and 1 should be toggled
      expect(updatedTable.child(0).attrs.tableRowProperties?.repeatHeader).toBe(true);
      expect(updatedTable.child(1).attrs.tableRowProperties?.repeatHeader).toBe(true);
      // Row 2 should be unaffected
      expect(updatedTable.child(2).attrs.tableRowProperties?.repeatHeader).toBeFalsy();
    });
  });

  describe('createTable sets repeatHeader when withHeaderRow is true', () => {
    beforeEach(async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);
    });

    it('header row has repeatHeader: true', () => {
      const table = createTable(schema, 3, 2, true);
      const headerRow = table.child(0);
      expect(headerRow.attrs.tableRowProperties?.repeatHeader).toBe(true);
      // Body rows should not have repeatHeader
      expect(table.child(1).attrs.tableRowProperties?.repeatHeader).toBeFalsy();
      expect(table.child(2).attrs.tableRowProperties?.repeatHeader).toBeFalsy();
    });

    it('table without header row has no repeatHeader on any row', () => {
      const table = createTable(schema, 2, 2, false);
      for (let i = 0; i < table.childCount; i++) {
        expect(table.child(i).attrs.tableRowProperties?.repeatHeader).toBeFalsy();
      }
    });
  });

  describe('deleteCellAndTableBorders', async () => {
    let table, tablePos;

    const sharedTests = async () => {
      it('removes all borders on the table', async () => {
        const nilBorders = Object.assign(
          {},
          ...['top', 'left', 'bottom', 'right'].map((side) => ({
            [side]: {
              color: 'auto',
              size: 0,
              space: 0,
              val: 'nil',
            },
          })),
        );

        // Expect cell borders cleared from attrs.borders, written to tableCellProperties.borders
        table.children.forEach((tableRow) => {
          tableRow.children.forEach((tableCell) => {
            expect(tableCell.attrs.borders).toBeNull();
            expect(tableCell.attrs.tableCellProperties?.borders).toEqual(nilBorders);
          });
        });

        // Expect table borders to be removed
        expect(table.attrs.borders).toEqual(
          Object.assign(
            {},
            ...['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => ({
              [side]: {
                color: '#000000',
                size: 0,
              },
            })),
          ),
        );
      });

      it('exports a document with no table borders', async () => {
        const exported = await editor.exportDocx({ exportJsonOnly: true });
        const body = exported.elements[0];
        const tbl = body.elements.find((el) => el.name === 'w:tbl');
        expect(tbl).toBeDefined();

        // Expect all table cells to have a tcBorders with zero border
        tbl.elements
          .filter((el) => el.name === 'w:tr')
          .forEach((tr) => {
            tr.elements
              .filter((el) => el.name === 'w:tc')
              .forEach((tc) => {
                const tcPr = tc.elements.find((el) => el.name === 'w:tcPr');
                const tcBorders = tcPr?.elements?.find((el) => el.name === 'w:tcBorders');
                expect(tcBorders?.elements).toEqual(
                  expect.arrayContaining(
                    ['w:top', 'w:bottom', 'w:left', 'w:right'].map((name) => ({
                      name: name,
                      attributes: {
                        'w:val': 'nil',
                        'w:sz': '0',
                        'w:space': '0',
                        'w:color': 'auto',
                      },
                    })),
                  ),
                );
              });
          });

        // Expect tblBorders to specify "none" as the border type
        const tblPr = tbl.elements.find((el) => el.name === 'w:tblPr');
        expect(tblPr).toBeDefined();
        const tblBorders = tblPr?.elements?.find((el) => el.name === 'w:tblBorders');
        expect(tblBorders).toBeDefined();
        expect(tblBorders.elements).toEqual(
          ['w:top', 'w:left', 'w:bottom', 'w:right', 'w:insideH', 'w:insideV'].map((name) => ({
            name: name,
            attributes: {
              'w:val': 'nil',
              'w:sz': '0',
              'w:space': '0',
              'w:color': 'auto',
            },
          })),
        );
      });
    };

    describe('table created in SuperDoc', async () => {
      beforeEach(async () => {
        await setupTestTable();
        tablePos = findTablePos(editor.state.doc);
        expect(tablePos).not.toBeNull();
        const success = editor.commands.deleteCellAndTableBorders(editor);
        expect(success).toBe(true);
        table = editor.state.doc.nodeAt(tablePos);
        expect(table).not.toBeNull();
      });

      sharedTests();
    });

    describe('table imported from docx', async () => {
      beforeEach(async () => {
        const { docx, media, mediaFiles, fonts } = cachedBordersDoc;
        ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

        tablePos = findTablePos(editor.state.doc);
        expect(tablePos).not.toBeNull();
        const success = editor.commands.deleteCellAndTableBorders(editor);
        expect(success).toBe(true);
        table = editor.state.doc.nodeAt(tablePos);
        expect(table).not.toBeNull();
      });

      sharedTests();
    });

    it('targets the inner table when a structuredContentBlock wrapper around it is selected', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      const nilBorders = Object.assign(
        {},
        ...['top', 'left', 'bottom', 'right'].map((side) => ({
          [side]: { color: 'auto', size: 0, space: 0, val: 'nil' },
        })),
      );

      const outerBorders = {
        top: { val: 'single', size: 8, space: 0, color: '000000' },
        bottom: { val: 'single', size: 8, space: 0, color: '000000' },
        left: { val: 'single', size: 8, space: 0, color: '000000' },
        right: { val: 'single', size: 8, space: 0, color: '000000' },
      };

      const innerTable = createTable(schema, 2, 2, false);
      const sdt = schema.nodes.structuredContentBlock.create({ id: '2001', tag: 'block_table_sdt' }, [innerTable]);
      const outerCell = schema.nodes.tableCell.create(
        {
          tableCellProperties: { borders: outerBorders },
          tableCellPropertiesInlineKeys: ['borders'],
        },
        [sdt],
      );
      const outerRow = schema.nodes.tableRow.create({ paraId: 'A1B2C3D4' }, [outerCell]);
      const outerTable = schema.nodes.table.create({}, [outerRow]);
      const doc = schema.nodes.doc.create(null, [outerTable]);
      editor.setState(EditorState.create({ schema, doc, plugins: editor.state.plugins }));

      let sdtPos = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'structuredContentBlock') {
          sdtPos = pos;
          return false;
        }
        return true;
      });
      expect(sdtPos).not.toBeNull();

      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, sdtPos)));

      const success = editor.commands.deleteCellAndTableBorders(editor);
      expect(success).toBe(true);

      const updatedOuterTable = editor.state.doc.child(0);
      const updatedOuterCell = updatedOuterTable.firstChild.firstChild;
      expect(updatedOuterCell.attrs.tableCellProperties?.borders).toEqual(outerBorders);

      const updatedInnerTable = updatedOuterCell.firstChild.firstChild;
      expect(updatedInnerTable.type.name).toBe('table');
      updatedInnerTable.forEach((row) => {
        row.forEach((cell) => {
          expect(cell.attrs.tableCellProperties?.borders).toEqual(nilBorders);
        });
      });
    });
  });

  describe('table style normalization', async () => {
    it('does not force TableGrid on imported DOCX tables that have OOXML table metadata', async () => {
      const { docx, media, mediaFiles, fonts } = cachedNoTableStyleDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      const tablePos = findTablePos(editor.state.doc);
      expect(tablePos).not.toBeNull();

      const tableNode = editor.state.doc.nodeAt(tablePos);
      expect(tableNode?.type.name).toBe('table');
      expect(tableNode?.attrs.tableStyleId).toBeNull();
      expect(tableNode?.attrs.tableProperties?.tableStyleId).toBeUndefined();
      expect(Array.isArray(tableNode?.attrs.grid) && tableNode.attrs.grid.length > 0).toBe(true);
      expect(tableNode?.attrs.tableProperties?.tblLook).toBeDefined();
    });
  });

  describe('column width computation (SD-2086)', async () => {
    it('insertTableAt cells have computed colwidth when pageStyles available', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      // Inject pageStyles so computeColumnWidths returns real widths
      const originalConverter = editor.converter;
      editor.converter = {
        ...originalConverter,
        pageStyles: {
          ...originalConverter?.pageStyles,
          pageSize: { width: 8.5 },
          pageMargins: { left: 1, right: 1 },
        },
      };

      // Insert at end of doc
      const pos = editor.state.doc.content.size;
      const didInsert = editor.commands.insertTableAt({ pos, rows: 2, columns: 3 });
      expect(didInsert).toBe(true);

      // Find the inserted table
      const tablePos = findTablePos(editor.state.doc);
      expect(tablePos).not.toBeNull();
      const table = editor.state.doc.nodeAt(tablePos);

      // Each cell should have colwidth [208] (= Math.floor((8.5 - 1 - 1) * 96 / 3))
      table.forEach((row) => {
        row.forEach((cell) => {
          expect(cell.attrs.colwidth).toEqual([208]);
        });
      });

      editor.converter = originalConverter;
    });

    it('insertTable auto-calc still works after refactor', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      // Inject pageStyles
      const originalConverter = editor.converter;
      editor.converter = {
        ...originalConverter,
        pageStyles: {
          ...originalConverter?.pageStyles,
          pageSize: { width: 8.5 },
          pageMargins: { left: 1, right: 1 },
        },
      };

      const didInsert = editor.commands.insertTable({ rows: 2, cols: 3 });
      expect(didInsert).toBe(true);

      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);

      // Verify cells have computed widths
      table.forEach((row) => {
        row.forEach((cell) => {
          expect(cell.attrs.colwidth).toEqual([208]);
        });
      });

      editor.converter = originalConverter;
    });

    it('insertTable with explicit columnWidths bypasses auto-calc', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
      ({ schema } = editor);

      // Inject pageStyles (should be ignored since explicit widths are provided)
      const originalConverter = editor.converter;
      editor.converter = {
        ...originalConverter,
        pageStyles: {
          ...originalConverter?.pageStyles,
          pageSize: { width: 8.5 },
          pageMargins: { left: 1, right: 1 },
        },
      };

      const didInsert = editor.commands.insertTable({ rows: 2, cols: 3, columnWidths: [100, 200, 300] });
      expect(didInsert).toBe(true);

      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);

      table.forEach((row) => {
        expect(row.child(0).attrs.colwidth).toEqual([100]);
        expect(row.child(1).attrs.colwidth).toEqual([200]);
        expect(row.child(2).attrs.colwidth).toEqual([300]);
      });

      editor.converter = originalConverter;
    });
  });

  describe('insertTableAt trailing separator paragraph', () => {
    it('inserts table followed by a trailing paragraph', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      const pos = editor.state.doc.content.size;
      editor.commands.insertTableAt({ pos, rows: 2, columns: 2 });

      const doc = editor.state.doc;
      let foundTable = false;
      let nodeAfterTable = null;
      for (let i = 0; i < doc.childCount; i++) {
        if (doc.child(i).type.name === 'table' && !foundTable) {
          foundTable = true;
          if (i + 1 < doc.childCount) {
            nodeAfterTable = doc.child(i + 1);
          }
        }
      }

      expect(foundTable).toBe(true);
      expect(nodeAfterTable).not.toBeNull();
      expect(nodeAfterTable.type.name).toBe('paragraph');
    });

    it('does not insert separator when table is placed between paragraphs', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      // Insert some text so we have paragraphs in the doc
      editor.commands.insertContent('Hello');
      editor.commands.splitBlock();
      editor.commands.insertContent('World');

      const docBefore = editor.state.doc;
      // Find position between the two paragraphs (after first paragraph)
      const firstParaEnd = docBefore.child(0).nodeSize;

      editor.commands.insertTableAt({ pos: firstParaEnd, rows: 2, columns: 2 });

      const doc = editor.state.doc;
      // The table should be at index 1 (between the two paragraphs)
      // There should NOT be an extra separator paragraph injected
      let tableCount = 0;
      let paragraphCount = 0;
      for (let i = 0; i < doc.childCount; i++) {
        if (doc.child(i).type.name === 'table') tableCount++;
        if (doc.child(i).type.name === 'paragraph') paragraphCount++;
      }

      expect(tableCount).toBe(1);
      // Original 2 paragraphs, no extra separator
      expect(paragraphCount).toBe(2);
    });

    it('removes both table and separator paragraph on single undo', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      const docBefore = editor.state.doc;
      const pos = editor.state.doc.content.size;
      editor.commands.insertTableAt({ pos, rows: 2, columns: 2 });

      editor.commands.undo();

      expect(editor.state.doc.toJSON()).toEqual(docBefore.toJSON());
    });

    it('creates row paraIds without assigning legacy table or cell paraIds', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      const pos = editor.state.doc.content.size;
      editor.commands.insertTableAt({ pos, rows: 2, columns: 2 });

      const tablePos = findTablePos(editor.state.doc);
      expect(tablePos).not.toBeNull();

      const table = editor.state.doc.nodeAt(tablePos);
      expect(table?.attrs.paraId).toBeNull();

      table?.forEach((row) => {
        expect(row.attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
        row.forEach((cell) => {
          expect(cell.attrs.paraId).toBeNull();
        });
      });
    });
  });

  describe('insertTable trailing separator paragraph', () => {
    it('inserts table followed by a trailing paragraph when inserted at document end', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      editor.commands.insertTable({ rows: 2, cols: 2 });

      const doc = editor.state.doc;
      let foundTable = false;
      let nodeAfterTable = null;
      for (let i = 0; i < doc.childCount; i++) {
        if (doc.child(i).type.name === 'table' && !foundTable) {
          foundTable = true;
          if (i + 1 < doc.childCount) {
            nodeAfterTable = doc.child(i + 1);
          }
        }
      }

      expect(foundTable).toBe(true);
      expect(nodeAfterTable).not.toBeNull();
      expect(nodeAfterTable.type.name).toBe('paragraph');
    });

    it('places the selection in the first table cell after insertion', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      editor.commands.insertTable({ rows: 2, cols: 2 });

      const tablePos = findTablePos(editor.state.doc);
      const table = editor.state.doc.nodeAt(tablePos);
      const map = TableMap.get(table);
      const firstCellTextPos = tablePos + 1 + map.map[0] + 2;

      const { $from } = editor.state.selection;
      expect(editor.state.selection.from).toBe(firstCellTextPos);
      expect($from.parent.type.name).toBe('paragraph');
      expect($from.node($from.depth - 1).type.spec.tableRole).toBe('cell');
    });

    it('places the selection in the first table cell when sep.before is true', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      // Insert a first table — produces [table, paragraph]
      editor.commands.insertTable({ rows: 2, cols: 2 });

      // The cursor is now inside the first table cell. Move it to the
      // trailing empty paragraph so the next insertTable triggers sep.before.
      const doc = editor.state.doc;
      const lastChild = doc.child(doc.childCount - 1);
      expect(lastChild.type.name).toBe('paragraph');
      const trailingParaPos = doc.content.size - lastChild.nodeSize + 1;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(doc.resolve(trailingParaPos))));

      // Insert a second table from the trailing paragraph (previous sibling is a table → sep.before = true)
      editor.commands.insertTable({ rows: 2, cols: 2 });

      // Find the SECOND table
      let tableCount = 0;
      let secondTablePos = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table') {
          tableCount++;
          if (tableCount === 2) {
            secondTablePos = pos;
            return false;
          }
        }
        return true;
      });
      expect(secondTablePos).not.toBeNull();

      const secondTable = editor.state.doc.nodeAt(secondTablePos);
      const map = TableMap.get(secondTable);
      const expectedPos = secondTablePos + 1 + map.map[0] + 2;

      const { $from } = editor.state.selection;
      expect(editor.state.selection.from).toBe(expectedPos);
      expect($from.parent.type.name).toBe('paragraph');
      expect($from.node($from.depth - 1).type.spec.tableRole).toBe('cell');
    });

    it('replaces the initial empty paragraph instead of keeping it before the table', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      editor.commands.insertTable({ rows: 2, cols: 2 });

      expect(editor.state.doc.child(0).type.name).toBe('table');
      expect(editor.state.doc.child(1).type.name).toBe('paragraph');
      expect(editor.state.doc.childCount).toBe(2);
    });

    it('does not throw when insertTable is called with a NodeSelection on a top-level block', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      // Insert a documentSection (atom: true, group: 'block') to get a
      // selectable top-level block node. When selected as a NodeSelection,
      // $from.depth is 0 and $from.end() returns doc.content.size, which
      // previously caused insertTable to compute an out-of-range offset.
      const { schema } = editor.state;
      const sectionNode = schema.nodes.documentSection.create(null, [schema.nodes.paragraph.create()]);
      const { tr } = editor.state;
      const insertPos = tr.selection.$from.before(1);
      tr.insert(insertPos, sectionNode);
      tr.setSelection(NodeSelection.create(tr.doc, insertPos));
      editor.view.dispatch(tr);

      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect(editor.state.selection.$from.depth).toBe(0);

      // Inserting a table while a top-level node is selected should not throw
      expect(() => editor.commands.insertTable({ rows: 2, cols: 2 })).not.toThrow();

      // Verify a table was actually inserted
      const tablePos = findTablePos(editor.state.doc);
      expect(tablePos).not.toBeNull();

      // Verify the cursor is inside the first table cell
      const table = editor.state.doc.nodeAt(tablePos);
      const map = TableMap.get(table);
      const firstCellTextPos = tablePos + 1 + map.map[0] + 2;

      const { $from } = editor.state.selection;
      expect(editor.state.selection.from).toBe(firstCellTextPos);
      expect($from.parent.type.name).toBe('paragraph');
      expect($from.node($from.depth - 1).type.spec.tableRole).toBe('cell');
    });

    it('inserts the table inside a selected structuredContentBlock instead of creating a sibling block', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      const { schema } = editor.state;
      const emptyParagraph = schema.nodes.paragraph.create();
      const sdt = schema.nodes.structuredContentBlock.create({ id: '1001', tag: 'block_table_sdt' }, [emptyParagraph]);
      const doc = schema.nodes.doc.create(null, [sdt]);
      editor.setState(EditorState.create({ schema, doc, plugins: editor.state.plugins }));

      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
      editor.commands.insertTable({ rows: 2, cols: 2 });

      expect(editor.state.doc.childCount).toBe(1);
      expect(editor.state.doc.child(0).type.name).toBe('structuredContentBlock');

      const insertedSdt = editor.state.doc.child(0);
      expect(insertedSdt.childCount).toBe(1);
      expect(insertedSdt.child(0).type.name).toBe('table');
    });

    it('inserts the table inside structuredContentBlock content for text selections', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      const { schema } = editor.state;
      const paragraph = schema.nodes.paragraph.create(null, schema.text('Hello'));
      const sdt = schema.nodes.structuredContentBlock.create({ id: '1002', tag: 'block_table_sdt' }, [paragraph]);
      const doc = schema.nodes.doc.create(null, [sdt]);
      editor.setState(EditorState.create({ schema, doc, plugins: editor.state.plugins }));

      const textSelection = TextSelection.create(editor.state.doc, 2, 7);
      editor.view.dispatch(editor.state.tr.setSelection(textSelection));

      editor.commands.insertTable({ rows: 2, cols: 2 });

      expect(editor.state.doc.childCount).toBe(1);
      expect(editor.state.doc.child(0).type.name).toBe('structuredContentBlock');

      const insertedSdt = editor.state.doc.child(0);
      expect(insertedSdt.childCount).toBe(2);
      expect(insertedSdt.child(0).type.name).toBe('paragraph');
      expect(insertedSdt.child(1).type.name).toBe('table');
    });

    it('places cursor in first cell and adds trailing paragraph when inserting table with AllSelection', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      // Type some text so the paragraph is non-empty (simulates a real document)
      editor.commands.insertContent('This is a test');

      // Select all content (Ctrl+A equivalent)
      editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
      expect(editor.state.selection).toBeInstanceOf(AllSelection);

      // Insert a table while everything is selected
      editor.commands.insertTable({ rows: 2, cols: 2 });

      // The table should be followed by a trailing separator paragraph
      const doc = editor.state.doc;
      const tablePos = findTablePos(doc);
      expect(tablePos).not.toBeNull();
      const table = doc.nodeAt(tablePos);
      const tableEndPos = tablePos + table.nodeSize;
      const $afterTable = doc.resolve(tableEndPos);
      const nodeAfterTable = $afterTable.nodeAfter;
      expect(nodeAfterTable?.type.name).toBe('paragraph');

      // The cursor should be in the first table cell, not the last
      const map = TableMap.get(table);
      const firstCellTextPos = tablePos + 1 + map.map[0] + 2;

      const { $from } = editor.state.selection;
      expect(editor.state.selection.from).toBe(firstCellTextPos);
      expect($from.parent.type.name).toBe('paragraph');
      expect($from.node($from.depth - 1).type.spec.tableRole).toBe('cell');
    });
  });

  describe('normalizeNewTableAttrs tblLook (SD-2086)', async () => {
    it('includes DEFAULT_TBL_LOOK in tableProperties when a style is resolved', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      // Inject a style catalog with TableGrid so the styled path is taken
      const originalConverter = editor.converter;
      editor.converter = {
        ...originalConverter,
        translatedLinkedStyles: {
          styles: { TableGrid: { type: 'table' } },
          docDefaults: {},
          latentStyles: {},
        },
      };

      const result = normalizeNewTableAttrs(editor);
      expect(result.tableProperties?.tblLook).toEqual(DEFAULT_TBL_LOOK);

      editor.converter = originalConverter;
    });

    it('does not include tblLook when source is "none" (unstyled table)', async () => {
      const { docx, media, mediaFiles, fonts } = cachedBlankDoc;
      ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

      // Override converter to simulate no styles available
      const originalConverter = editor.converter;
      editor.converter = { translatedLinkedStyles: { styles: {} } };

      const result = normalizeNewTableAttrs(editor);
      expect(result.tableStyleId).toBeNull();
      expect(result.tableProperties?.tblLook).toBeUndefined();

      editor.converter = originalConverter;
    });
  });
});
