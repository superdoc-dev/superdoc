import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { getStarterExtensions } from '@extensions/index.js';
import { StructuralTrackChanges } from './structural-track-changes.js';
import { enumerateStructuralRowChanges } from '../track-changes/trackChangesHelpers/structuralRowChanges.js';

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

  it('setStructuralDiff stamps every row of the targeted table as rowDelete via stampTableRows', () => {
    const table = editor.state.doc.firstChild;
    const ok = editor.commands.setStructuralDiff([
      { kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize },
    ]);
    expect(ok).toBe(true);
    const changes = enumerateStructuralRowChanges(editor.state);
    expect(changes).toHaveLength(1);
    expect(changes[0].subtype).toBe('table-delete');
    expect(changes[0].wholeTable).toBe(true);
  });

  it('is registered in default starter extensions', () => {
    const names = getStarterExtensions().map((e) => e.name);
    expect(names).toContain('structuralTrackChanges');
  });

  it('acceptAllTrackedChanges resolves a staged table deletion (table + shell gone)', () => {
    // Consumers like al-pmo only call acceptAllTrackedChanges; routing through
    // the review-model decision engine (via the structural-row review-graph
    // projection) handles whole-table accept without any block-level fallback.
    const table = editor.state.doc.firstChild;
    editor.commands.setStructuralDiff([{ kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize }]);
    editor.commands.acceptAllTrackedChanges();
    let hasTable = false;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(false);
    expect(enumerateStructuralRowChanges(editor.state)).toHaveLength(0);
  });

  it('rejectAllTrackedChanges clears the structural trackChange attrs and keeps the table', () => {
    const table = editor.state.doc.firstChild;
    editor.commands.setStructuralDiff([{ kind: 'remove', changeId: 't1', basePos: 0, baseNodeSize: table.nodeSize }]);
    editor.commands.rejectAllTrackedChanges();
    let hasTable = false;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(true);
    expect(enumerateStructuralRowChanges(editor.state)).toHaveLength(0);
  });
});
