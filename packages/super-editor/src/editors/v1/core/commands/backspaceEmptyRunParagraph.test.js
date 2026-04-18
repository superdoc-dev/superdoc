import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { backspaceEmptyRunParagraph } from './backspaceEmptyRunParagraph.js';

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

const findEmptyRunPos = (doc) => {
  let pos = null;
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'run' && node.content.size === 0) {
      pos = nodePos; // position before the empty run, inside the paragraph
      return false;
    }
    return true;
  });
  return pos;
};

describe('backspaceEmptyRunParagraph', () => {
  it('removes a paragraph containing only an empty run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('Hello'))]),
      schema.node('paragraph', null, [schema.node('run')]),
    ]);

    const emptyRunPos = findEmptyRunPos(doc);
    expect(emptyRunPos).not.toBeNull();

    const selection = TextSelection.create(doc, emptyRunPos ?? 1);
    const state = EditorState.create({ schema, doc, selection });

    const paraPos = state.selection.$from.before();
    let dispatched;

    const ok = backspaceEmptyRunParagraph()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('Hello');
    expect(dispatched.selection.from).toBe(paraPos - 1);
  });

  it('moves selection to the next block when removing the first empty run paragraph', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run')]),
      schema.node('paragraph', null, [schema.node('run', null, schema.text('Hello'))]),
    ]);

    const emptyRunPos = findEmptyRunPos(doc);
    expect(emptyRunPos).not.toBeNull();

    const selection = TextSelection.create(doc, emptyRunPos ?? 1);
    const state = EditorState.create({ schema, doc, selection });

    let dispatched;

    const ok = backspaceEmptyRunParagraph()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('Hello');
    expect(dispatched.selection.from).toBe(1);
  });

  it('does nothing when the empty run paragraph is the only node', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.node('run')])]);

    const emptyRunPos = findEmptyRunPos(doc);
    expect(emptyRunPos).not.toBeNull();

    const selection = TextSelection.create(doc, emptyRunPos ?? 1);
    const state = EditorState.create({ schema, doc, selection });

    const dispatch = vi.fn();
    const ok = backspaceEmptyRunParagraph()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
