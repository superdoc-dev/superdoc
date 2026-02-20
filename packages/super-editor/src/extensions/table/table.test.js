import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { createTable } from './tableHelpers/createTable.js';
import { promises as fs } from 'fs';

// Cache DOCX data to avoid repeated file loading
let cachedBlankDoc = null;
let cachedBordersDoc = null;

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

  describe('deleteCellAndTableBorders', async () => {
    let table, tablePos;

    const sharedTests = async () => {
      it('removes all borders on the table', async () => {
        // Expect table cell borders to be removed
        table.children.forEach((tableRow) => {
          tableRow.children.forEach((tableCell) => {
            expect(tableCell.attrs.borders).toEqual(
              Object.assign(
                {},
                ...['top', 'left', 'bottom', 'right'].map((side) => ({
                  [side]: {
                    color: 'auto',
                    size: 0,
                    space: 0,
                    val: 'none',
                  },
                })),
              ),
            );
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
                expect(tcBorders.elements).toEqual(
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
  });
});
