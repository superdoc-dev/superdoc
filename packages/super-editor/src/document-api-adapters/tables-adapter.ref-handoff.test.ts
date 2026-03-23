/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';
import {
  createTableAdapter,
  tablesMoveAdapter,
  tablesSetBorderAdapter,
  tablesInsertColumnAdapter,
  tablesMergeCellsAdapter,
  tablesSetCellSpacingAdapter,
  tablesSetShadingAdapter,
  tablesGetCellsAdapter,
} from './tables-adapter.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

const DIRECT = { changeMode: 'direct' } as const;

function requireTableNodeId(result: { success: boolean; table?: { nodeId?: string } }, label: string): string {
  if (!result.success) {
    throw new Error(`${label} failed: expected success.`);
  }
  const nodeId = (result as { table?: { nodeId?: string } }).table?.nodeId;
  if (!nodeId) {
    throw new Error(`${label}: expected result.table.nodeId to be defined.`);
  }
  return nodeId;
}

describe('SD-2126: post-mutation table ref handoff', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  function createEditor(): Editor {
    const result = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    });
    editor = result.editor;
    return editor;
  }

  it('chains create → setBorder → insertColumn → mergeCells → setCellSpacing without find()', () => {
    const ed = createEditor();

    // Step 1: create.table
    const createResult = createTableAdapter(ed, { rows: 3, columns: 3, at: { kind: 'documentEnd' } }, DIRECT);
    const id1 = requireTableNodeId(createResult, 'create.table');

    // Step 2: setBorder using create's ref
    const borderResult = tablesSetBorderAdapter(
      ed,
      { nodeId: id1, edge: 'top', lineStyle: 'single', lineWeightPt: 1, color: '000000' },
      DIRECT,
    );
    const id2 = requireTableNodeId(borderResult, 'tables.setBorder');

    // Step 3: insertColumn using setBorder's ref
    const colResult = tablesInsertColumnAdapter(ed, { nodeId: id2, columnIndex: 0, position: 'right' }, DIRECT);
    const id3 = requireTableNodeId(colResult, 'tables.insertColumn');

    // Step 4: mergeCells using insertColumn's ref
    const mergeResult = tablesMergeCellsAdapter(
      ed,
      { nodeId: id3, start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 0, columnIndex: 1 } },
      DIRECT,
    );
    const id4 = requireTableNodeId(mergeResult, 'tables.mergeCells');

    // Step 5: setCellSpacing using mergeCells' ref
    const spacingResult = tablesSetCellSpacingAdapter(ed, { nodeId: id4, spacingPt: 2 }, DIRECT);
    const id5 = requireTableNodeId(spacingResult, 'tables.setCellSpacing');

    // Final ref should still be resolvable
    expect(id5).toBeTruthy();
  });

  it('returns a resolvable ref for a runtime-created table with volatile sdBlockId', () => {
    const ed = createEditor();

    // Runtime tables get UUID sdBlockId (volatile). The returned nodeId should
    // be the canonical position-based fallback, not the raw UUID.
    const createResult = createTableAdapter(ed, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT);
    const id1 = requireTableNodeId(createResult, 'create.table');

    // Mutate — this changes positions/structure.
    const colResult = tablesInsertColumnAdapter(ed, { nodeId: id1, columnIndex: 0, position: 'right' }, DIRECT);
    const id2 = requireTableNodeId(colResult, 'tables.insertColumn');

    // The returned ref should work for a follow-up operation.
    const borderResult = tablesSetBorderAdapter(
      ed,
      { nodeId: id2, edge: 'bottom', lineStyle: 'single', lineWeightPt: 0.5, color: 'FF0000' },
      DIRECT,
    );
    expect(borderResult.success).toBe(true);
    expect((borderResult as { table?: { nodeId?: string } }).table?.nodeId).toBeTruthy();
  });

  it('cell-targeted setBorder returns the parent table ref', () => {
    const ed = createEditor();

    // Create a table and find a cell to target.
    const createResult = createTableAdapter(ed, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT);
    expect(createResult.success).toBe(true);

    // Find a cell nodeId via tablesGetCellsAdapter.
    const tableNodeId = requireTableNodeId(createResult, 'create.table');
    const cellsResult = tablesGetCellsAdapter(ed, { nodeId: tableNodeId });
    expect(cellsResult.cells.length).toBeGreaterThan(0);
    const cellNodeId = cellsResult.cells[0]!.nodeId;
    expect(cellNodeId).toBeTruthy();

    // Target the cell with setBorder.
    const borderResult = tablesSetBorderAdapter(
      ed,
      { nodeId: cellNodeId!, edge: 'top', lineStyle: 'single', lineWeightPt: 1, color: '000000' },
      DIRECT,
    );

    expect(borderResult.success).toBe(true);
    // Cell-targeted border/shading ops return the follow-up table ref.
    const table = (borderResult as { table?: { nodeType?: string } }).table;
    expect(table?.nodeType).toBe('table');
  });

  it('cell address from getCells is accepted as target in a follow-up mutation', () => {
    const ed = createEditor();

    const createResult = createTableAdapter(ed, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT);
    const tableNodeId = requireTableNodeId(createResult, 'create.table');
    const cellsResult = tablesGetCellsAdapter(ed, { nodeId: tableNodeId });
    const firstCell = cellsResult.cells[0]!;

    // Use the cell's address (not its flat nodeId) as the mutation target.
    const borderResult = tablesSetBorderAdapter(
      ed,
      { target: firstCell.address, edge: 'top', lineStyle: 'single', lineWeightPt: 1, color: '000000' },
      DIRECT,
    );

    expect(borderResult.success).toBe(true);
  });

  it('tables.move returns a chainable ref after relocating the table', () => {
    const ed = createEditor();

    // Create two tables so there is a meaningful destination.
    createTableAdapter(ed, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT);
    const createResult2 = createTableAdapter(ed, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT);
    const tableId = requireTableNodeId(createResult2, 'create.table (second)');

    // Move the second table to the document start.
    const moveResult = tablesMoveAdapter(ed, { nodeId: tableId, destination: { kind: 'documentStart' } }, DIRECT);
    const movedId = requireTableNodeId(moveResult, 'tables.move');

    // The returned ref should be usable for a follow-up mutation.
    const borderResult = tablesSetBorderAdapter(
      ed,
      { nodeId: movedId, edge: 'top', lineStyle: 'single', lineWeightPt: 1, color: '000000' },
      DIRECT,
    );
    expect(borderResult.success).toBe(true);
    expect((borderResult as { table?: { nodeId?: string } }).table?.nodeId).toBeTruthy();
  });

  it('every in-scope mutation returns a defined table ref (invariant check)', () => {
    const ed = createEditor();

    const createResult = createTableAdapter(ed, { rows: 3, columns: 3, at: { kind: 'documentEnd' } }, DIRECT);
    const id = requireTableNodeId(createResult, 'create.table');

    // setBorder (table-targeted)
    const r1 = tablesSetBorderAdapter(
      ed,
      { nodeId: id, edge: 'top', lineStyle: 'single', lineWeightPt: 1, color: '000000' },
      DIRECT,
    );
    expect(r1.success).toBe(true);
    expect((r1 as { table?: unknown }).table).toBeDefined();

    const id2 = requireTableNodeId(r1, 'setBorder');

    // insertColumn
    const r2 = tablesInsertColumnAdapter(ed, { nodeId: id2, columnIndex: 0, position: 'right' }, DIRECT);
    expect(r2.success).toBe(true);
    expect((r2 as { table?: unknown }).table).toBeDefined();

    const id3 = requireTableNodeId(r2, 'insertColumn');

    // mergeCells
    const r3 = tablesMergeCellsAdapter(
      ed,
      { nodeId: id3, start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 0, columnIndex: 1 } },
      DIRECT,
    );
    expect(r3.success).toBe(true);
    expect((r3 as { table?: unknown }).table).toBeDefined();

    const id4 = requireTableNodeId(r3, 'mergeCells');

    // setCellSpacing
    const r4 = tablesSetCellSpacingAdapter(ed, { nodeId: id4, spacingPt: 2 }, DIRECT);
    expect(r4.success).toBe(true);
    expect((r4 as { table?: unknown }).table).toBeDefined();

    const id5 = requireTableNodeId(r4, 'setCellSpacing');

    // setShading (table-targeted)
    const r5 = tablesSetShadingAdapter(ed, { nodeId: id5, color: 'CCCCCC' }, DIRECT);
    expect(r5.success).toBe(true);
    expect((r5 as { table?: unknown }).table).toBeDefined();
  });
});
