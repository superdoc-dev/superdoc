import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { backspaceAcrossRuns } from './backspaceAcrossRuns.js';

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

const posInsideRun = (doc, runText, offset) => {
  let target = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'run' && node.textContent === runText) {
      target = pos + 1 + offset; // +1 for run open, +offset into text
      return false;
    }
    return true;
  });
  return target;
};

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

describe('backspaceAcrossRuns', () => {
  it('deletes the character before the cursor when mid-text in a run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('ABC'))]),
    ]);

    const cursorPos = posInsideRun(doc, 'ABC', 2); // after "B"
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });

    let dispatched;
    const ok = backspaceAcrossRuns()({ state, tr: state.tr, dispatch: (t) => (dispatched = t) });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('AC');
  });

  it('deletes across an empty sibling run when cursor is at run start', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run'), // empty run
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    const cursorPos = posInsideRun(doc, 'B', 0); // start of third run
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });

    let dispatched;
    const ok = backspaceAcrossRuns()({ state, tr: state.tr, dispatch: (t) => (dispatched = t) });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('B');
  });

  it('deletes when cursor is between runs at the paragraph level', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    const cursorPos = posBetweenRuns(doc, 'A');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });

    let dispatched;
    const ok = backspaceAcrossRuns()({ state, tr: state.tr, dispatch: (t) => (dispatched = t) });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.doc.textContent).toBe('B');
  });

  it('returns false when no text exists before the cursor in the paragraph', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run'), // empty
        schema.node('run', null, schema.text('B')),
      ]),
    ]);

    const cursorPos = posInsideRun(doc, 'B', 0);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });
    const dispatch = vi.fn();

    const ok = backspaceAcrossRuns()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when cursor is not inside or adjacent to a run', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('AB'))]);

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) });
    const dispatch = vi.fn();

    const ok = backspaceAcrossRuns()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when selection is not empty', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('ABC'))]),
    ]);

    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 3, 5), // "BC" selected
    });
    const dispatch = vi.fn();

    const ok = backspaceAcrossRuns()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not delete text from a previous paragraph', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('First'))]),
      schema.node('paragraph', null, [
        schema.node('run'), // empty — first run of second paragraph
        schema.node('run', null, schema.text('Second')),
      ]),
    ]);

    // Cursor at start of second paragraph's second run
    const cursorPos = posInsideRun(doc, 'Second', 0);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });
    const dispatch = vi.fn();

    const ok = backspaceAcrossRuns()({ state, tr: state.tr, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(state.doc.textContent).toBe('FirstSecond');
  });
});
