import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { applyHunks } from './applyHunks.js';

describe('applyHunks', () => {
  let editor, schema;
  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });
  afterEach(() => editor?.destroy());

  const buildTable = (id, rowCount = 2) => {
    const rows = [];
    for (let i = 0; i < rowCount; i += 1) {
      const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text(`r${i}`)));
      rows.push(schema.nodes.tableRow.create(null, [cell]));
    }
    return schema.nodes.table.create({ sdBlockId: id }, rows);
  };

  it('stamps trackChange.delete on every row of an existing table for a remove hunk', () => {
    const table = buildTable('tbl-del', 3);
    const doc = schema.nodes.doc.create(null, [table]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    const result = applyHunks({
      tr,
      state,
      hunks: [{ kind: 'remove', changeId: 'tbl-del', basePos: 0, baseNodeSize: table.nodeSize }],
    });
    expect(result.applied).toBe(1);
    const nextDoc = state.apply(tr).doc;
    const next = nextDoc.firstChild;
    expect(next.type.name).toBe('table');
    expect(next.childCount).toBe(3);
    const opIds = new Set();
    next.forEach((row) => {
      expect(row.attrs.trackChange?.type).toBe('rowDelete');
      opIds.add(row.attrs.trackChange?.operationId);
    });
    expect(opIds.size).toBe(1);
  });

  it('inserts a proposal table with trackChange.insert on every row at the anchor position', () => {
    const proposalTable = buildTable('tbl-add', 2);
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('before'))]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    const insertPos = doc.content.size;
    const result = applyHunks({
      tr,
      state,
      hunks: [{ kind: 'insert', changeId: 'tbl-add', proposalNode: proposalTable, anchorBasePos: insertPos }],
    });
    expect(result.applied).toBe(1);
    const nextDoc = state.apply(tr).doc;
    const insertedTable = nextDoc.child(nextDoc.childCount - 1);
    expect(insertedTable.type.name).toBe('table');
    insertedTable.forEach((row) => {
      expect(row.attrs.trackChange?.type).toBe('rowInsert');
    });
  });

  it('rows in one hunk share an operationId but have unique row ids', () => {
    const table = buildTable('tbl-ids', 4);
    const doc = schema.nodes.doc.create(null, [table]);
    const state = EditorState.create({ schema, doc });
    const tr = state.tr;
    applyHunks({
      tr,
      state,
      hunks: [{ kind: 'remove', changeId: 'tbl-ids', basePos: 0, baseNodeSize: table.nodeSize }],
    });
    const ids = new Set();
    let operationId;
    state.apply(tr).doc.firstChild.forEach((row) => {
      ids.add(row.attrs.trackChange.id);
      operationId = row.attrs.trackChange.operationId;
    });
    expect(ids.size).toBe(4);
    expect(typeof operationId).toBe('string');
    expect(operationId.length).toBeGreaterThan(0);
  });
});
