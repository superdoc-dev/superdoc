// @ts-check
/**
 * Verify whether dryRun for setCellText still reports NO_OP for unchanged
 * input. The round-3 refactor moved the NO_OP detection BELOW the dryRun
 * early-return, so dryRun now returns success even when a live call would
 * be a NO_OP. This is a behavior regression for callers using dryRun to
 * preview whether an op would be a no-op.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

let docxData;

beforeAll(async () => {
  docxData = await loadTestDataForEditorTests('blank-doc.docx');
});

describe('tables.setCellText dryRun NO_OP', () => {
  it('reports NO_OP under dryRun when the cell already contains the same text', () => {
    const { editor } = initTestEditor({
      content: docxData.docx,
      media: docxData.media,
      mediaFiles: docxData.mediaFiles,
      fonts: docxData.fonts,
      element: null,
    });

    editor.commands.insertTableAt({ pos: editor.state.doc.content.size, rows: 1, columns: 1 });
    let tableId = null;
    editor.state.doc.descendants((node) => {
      if (tableId) return false;
      if (node.type.name !== 'table') return true;
      tableId = node.attrs?.sdBlockId;
      return false;
    });
    expect(tableId).toBeTruthy();

    // Plant 'hi' in the cell.
    const planted = editor.doc.tables.setCellText({
      target: { kind: 'block', nodeType: 'table', nodeId: tableId },
      rowIndex: 0,
      columnIndex: 0,
      text: 'hi',
    });
    expect(planted.success).toBe(true);

    // Re-resolve table id post-mutation.
    let liveTableId = null;
    editor.state.doc.descendants((n) => {
      if (liveTableId) return false;
      if (n.type.name !== 'table') return true;
      liveTableId = n.attrs?.sdBlockId;
      return false;
    });

    // Live setCellText('hi') against the same cell -> NO_OP (this works).
    const liveResult = editor.doc.tables.setCellText({
      target: { kind: 'block', nodeType: 'table', nodeId: liveTableId },
      rowIndex: 0,
      columnIndex: 0,
      text: 'hi',
    });

    // Dry-run setCellText('hi') against the same cell -> should ALSO report NO_OP.
    const dryResult = editor.doc.tables.setCellText(
      {
        target: { kind: 'block', nodeType: 'table', nodeId: liveTableId },
        rowIndex: 0,
        columnIndex: 0,
        text: 'hi',
      },
      { dryRun: true },
    );

    // eslint-disable-next-line no-console
    console.log('[setCellText dryRun NO_OP probe]', {
      liveResult,
      dryResult,
    });

    // Live should NO_OP.
    expect(liveResult?.success).toBe(false);
    expect(liveResult?.failure?.code).toBe('NO_OP');

    // DryRun should ALSO NO_OP - the result must match what the live call
    // would produce. Otherwise dryRun is a misleading preview.
    expect(dryResult?.success, 'dryRun should report NO_OP, matching live result').toBe(false);
    expect(dryResult?.failure?.code).toBe('NO_OP');
  });
});
