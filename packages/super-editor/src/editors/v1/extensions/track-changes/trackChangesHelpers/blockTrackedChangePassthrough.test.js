import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Slice, Fragment } from 'prosemirror-model';
import { ReplaceStep } from 'prosemirror-transform';
import { trackedTransaction } from './trackedTransaction.js';
import { TrackInsertMarkName, TrackDeleteMarkName } from '../constants.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

describe('trackedTransaction — pass-through for pre-marked block content', () => {
  let editor, schema, basePlugins;
  const user = { name: 'Block Tester', email: 'block@example.com' };

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    basePlugins = editor.state.plugins;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    editor?.destroy();
    editor = null;
  });

  const createState = (doc) => EditorState.create({ schema, doc, plugins: basePlugins });

  const buildPreMarkedTable = (operationId, rowCount = 2) => {
    const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('hello')));
    const rows = [];
    for (let i = 0; i < rowCount; i += 1) {
      rows.push(schema.nodes.tableRow.create({ trackChange: { kind: 'insert', id: `row-${i}`, operationId } }, [cell]));
    }
    return schema.nodes.table.create({ sdBlockId: 'tbl-1' }, rows);
  };

  const inlineTrackedMarksOnText = (doc) => {
    let count = 0;
    doc.descendants((node) => {
      if (!node.isText) return;
      node.marks.forEach((m) => {
        if (m.type.name === TrackInsertMarkName || m.type.name === TrackDeleteMarkName) count += 1;
      });
    });
    return count;
  };

  it('ReplaceStep inserting a pre-marked table passes through without inline-mark wrapping', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('before'))]);
    const state = createState(doc);
    const tr = state.tr;
    const preMarkedTable = buildPreMarkedTable('op-1', 2);
    const insertPos = state.doc.content.size;
    tr.step(new ReplaceStep(insertPos, insertPos, new Slice(Fragment.from(preMarkedTable), 0, 0)));
    const result = trackedTransaction({ tr, state, user });
    const nextDoc = state.apply(result).doc;
    const insertedTable = nextDoc.child(nextDoc.childCount - 1);
    expect(insertedTable.type.name).toBe('table');
    insertedTable.forEach((row) => {
      expect(row.attrs.trackChange?.kind).toBe('insert');
    });
    expect(inlineTrackedMarksOnText(nextDoc)).toBe(0);
  });

  it('normal text insertion still gets wrapped with inline trackInsert marks (regression guard)', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('hello world'))]);
    const state = createState(doc);
    const tr = state.tr.insertText('X', 1);
    const result = trackedTransaction({ tr, state, user });
    const nextDoc = state.apply(result).doc;
    expect(inlineTrackedMarksOnText(nextDoc)).toBeGreaterThan(0);
  });
});
