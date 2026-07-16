import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { CellSelection } from 'prosemirror-tables';
import { enumerateStructuralRowChanges } from './structuralRowChanges.js';
import { TrackDeleteMarkName } from '../constants.js';

const ALICE = { name: 'Alice', email: 'alice@example.com' };

const setup = ({ user = ALICE, track = true, content = '<p>Hi there</p>' } = {}) => {
  const { editor } = initTestEditor({
    mode: 'text',
    content,
    user,
    trackedChanges: {},
  });
  if (track) editor.commands.enableTrackChanges();
  return editor;
};

/** Collect all tableRow nodes (with positions) in the editor doc. */
const collectRows = (editor) => {
  const rows = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableRow') rows.push({ node, pos });
  });
  return rows;
};

const countTables = (editor) => {
  let n = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'table') n += 1;
  });
  return n;
};

/** Insert a table at the caret WITHOUT track changes (clean fixture), then turn TC on. */
const editorWithTable = ({ rows = 2, cols = 2, withText = true } = {}) => {
  const editor = setup({ track: false, content: '<p>before</p>' });
  // Place caret at end so the table is appended.
  editor.commands.setTextSelection(editor.state.doc.content.size);
  editor.commands.insertTable({ rows, cols });
  if (withText) {
    // Type some text into the first cell so we exercise cell-text trackDelete.
    // Find first paragraph inside the first cell and set caret there.
    let firstCellTextPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (firstCellTextPos !== null) return false;
      if (node.type.name === 'tableCell') {
        firstCellTextPos = pos + 2; // inside the cell's first paragraph
        return false;
      }
    });
    if (firstCellTextPos !== null) {
      editor.commands.setTextSelection(firstCellTextPos);
      editor.commands.insertContent('CELL');
    }
  }
  editor.commands.enableTrackChanges();
  return editor;
};

/** Put the caret inside the first cell of the (only) table. */
const caretInFirstCell = (editor) => {
  let pos = null;
  editor.state.doc.descendants((node, p) => {
    if (pos !== null) return false;
    if (node.type.name === 'tableCell') {
      pos = p + 2;
      return false;
    }
  });
  if (pos !== null) editor.commands.setTextSelection(pos);
};

