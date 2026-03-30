import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { backspaceSkipEmptyRun } from './backspaceSkipEmptyRun.js';

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

const endOfFirstRunPos = (doc) => {
  let target = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'run' && node.textContent === 'A') {
      target = pos + node.nodeSize - 1; // end position inside the run
      return false;
    }
    return true;
  });
  return target;
};

describe('backspaceSkipEmptyRun', () => {
  it('deletes the character to the left when an empty run follows', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run'),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    const cursorPos = endOfFirstRunPos(doc);
    expect(cursorPos).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos ?? 1) });

    let dispatched;
    const ok = backspaceSkipEmptyRun()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('B');
  });

  it('returns false when not at the end of a run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run'),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) }); // inside first run
    const dispatch = vi.fn();
    const ok = backspaceSkipEmptyRun()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
