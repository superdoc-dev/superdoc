import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { insertTabNode } from './insertTabNode.js';

const makeSchema = ({ includeRun = false, includeTab = true } = {}) =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      ...(includeRun && { run: { inline: true, group: 'inline', content: 'inline*' } }),
      ...(includeTab && {
        tab: {
          inline: true,
          group: 'inline',
          selectable: false,
          atom: true,
          parseDOM: [{ tag: 'span[data-tab]' }],
          toDOM: () => ['span', { 'data-tab': 'true' }, '\t'],
        },
      }),
      text: { group: 'inline' },
    },
    marks: {},
  });

const findTextPos = (doc, text) => {
  let pos = null;
  doc.descendants((node, nodePos) => {
    if (node.isText && node.text === text) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  return pos;
};

const findRun = (doc, text) => {
  let start = null;
  let node = null;
  doc.descendants((n, pos) => {
    if (n.type.name === 'run' && n.textContent === text) {
      start = pos;
      node = n;
      return false;
    }
    return true;
  });
  return { start, node };
};

describe('insertTabNode', () => {
  it('inserts a tab node when schema provides it', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('AB'))]);
    const aPos = findTextPos(doc, 'AB');
    expect(aPos).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, (aPos ?? 0) + 1) });
    const tr = state.tr;
    let dispatched;

    const ok = insertTabNode()({
      state,
      tr,
      dispatch: (t) => {
        dispatched = t;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    const para = dispatched.doc.firstChild;
    expect(para.childCount).toBe(3);
    expect(para.child(0).textContent).toBe('A');
    expect(para.child(1).type.name).toBe('tab');
    expect(para.child(2).textContent).toBe('B');
    expect(dispatched.selection.from).toBe(dispatched.selection.to);
    expect(dispatched.doc.nodeAt(dispatched.selection.from - 1)?.type.name).toBe('tab');
  });

  it('splits a run at the cursor and inserts a tab between the new runs', () => {
    const schema = makeSchema({ includeRun: true });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('AB'))]),
    ]);
    const textPos = findTextPos(doc, 'AB');
    expect(textPos).not.toBeNull();

    const cursorPos = (textPos ?? 0) + 1; // between A and B
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });
    const tr = state.tr;
    let dispatched;

    const ok = insertTabNode()({
      state,
      tr,
      dispatch: (t) => {
        dispatched = t;
      },
    });

    expect(ok).toBe(true);
    const para = dispatched.doc.firstChild;
    expect(para.childCount).toBe(3);
    expect(para.child(0).type.name).toBe('run');
    expect(para.child(0).textContent).toBe('A');
    expect(para.child(1).type.name).toBe('tab');
    expect(para.child(2).type.name).toBe('run');
    expect(para.child(2).textContent).toBe('B');
  });

  it('inserts after the run when the cursor is at its end', () => {
    const schema = makeSchema({ includeRun: true });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);
    const { start, node } = findRun(doc, 'A');
    expect(start).not.toBeNull();
    const cursorPos = (start ?? 0) + (node?.nodeSize ?? 0) - 1; // end of first run

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });
    const tr = state.tr;
    let dispatched;

    const ok = insertTabNode()({
      state,
      tr,
      dispatch: (t) => {
        dispatched = t;
      },
    });

    expect(ok).toBe(true);
    const para = dispatched.doc.firstChild;
    expect(para.child(1).type.name).toBe('tab');
    expect(para.child(0).textContent).toBe('A');
    expect(para.child(2).textContent).toBe('B');
  });

  it('inserts before the run when the cursor is at its start', () => {
    const schema = makeSchema({ includeRun: true });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);
    const { start } = findRun(doc, 'A');
    expect(start).not.toBeNull();
    const cursorPos = (start ?? 0) + 1; // start position inside first run

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });
    const tr = state.tr;
    let dispatched;

    const ok = insertTabNode()({
      state,
      tr,
      dispatch: (t) => {
        dispatched = t;
      },
    });

    expect(ok).toBe(true);
    const para = dispatched.doc.firstChild;
    expect(para.child(0).type.name).toBe('tab');
    expect(para.child(1).textContent).toBe('A');
    expect(para.child(2).textContent).toBe('B');
  });

  it('falls back to inserting a tab character when tab node is missing', () => {
    const schema = makeSchema({ includeTab: false });
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('AB'))]);
    const aPos = findTextPos(doc, 'AB');
    expect(aPos).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, (aPos ?? 0) + 1) });
    const tr = state.tr;
    let dispatched;

    const ok = insertTabNode()({
      state,
      tr,
      dispatch: (t) => {
        dispatched = t;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched.doc.textContent).toBe('A\tB');
    expect(dispatched.selection.from).toBe(dispatched.selection.to);
  });
});
