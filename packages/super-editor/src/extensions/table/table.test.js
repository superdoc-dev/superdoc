import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { createTable } from './tableHelpers/createTable.js';
import { promises as fs } from 'fs';

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

  const setupTestTable = async () => {
    let { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
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
        let { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('SD-978-remove-table-borders.docx');
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
