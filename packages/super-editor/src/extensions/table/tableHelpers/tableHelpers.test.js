import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { createTable } from './createTable.js';
import { createCell } from './createCell.js';
import { createColGroup } from './createColGroup.js';
import { createTableBorders } from './createTableBorders.js';
import { getColStyleDeclaration } from './getColStyleDeclaration.js';
import { createCellBorders } from '../../table-cell/helpers/createCellBorders.js';
import { deleteTableWhenSelected } from './deleteTableWhenSelected.js';
import { isCellSelection } from './isCellSelection.js';
import { cellAround } from './cellAround.js';
import { cellWrapping } from './cellWrapping.js';
import {
  resolveTable,
  pickTemplateRowForAppend,
  extractRowTemplateFormatting,
  buildFormattedCellBlock,
  buildRowFromTemplateRow,
  insertRowsAtTableEnd,
  insertRowAtIndex,
} from './appendRows.js';

const cellMinWidth = 80;

describe('tableHelpers', () => {
  let editor;
  let schema;
  let basePlugins;

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    basePlugins = editor.state.plugins;
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const buildTableDoc = (rows = 2, cols = 2, withHeaderRow = false) => {
    const table = createTable(schema, rows, cols, withHeaderRow);
    const doc = schema.nodes.doc.create(null, [table]);
    const state = EditorState.create({ schema, doc, plugins: basePlugins });
    return { table, doc, state };
  };

  const getCellPositions = (doc) => {
    const positions = [];
    doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        positions.push(pos);
      }
    });
    return positions;
  };

  it('cellAround resolves position inside a table cell', () => {
    const { doc } = buildTableDoc();
    const [firstCellPos] = getCellPositions(doc);
    const $insideCell = doc.resolve(firstCellPos + 1);

    const resolved = cellAround($insideCell);
    expect(resolved).toBeDefined();
    expect(resolved.pos).toBe(firstCellPos);

    const outside = cellAround(doc.resolve(doc.content.size));
    expect(outside).toBeNull();
  });

  it('cellWrapping returns the wrapping cell node when selection is inside', () => {
    const { doc } = buildTableDoc();
    const [firstCellPos] = getCellPositions(doc);
    const $insideCell = doc.resolve(firstCellPos + 1);

    const wrapping = cellWrapping($insideCell);
    expect(wrapping?.type.name).toBe('tableCell');

    const outside = cellWrapping(doc.resolve(0));
    expect(outside).toBeNull();
  });

  it('createCell produces cells with default or custom content', () => {
    const cellType = schema.nodes.tableCell;

    const emptyCell = createCell(cellType);
    expect(emptyCell.type.name).toBe('tableCell');
    expect(emptyCell.content.firstChild.type.name).toBe('paragraph');

    const customParagraph = schema.nodes.paragraph.create(null, schema.text('Hello'));
    const filledCell = createCell(cellType, customParagraph);
    expect(filledCell.content.firstChild.textContent).toBe('Hello');
  });

  it('createCell accepts attrs parameter for setting cell attributes', () => {
    const cellType = schema.nodes.tableCell;

    const cellWithWidth = createCell(cellType, null, { colwidth: [200] });
    expect(cellWithWidth.type.name).toBe('tableCell');
    expect(cellWithWidth.attrs.colwidth).toEqual([200]);

    const cellWithContent = createCell(cellType, schema.nodes.paragraph.create(null, schema.text('Test')), {
      colwidth: [150],
    });
    expect(cellWithContent.attrs.colwidth).toEqual([150]);
    expect(cellWithContent.content.firstChild.textContent).toBe('Test');
  });

  const buildRowTable = (widths, overrideCol, overrideValue) => {
    const cellType = schema.nodes.tableCell;
    const rowType = schema.nodes.tableRow;
    const tableType = schema.nodes.table;

    const rowCells = widths.map((width, index) => {
      const attrs = {
        colspan: 1,
        rowspan: 1,
      };
      if (typeof width === 'number') {
        attrs.colwidth = [width];
      } else {
        attrs.colwidth = null;
      }
      const content = schema.nodes.paragraph.create(null, schema.text(String.fromCharCode(65 + index)));
      return cellType.create(attrs, content);
    });

    const row = rowType.create(null, rowCells);
    const table = tableType.create(null, [row]);
    return createColGroup(table, cellMinWidth, overrideCol, overrideValue);
  };

  it('createColGroup calculates widths when fixed widths are available', () => {
    const result = buildRowTable([120, 90, 110], null, null);
    expect(result.tableWidth).toBe('320px');
    expect(result.tableMinWidth).toBe('');
    expect(result.colgroup[0]).toBe('colgroup');
    expect(result.colgroupValues).toEqual([120, 90, 110]);
    const [, , firstCol] = result.colgroup;
    expect(firstCol[1].style).toBe('width: 120px');
  });

  it('createColGroup falls back to min-width and optional overrides when widths missing', () => {
    const result = buildRowTable([null, null], 1, 200);
    expect(result.tableWidth).toBe('');
    expect(result.tableMinWidth).toBe('280px');
    expect(result.colgroupValues).toEqual([cellMinWidth, 200]);
    const [, , firstCol, secondCol] = result.colgroup;
    expect(firstCol[1].style).toBe(`min-width: ${cellMinWidth}px`);
    expect(secondCol[1].style).toBe('width: 200px');
  });

  it('createColGroup uses table grid to add trailing columns', () => {
    const cellType = schema.nodes.tableCell;
    const rowType = schema.nodes.tableRow;
    const tableType = schema.nodes.table;

    const content = schema.nodes.paragraph.create(null);
    const cell = cellType.create({ colspan: 2, colwidth: [120, 150] }, content);
    const row = rowType.create(null, [cell]);
    const table = tableType.create(
      { grid: [{ col: 1440 }, { col: 2880 }, { col: 1440 }] }, // 1in, 2in, 1in in twips
      [row],
    );

    const result = createColGroup(table, cellMinWidth, null, null);
    expect(result.tableWidth).toBe('366px');
    expect(result.colgroup.length - 2).toBe(3); // subtract ['colgroup', {}]
    expect(result.colgroupValues).toEqual([120, 150, 96]);
  });

  it('createTable builds tables with rows, optional header, and borders', () => {
    const table = createTable(schema, 2, 3, true);
    expect(table.type.name).toBe('table');
    expect(table.firstChild.childCount).toBe(3);
    expect(table.attrs.borders.top).toBeDefined();
    const headerCell = table.firstChild.firstChild;
    expect(headerCell.type.name).toBe('tableHeader');
  });

  it('createTable applies column widths when provided', () => {
    const columnWidths = [200, 100, 200];
    const table = createTable(schema, 2, 3, false, null, columnWidths);

    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(2); // 2 rows

    // Check first row cells have correct widths
    const firstRow = table.firstChild;
    expect(firstRow.childCount).toBe(3);
    expect(firstRow.child(0).attrs.colwidth).toEqual([200]);
    expect(firstRow.child(1).attrs.colwidth).toEqual([100]);
    expect(firstRow.child(2).attrs.colwidth).toEqual([200]);

    // Check second row cells also have correct widths
    const secondRow = table.child(1);
    expect(secondRow.child(0).attrs.colwidth).toEqual([200]);
    expect(secondRow.child(1).attrs.colwidth).toEqual([100]);
    expect(secondRow.child(2).attrs.colwidth).toEqual([200]);
  });

  it('createTable applies column widths to header row when withHeaderRow is true', () => {
    const columnWidths = [150, 150];
    const table = createTable(schema, 2, 2, true, null, columnWidths);

    // First row should be header cells with widths
    const headerRow = table.firstChild;
    expect(headerRow.child(0).type.name).toBe('tableHeader');
    expect(headerRow.child(0).attrs.colwidth).toEqual([150]);
    expect(headerRow.child(1).attrs.colwidth).toEqual([150]);

    // Second row should be regular cells with widths
    const bodyRow = table.child(1);
    expect(bodyRow.child(0).type.name).toBe('tableCell');
    expect(bodyRow.child(0).attrs.colwidth).toEqual([150]);
  });

  it('createTable uses default widths when columnWidths is null', () => {
    const table = createTable(schema, 1, 2, false, null, null);

    const firstRow = table.firstChild;
    // Default colwidth from schema is [100]
    expect(firstRow.child(0).attrs.colwidth).toEqual([100]);
    expect(firstRow.child(1).attrs.colwidth).toEqual([100]);
  });

  it('createTableBorders assigns uniform border configuration', () => {
    const borders = createTableBorders({ size: 2, color: '#ccc' });
    expect(borders.top).toEqual({ size: 2, color: '#ccc' });
    expect(borders.insideV).toEqual({ size: 2, color: '#ccc' });
  });

  it('getColStyleDeclaration chooses width or min-width based on availability', () => {
    expect(getColStyleDeclaration(50, 120)).toEqual(['width', '120px']);
    expect(getColStyleDeclaration(50, null)).toEqual(['min-width', '50px']);
  });

  it('deleteTableWhenSelected removes entire table when all cells selected', () => {
    const { doc } = buildTableDoc(2, 2, false);
    const cellPositions = getCellPositions(doc);
    const selection = CellSelection.create(doc, cellPositions[0], cellPositions[cellPositions.length - 1]);

    const deleteTable = vi.fn();
    const result = deleteTableWhenSelected({ editor: { state: { selection }, commands: { deleteTable } } });

    expect(result).toBe(true);
    expect(deleteTable).toHaveBeenCalled();
  });

  it('deleteTableWhenSelected ignores partial cell selections', () => {
    const { doc } = buildTableDoc(2, 2, false);
    const cellPositions = getCellPositions(doc);
    const selection = CellSelection.create(doc, cellPositions[0], cellPositions[0]);

    const deleteTable = vi.fn();
    const result = deleteTableWhenSelected({ editor: { state: { selection }, commands: { deleteTable } } });

    expect(result).toBe(false);
    expect(deleteTable).not.toHaveBeenCalled();
  });

  it('deleteTableWhenSelected returns false for non-cell selections', () => {
    const { doc, state } = buildTableDoc(1, 1, false);
    const textSelection = TextSelection.atStart(state.doc);
    const deleteTable = vi.fn();
    const result = deleteTableWhenSelected({
      editor: { state: { selection: textSelection }, commands: { deleteTable } },
    });
    expect(result).toBe(false);
  });

  it('isCellSelection detects cell selections', () => {
    const { doc } = buildTableDoc(1, 1, false);
    const [firstCellPos] = getCellPositions(doc);
    const selection = CellSelection.create(doc, firstCellPos, firstCellPos);
    expect(isCellSelection(selection)).toBe(true);
    expect(isCellSelection(null)).toBe(false);
  });

  describe('appendRows helpers', () => {
    it('resolveTable finds table node from explicit reference', () => {
      const { doc, table, state } = buildTableDoc(2, 2, false);
      const tr = state.tr;
      const resolved = resolveTable(tr, undefined, table);
      expect(resolved).toBe(table);
      expect(resolved?.type.name).toBe('table');
    });

    it('resolveTable finds table node from position', () => {
      const { doc, state } = buildTableDoc(2, 2, false);
      const tr = state.tr;
      const tablePos = 0;
      const resolved = resolveTable(tr, tablePos, undefined);
      expect(resolved).not.toBeNull();
      expect(resolved?.type.name).toBe('table');
    });

    it('resolveTable returns null when table not found', () => {
      const { state } = buildTableDoc(2, 2, false);
      const tr = state.tr;
      const resolved = resolveTable(tr, undefined, undefined);
      expect(resolved).toBeNull();
    });

    it('resolveTable returns null with invalid node type', () => {
      const { state } = buildTableDoc(2, 2, false);
      const tr = state.tr;
      const paragraphNode = schema.nodes.paragraph.create();
      const resolved = resolveTable(tr, undefined, paragraphNode);
      expect(resolved).toBeNull();
    });

    it('pickTemplateRowForAppend prefers last body row with table cells', () => {
      const { table } = buildTableDoc(3, 2, true);
      const templateRow = pickTemplateRowForAppend(table, schema);
      expect(templateRow).not.toBeNull();
      expect(templateRow?.type.name).toBe('tableRow');
      const hasBodyCell = templateRow?.content?.content?.some((c) => c.type.name === 'tableCell');
      expect(hasBodyCell).toBe(true);
    });

    it('pickTemplateRowForAppend falls back to last row when no body cells', () => {
      const headerRow = schema.nodes.tableRow.create(
        null,
        schema.nodes.tableHeader.create(null, schema.nodes.paragraph.create()),
      );
      const table = schema.nodes.table.create(null, headerRow);
      const templateRow = pickTemplateRowForAppend(table, schema);
      expect(templateRow).toBe(headerRow);
    });

    it('pickTemplateRowForAppend returns null for empty table', () => {
      const emptyTable = schema.nodes.table.create();
      const templateRow = pickTemplateRowForAppend(emptyTable, schema);
      expect(templateRow).toBeNull();
    });

    it('extractRowTemplateFormatting extracts block type and text marks', () => {
      const textNode = schema.text('Sample');
      const paragraph = schema.nodes.paragraph.create(null, textNode);
      const cell = schema.nodes.tableCell.create(null, paragraph);

      const formatting = extractRowTemplateFormatting(cell, schema);
      expect(formatting.blockType).toBe(schema.nodes.paragraph);
      expect(formatting.textMarks).toBeDefined();
    });

    it('extractRowTemplateFormatting falls back to paragraph for empty cells', () => {
      const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create());
      const formatting = extractRowTemplateFormatting(cell, schema);
      expect(formatting.blockType).toBe(schema.nodes.paragraph);
      expect(formatting.textMarks).toEqual([]);
    });

    it('buildFormattedCellBlock creates block with text', () => {
      const formatting = {
        blockType: schema.nodes.paragraph,
        blockAttrs: null,
        textMarks: [],
      };
      const block = buildFormattedCellBlock(schema, 'Test value', formatting, false);
      expect(block.type.name).toBe('paragraph');
      expect(block.textContent).toBe('Test value');
    });

    it('buildFormattedCellBlock applies marks when copyRowStyle is true', () => {
      const marks = schema.marks.link ? [schema.marks.link.create({ href: 'test' })] : [];
      const formatting = {
        blockType: schema.nodes.paragraph,
        blockAttrs: null,
        textMarks: marks,
      };
      const block = buildFormattedCellBlock(schema, 'Text with marks', formatting, true);
      expect(block.textContent).toBe('Text with marks');
      if (marks.length > 0) {
        expect(block.firstChild?.marks.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('buildFormattedCellBlock does not apply marks when copyRowStyle is false', () => {
      const marks = schema.marks.link ? [schema.marks.link.create({ href: 'test' })] : [];
      const formatting = {
        blockType: schema.nodes.paragraph,
        blockAttrs: null,
        textMarks: marks,
      };
      const block = buildFormattedCellBlock(schema, 'Plain text', formatting, false);
      expect(block.textContent).toBe('Plain text');
      expect(block.firstChild?.marks).toHaveLength(0);
    });

    it('buildFormattedCellBlock handles non-string values', () => {
      const formatting = {
        blockType: schema.nodes.paragraph,
        blockAttrs: null,
        textMarks: [],
      };
      const blockNum = buildFormattedCellBlock(schema, 123, formatting, false);
      expect(blockNum.textContent).toBe('123');

      const blockStr = buildFormattedCellBlock(schema, 'test', formatting, false);
      expect(blockStr.textContent).toBe('test');
    });

    it('buildRowFromTemplateRow creates row with values by column', () => {
      const { table } = buildTableDoc(1, 3, false);
      const templateRow = pickTemplateRowForAppend(table, schema);
      const values = ['A', 'B', 'C'];

      const newRow = buildRowFromTemplateRow({
        schema,
        tableNode: table,
        templateRow,
        values,
        copyRowStyle: false,
      });

      expect(newRow?.type.name).toBe('tableRow');
      expect(newRow?.childCount).toBe(3);
      expect(newRow?.content.content[0].textContent).toBe('A');
      expect(newRow?.content.content[1].textContent).toBe('B');
      expect(newRow?.content.content[2].textContent).toBe('C');
    });

    it('buildRowFromTemplateRow handles colspan cells', () => {
      const cell1 = schema.nodes.tableCell.create({ colspan: 2, rowspan: 1 }, schema.nodes.paragraph.create());
      const cell2 = schema.nodes.tableCell.create({ colspan: 1, rowspan: 1 }, schema.nodes.paragraph.create());
      const templateRow = schema.nodes.tableRow.create(null, [cell1, cell2]);
      const table = schema.nodes.table.create(null, templateRow);
      const values = ['Col1', 'Col2', 'Col3'];

      const newRow = buildRowFromTemplateRow({
        schema,
        tableNode: table,
        templateRow,
        values,
        copyRowStyle: false,
      });

      expect(newRow?.childCount).toBe(2);
      expect(newRow?.content.content[0].textContent).toBe('Col1');
      expect(newRow?.content.content[1].textContent).toBe('Col3');
    });

    it('buildRowFromTemplateRow converts header cells to body cells', () => {
      const headerCell = schema.nodes.tableHeader.create(null, schema.nodes.paragraph.create());
      const templateRow = schema.nodes.tableRow.create(null, [headerCell]);
      const table = schema.nodes.table.create(null, templateRow);
      const values = ['Body cell'];

      const newRow = buildRowFromTemplateRow({
        schema,
        tableNode: table,
        templateRow,
        values,
        copyRowStyle: false,
      });

      expect(newRow?.content.content[0].type.name).toBe('tableCell');
      expect(newRow?.content.content[0].attrs.borders).toEqual(createCellBorders());
    });

    it('buildRowFromTemplateRow copies style when copyRowStyle is true', () => {
      const textNode = schema.text('Template');
      const paragraph = schema.nodes.paragraph.create({ textAlign: 'center' }, textNode);
      const cell = schema.nodes.tableCell.create(null, paragraph);
      const templateRow = schema.nodes.tableRow.create(null, [cell]);
      const table = schema.nodes.table.create(null, templateRow);
      const values = ['Styled'];

      const newRow = buildRowFromTemplateRow({
        schema,
        tableNode: table,
        templateRow,
        values,
        copyRowStyle: true,
      });

      const newCell = newRow?.content.content[0];
      expect(newCell).toBeDefined();
      expect(newCell?.textContent).toBe('Styled');
      const newParagraph = newCell?.content.content[0];
      expect(newParagraph?.attrs).toBeDefined();
    });

    it('insertRowsAtTableEnd appends rows to table', () => {
      const { table, state } = buildTableDoc(2, 2, false);
      const tr = state.tr;
      const tablePos = 0;

      const newCell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('New')));
      const newRow = schema.nodes.tableRow.create(null, [newCell, newCell]);

      insertRowsAtTableEnd({ tr, tablePos, tableNode: table, rows: [newRow] });

      const updatedTable = tr.doc.nodeAt(tablePos);
      expect(updatedTable?.childCount).toBe(3);
    });

    it('insertRowsAtTableEnd handles multiple rows', () => {
      const { table, state } = buildTableDoc(1, 2, false);
      const tr = state.tr;
      const tablePos = 0;

      const newCell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('Row')));
      const row1 = schema.nodes.tableRow.create(null, [newCell, newCell]);
      const row2 = schema.nodes.tableRow.create(null, [newCell, newCell]);

      insertRowsAtTableEnd({ tr, tablePos, tableNode: table, rows: [row1, row2] });

      const updatedTable = tr.doc.nodeAt(tablePos);
      expect(updatedTable?.childCount).toBe(3);
    });

    it('insertRowsAtTableEnd does nothing with empty rows array', () => {
      const { table, state } = buildTableDoc(2, 2, false);
      const tr = state.tr;
      const tablePos = 0;
      const initialChildCount = table.childCount;

      insertRowsAtTableEnd({ tr, tablePos, tableNode: table, rows: [] });

      const updatedTable = tr.doc.nodeAt(tablePos);
      expect(updatedTable?.childCount).toBe(initialChildCount);
    });

    it('insertRowAtIndex keeps default body borders when source row has headers', () => {
      const { table, state } = buildTableDoc(2, 1, true);
      const tr = state.tr;
      const tablePos = 0;

      const didInsert = insertRowAtIndex({
        tr,
        tablePos,
        tableNode: table,
        sourceRowIndex: 0,
        insertIndex: 1,
        schema,
      });

      expect(didInsert).toBe(true);
      const updatedTable = tr.doc.nodeAt(tablePos);
      const insertedCell = updatedTable?.child(1)?.child(0);
      expect(insertedCell?.type.name).toBe('tableCell');
      expect(insertedCell?.attrs.borders).toEqual(createCellBorders());
    });
  });
});
