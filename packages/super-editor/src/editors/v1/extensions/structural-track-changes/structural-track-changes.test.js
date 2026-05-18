import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { getStarterExtensions } from '@extensions/index.js';
import { StructuralTrackChanges } from './structural-track-changes.js';
import { getBlockTrackedChanges } from '../track-changes/trackChangesHelpers/getBlockTrackedChanges.js';

describe('StructuralTrackChanges extension', () => {
  let editor;
  beforeEach(() => {
    ({ editor } = initTestEditor({
      mode: 'text',
      content: '<table data-sd-block-id="t1"><tr><td><p>hi</p></td></tr></table><p>after</p>',
      extensions: [...getStarterExtensions(), StructuralTrackChanges],
    }));
  });
  afterEach(() => editor?.destroy());

  it('setStructuralDiff stamps trackChange on every row of the matching table', () => {
    const table = editor.state.doc.firstChild;
    const ok = editor.commands.setStructuralDiff([
      { kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize },
    ]);
    expect(ok).toBe(true);
    const block = getBlockTrackedChanges(editor.state);
    expect(block.length).toBeGreaterThanOrEqual(1);
    block.forEach((b) => {
      expect(b.kind).toBe('delete');
    });
  });

  it('acceptStructuralChange removes the table when a remove hunk is staged and accepted', () => {
    const table = editor.state.doc.firstChild;
    editor.commands.setStructuralDiff([{ kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize }]);
    expect(editor.commands.acceptStructuralChange('t1')).toBe(true);
    let hasTable = false;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(false);
  });

  it('rejectStructuralChange clears the trackChange attrs and keeps the table', () => {
    const table = editor.state.doc.firstChild;
    editor.commands.setStructuralDiff([{ kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize }]);
    expect(editor.commands.rejectStructuralChange('t1')).toBe(true);
    expect(getBlockTrackedChanges(editor.state)).toHaveLength(0);
    let hasTable = false;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(true);
  });

  it('acceptAllStructuralChanges resolves every staged hunk', () => {
    const table = editor.state.doc.firstChild;
    editor.commands.setStructuralDiff([{ kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize }]);
    expect(editor.commands.acceptAllStructuralChanges()).toBe(true);
    expect(getBlockTrackedChanges(editor.state)).toHaveLength(0);
  });

  it('is registered in default starter extensions', () => {
    const names = getStarterExtensions().map((e) => e.name);
    expect(names).toContain('structuralTrackChanges');
  });

  it('acceptAllTrackedChanges resolves block-level row tracked changes (table + shell gone)', () => {
    // Consumers like al-pmo only call acceptAllTrackedChanges; without
    // block-level handling, cell contents would clear but the table shell
    // would remain.
    const table = editor.state.doc.firstChild;
    editor.commands.setStructuralDiff([{ kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize }]);
    editor.commands.acceptAllTrackedChanges();
    let hasTable = false;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(false);
    expect(getBlockTrackedChanges(editor.state)).toHaveLength(0);
  });

  it('rejectAllTrackedChanges clears block-level trackChange attrs and keeps the table', () => {
    const table = editor.state.doc.firstChild;
    editor.commands.setStructuralDiff([{ kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize }]);
    editor.commands.rejectAllTrackedChanges();
    let hasTable = false;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(true);
    expect(getBlockTrackedChanges(editor.state)).toHaveLength(0);
  });
});
