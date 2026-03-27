import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { backspaceNextToRun } from './backspaceNextToRun.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      run: { inline: true, group: 'inline', content: 'inline*' },
      bookmarkEnd: { inline: true, group: 'inline', atom: true },
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

describe('backspaceNextToRun', () => {
  it('deletes the last character of the run immediately before the cursor', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run', null, schema.text('BC')),
      ]),
    ]);

    const boundary = posBetweenRuns(doc, 'A');
    expect(boundary).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, boundary ?? 1) });
    const tr = state.tr;
    let dispatched;

    const ok = backspaceNextToRun()({ state, tr, dispatch: (t) => (dispatched = t) });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('BC');
    // Selection is moved near the deleted position
    expect(dispatched.selection.from).toBe(boundary - 2);
  });

  it('returns false when the previous run is empty', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run'), schema.node('run', null, schema.text('B'))]),
    ]);

    const boundary = posBetweenRuns(doc, '');
    expect(boundary).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, boundary ?? 1) });
    const dispatch = vi.fn();

    const ok = backspaceNextToRun()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the cursor is not adjacent to a run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('AB'))]);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) }); // inside plain text
    const dispatch = vi.fn();

    const ok = backspaceNextToRun()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips non-text inline nodes and deletes the previous text character', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, [schema.text('A'), schema.node('bookmarkEnd')]),
        schema.node('run', null, schema.text('.')),
      ]),
    ]);

    const boundary = posBetweenRuns(doc, 'A');
    expect(boundary).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, boundary ?? 1) });
    let dispatched;
    const ok = backspaceNextToRun()({ state, tr: state.tr, dispatch: (t) => (dispatched = t) });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    // Should remove "A", not the bookmark node.
    expect(dispatched.doc.textContent).toBe('.');
    let bookmarkCount = 0;
    dispatched.doc.descendants((node) => {
      if (node.type.name === 'bookmarkEnd') bookmarkCount += 1;
    });
    expect(bookmarkCount).toBe(1);
  });

  it('does not scan into previous paragraphs when adjacent run has only non-text inline content', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('A'))]),
      schema.node('paragraph', null, [
        schema.node('run', null, [schema.node('bookmarkEnd')]),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    const boundary = posBetweenRuns(doc, '');
    expect(boundary).not.toBeNull();

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, boundary ?? 1) });
    const dispatch = vi.fn();

    const ok = backspaceNextToRun()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(state.doc.textContent).toBe('AB');
  });
});
