import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { deleteNextToRun } from './deleteNextToRun.js';

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

const posBetweenRuns = (doc, firstRunText) => {
  let boundary = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'run' && node.textContent === firstRunText) {
      boundary = pos + node.nodeSize;
      return false;
    }
    return true;
  });
  return boundary;
};

describe('deleteNextToRun', () => {
  it('deletes the first character of the following run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('AB')),
        schema.node('run', null, schema.text('C')),
      ]),
    ]);

    const boundary = posBetweenRuns(doc, 'AB');
    expect(boundary).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, boundary ?? 1) });
    const tr = state.tr;
    let dispatched;

    const ok = deleteNextToRun()({ state, tr, dispatch: (t) => (dispatched = t) });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('AB');
    expect(dispatched.selection.from).toBe(boundary + 1);
  });

  it('returns false when the next run is empty', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('A')), schema.node('run')]),
    ]);

    const boundary = posBetweenRuns(doc, 'A');
    expect(boundary).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, boundary ?? 1) });
    const dispatch = vi.fn();

    const ok = deleteNextToRun()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when not adjacent to a run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('ABC'))]);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) }); // inside plain text
    const dispatch = vi.fn();

    const ok = deleteNextToRun()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
