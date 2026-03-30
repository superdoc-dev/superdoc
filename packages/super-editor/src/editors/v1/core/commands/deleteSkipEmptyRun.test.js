import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { deleteSkipEmptyRun } from './deleteSkipEmptyRun.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      run: { inline: true, group: 'inline', content: 'inline*' },
      text: { group: 'inline' },
    },
    marks: {},
  });

const makeDoc = (schema) =>
  schema.node('doc', null, [
    schema.node('paragraph', null, [
      schema.node('run', null, schema.text('A')),
      schema.node('run'),
      schema.node('run', null, schema.text('B')),
    ]),
  ]);

const firstRunPositions = (doc) => {
  let start = null;
  let size = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'run' && node.textContent === 'A') {
      start = pos;
      size = node.nodeSize;
      return false;
    }
    return true;
  });
  return { start, size };
};

describe('deleteSkipEmptyRun', () => {
  it('deletes the next character after an empty run when at the end of a run', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const { start, size } = firstRunPositions(doc);
    expect(start).not.toBeNull();
    expect(size).not.toBeNull();

    const cursorPos = (start ?? 0) + (size ?? 0) - 1;
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });

    let dispatched;
    const ok = deleteSkipEmptyRun()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('A');
  });

  it('deletes the last character of the run when cursor is on that character', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const { start } = firstRunPositions(doc);
    expect(start).not.toBeNull();

    const lastCharPos = (start ?? 0) + 1; // inside first run on the character itself
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, lastCharPos) });

    let dispatched;
    const ok = deleteSkipEmptyRun()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('B');
  });

  it('returns false when no empty run follows', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('AB'))]),
    ]);
    const selection = TextSelection.create(doc, 2); // inside the run, but no empty sibling
    const state = EditorState.create({ schema, doc, selection });

    const dispatch = vi.fn();
    const ok = deleteSkipEmptyRun()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