describe('authoring: tracked whole-table deletion stamps rowDelete revisions', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('deleteTable() with TC on keeps the table visible and stamps rowDelete on every row', () => {
    editor = editorWithTable({ rows: 2, cols: 2, withText: true });
    caretInFirstCell(editor);

    expect(countTables(editor)).toBe(1);
    const ok = editor.commands.deleteTable();
    expect(ok).toBe(true);

    // The table STILL exists (tracked deletions keep content visible).
    expect(countTables(editor)).toBe(1);

    const rows = collectRows(editor);
    expect(rows.length).toBe(2);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange).toBeTruthy();
      expect(node.attrs.trackChange.type).toBe('rowDelete');
      expect(node.attrs.trackChange.author).toBe(ALICE.name);
      expect(node.attrs.trackChange.authorEmail).toBe(ALICE.email);
      expect(typeof node.attrs.trackChange.id).toBe('string');
      expect(node.attrs.trackChange.id.length).toBeGreaterThan(0);
    });

    // One shared revisionGroupId per table; distinct per-row ids.
    expect(new Set(rows.map((r) => r.node.attrs.trackChange.revisionGroupId)).size).toBe(1);
    expect(new Set(rows.map((r) => r.node.attrs.trackChange.id)).size).toBe(2);

    // Cell text retains its content but gains a trackDelete mark.
    expect(editor.state.doc.textContent).toContain('CELL');
    let foundDeletedCellText = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.text?.includes('CELL')) {
        if (node.marks.some((m) => m.type.name === TrackDeleteMarkName)) foundDeletedCellText = true;
      }
    });
    expect(foundDeletedCellText).toBe(true);

    // Exactly ONE decidable whole-table delete.
    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes.length).toBe(1);
    expect(changes[0].subtype).toBe('table-delete');
    expect(changes[0].side).toBe('deletion');
    expect(changes[0].wholeTable).toBe(true);
    expect(changes[0].decidable).toBe(true);
    expect(changes[0].rows.length).toBe(2);
  });

  it('a MIXED selection (surrounding text + table) deletes without losing content untracked', () => {
    // Deleting a range that spans surrounding text AND a whole table must never
    // drop content untracked. (deleteSelection splits this into per-node steps,
    // so the table portion is a clean whole-table delete and the text a separate
    // inline delete; the mixed-range guard in tryStructuralTableDelete is the
    // safety net for any single combined step.) The invariant we assert is the
    // one that matters: all content survives as tracked, not removed.
    editor = editorWithTable({ rows: 2, cols: 2, withText: true });

    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size });
    editor.commands.deleteSelection();

    // Nothing was dropped untracked — the table and both texts remain visible.
    expect(countTables(editor)).toBe(1);
    expect(editor.state.doc.textContent).toContain('before');
    expect(editor.state.doc.textContent).toContain('CELL');
  });

  it('select-all-cells then Delete (CellSelection) tracks the whole-table deletion', () => {
    editor = editorWithTable({ rows: 2, cols: 2, withText: true });

    // Build a CellSelection spanning all cells, mirroring deleteTableWhenSelected's
    // precondition, then run deleteTable (the command it delegates to).
    const cellPositions = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cellPositions.push(pos);
    });
    expect(cellPositions.length).toBe(4);
    const sel = new CellSelection(
      editor.state.doc.resolve(cellPositions[0]),
      editor.state.doc.resolve(cellPositions[cellPositions.length - 1]),
    );
    editor.view.dispatch(editor.state.tr.setSelection(sel));

    const ok = editor.commands.deleteTable();
    expect(ok).toBe(true);

    expect(countTables(editor)).toBe(1);
    const rows = collectRows(editor);
    expect(rows.length).toBe(2);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange?.type).toBe('rowDelete');
    });

    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes.length).toBe(1);
    expect(changes[0].subtype).toBe('table-delete');
    expect(changes[0].decidable).toBe(true);
    expect(changes[0].wholeTable).toBe(true);
  });

  it('EMPTY table delete (no cell text) is tracked, not removed untracked', () => {
    editor = editorWithTable({ rows: 2, cols: 2, withText: false });
    caretInFirstCell(editor);

    const ok = editor.commands.deleteTable();
    expect(ok).toBe(true);

    // Table kept and every row carries rowDelete.
    expect(countTables(editor)).toBe(1);
    const rows = collectRows(editor);
    expect(rows.length).toBe(2);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange?.type).toBe('rowDelete');
    });

    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes.length).toBe(1);
    expect(changes[0].subtype).toBe('table-delete');
    expect(changes[0].decidable).toBe(true);
    expect(changes[0].wholeTable).toBe(true);
  });

  it('accept removes the deleted table from the document', () => {
    editor = editorWithTable({ rows: 2, cols: 2, withText: true });
    caretInFirstCell(editor);
    editor.commands.deleteTable();
    expect(countTables(editor)).toBe(1);

    editor.commands.acceptAllTrackedChanges();

    expect(countTables(editor)).toBe(0);
    expect(collectRows(editor).length).toBe(0);
    expect(editor.state.doc.textContent).not.toContain('CELL');
    expect(enumerateStructuralRowChanges(editor.state)).toEqual([]);
  });

  it('reject restores the deleted table with zero tracked marks/attrs', () => {
    editor = editorWithTable({ rows: 2, cols: 2, withText: true });
    caretInFirstCell(editor);
    editor.commands.deleteTable();
    expect(countTables(editor)).toBe(1);

    editor.commands.rejectAllTrackedChanges();

    // Table kept, content stays, no tracked attrs or marks remain.
    expect(countTables(editor)).toBe(1);
    expect(editor.state.doc.textContent).toContain('CELL');

    const rows = collectRows(editor);
    expect(rows.length).toBe(2);
    rows.forEach(({ node }) => {
      expect(node.attrs.trackChange).toBeFalsy();
    });

    let anyDeleteMark = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === TrackDeleteMarkName)) anyDeleteMark = true;
    });
    expect(anyDeleteMark).toBe(false);

    expect(enumerateStructuralRowChanges(editor.state)).toEqual([]);
  });

  it('TC OFF: deleteTable removes the table normally (no trackChange, no structural change)', () => {
    editor = editorWithTable({ rows: 2, cols: 2, withText: true });
    // Turn track changes back OFF.
    editor.commands.disableTrackChanges();
    caretInFirstCell(editor);

    const ok = editor.commands.deleteTable();
    expect(ok).toBe(true);

    expect(countTables(editor)).toBe(0);
    expect(collectRows(editor).length).toBe(0);
    expect(editor.state.doc.textContent).not.toContain('CELL');
    expect(enumerateStructuralRowChanges(editor.state)).toEqual([]);
  });
});
