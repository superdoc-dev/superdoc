import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { applyRowTrackedChangeResolution } from './acceptRejectRowTrackedChange.js';

describe('applyRowTrackedChangeResolution', () => {
  let editor, schema;
  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });
  afterEach(() => editor?.destroy());

  const makeRow = (kind, id, operationId) => {
    const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('x')));
    return schema.nodes.tableRow.create({ trackChange: { kind, id, operationId } }, [cell]);
  };
  const stateWith = (children) => EditorState.create({ schema, doc: schema.nodes.doc.create(null, children) });
  const tableWith = (rows) => schema.nodes.table.create({ sdBlockId: 't1' }, rows);

  it('accept on a deleted row deletes it (and the parent table when last row)', () => {
    const state = stateWith([
      schema.nodes.paragraph.create(null, schema.text('before')),
      tableWith([makeRow('delete', 'r1', 'op1')]),
      schema.nodes.paragraph.create(null, schema.text('after')),
    ]);
    const tr = state.tr;
    const result = applyRowTrackedChangeResolution({ tr, state, ids: ['r1'], decision: 'accept' });
    expect(result.applied).toBe(1);
    const nextDoc = state.apply(tr).doc;
    let hasTable = false;
    nextDoc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(false);
    expect(nextDoc.textContent).toBe('beforeafter');
  });

  it('accept on a deleted row leaves other rows when more remain', () => {
    const otherCell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('keep')));
    const state = stateWith([
      tableWith([makeRow('delete', 'r1', 'op1'), schema.nodes.tableRow.create(null, [otherCell])]),
    ]);
    const tr = state.tr;
    applyRowTrackedChangeResolution({ tr, state, ids: ['r1'], decision: 'accept' });
    const table = state.apply(tr).doc.firstChild;
    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(1);
    expect(table.firstChild.attrs.trackChange).toBeFalsy();
  });

  it('accept on inserted row strips the attr; row stays', () => {
    const state = stateWith([tableWith([makeRow('insert', 'r1', 'op1')])]);
    const tr = state.tr;
    applyRowTrackedChangeResolution({ tr, state, ids: ['r1'], decision: 'accept' });
    const row = state.apply(tr).doc.firstChild.firstChild;
    expect(row.attrs.trackChange).toBeFalsy();
  });

  it('reject on a deleted row strips the attr; row stays', () => {
    const state = stateWith([tableWith([makeRow('delete', 'r1', 'op1')])]);
    const tr = state.tr;
    applyRowTrackedChangeResolution({ tr, state, ids: ['r1'], decision: 'reject' });
    const row = state.apply(tr).doc.firstChild.firstChild;
    expect(row.attrs.trackChange).toBeFalsy();
  });

  it('reject on an inserted row deletes it (and the table if last row)', () => {
    const state = stateWith([
      schema.nodes.paragraph.create(null, schema.text('a')),
      tableWith([makeRow('insert', 'r1', 'op1')]),
      schema.nodes.paragraph.create(null, schema.text('b')),
    ]);
    const tr = state.tr;
    applyRowTrackedChangeResolution({ tr, state, ids: ['r1'], decision: 'reject' });
    let hasTable = false;
    state.apply(tr).doc.descendants((n) => {
      if (n.type.name === 'table') hasTable = true;
    });
    expect(hasTable).toBe(false);
  });

  it('returns notFound for unknown ids', () => {
    const state = stateWith([tableWith([makeRow('delete', 'r1', 'op1')])]);
    const tr = state.tr;
    const result = applyRowTrackedChangeResolution({ tr, state, ids: ['r1', 'missing'], decision: 'reject' });
    expect(result.applied).toBe(1);
    expect(result.notFound).toEqual(['missing']);
  });

  const makePara = (text, kind, id, operationId) =>
    schema.nodes.paragraph.create({ trackChange: { kind, id, operationId } }, schema.text(text));

  it('accept on a deleted top-level paragraph removes the whole node (no $pos.before crash)', () => {
    // Regression: a top-level block resolves at depth 0, so the row code's
    // `$pos.before($pos.depth)` threw "no position before the top-level node".
    const state = stateWith([
      schema.nodes.paragraph.create(null, schema.text('keep')),
      makePara('bullet item', 'delete', 'p1', 'opP'),
      schema.nodes.paragraph.create(null, schema.text('tail')),
    ]);
    const tr = state.tr;
    const result = applyRowTrackedChangeResolution({ tr, state, ids: ['p1'], decision: 'accept' });
    expect(result.applied).toBe(1);
    expect(state.apply(tr).doc.textContent).toBe('keeptail');
  });

  it('reject on a deleted paragraph strips the attr; paragraph + text stay', () => {
    const state = stateWith([
      makePara('bullet item', 'delete', 'p1', 'opP'),
      schema.nodes.paragraph.create(null, schema.text('x')),
    ]);
    const tr = state.tr;
    applyRowTrackedChangeResolution({ tr, state, ids: ['p1'], decision: 'reject' });
    const para = state.apply(tr).doc.firstChild;
    expect(para.attrs.trackChange).toBeFalsy();
    expect(para.textContent).toBe('bullet item');
  });

  it('processes multiple deletes back-to-front so positions stay valid', () => {
    const state = stateWith([
      tableWith([makeRow('delete', 'r1', 'op1'), makeRow('delete', 'r2', 'op1'), makeRow('delete', 'r3', 'op1')]),
      schema.nodes.paragraph.create(null, schema.text('after')),
    ]);
    const tr = state.tr;
    const result = applyRowTrackedChangeResolution({ tr, state, ids: ['r1', 'r2', 'r3'], decision: 'accept' });
    expect(result.applied).toBe(3);
    expect(state.apply(tr).doc.textContent).toBe('after');
  });
});
