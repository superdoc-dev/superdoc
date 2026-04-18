import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { cleanupEmptyRunsPlugin } from './cleanupEmptyRunsPlugin.js';

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

const findRunPos = (doc, text) => {
  let pos = null;
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'run' && node.textContent === text) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  return pos;
};

const countEmptyRuns = (doc) => {
  let count = 0;
  doc.descendants((node, _pos, parent) => {
    if (node.type.name === 'run' && node.content.size === 0 && parent?.type.name === 'paragraph') {
      count += 1;
    }
  });
  return count;
};

describe('cleanupEmptyRunsPlugin', () => {
  it('removes an empty run inserted between runs', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);
    const state = EditorState.create({ schema, doc, plugins: [cleanupEmptyRunsPlugin] });

    const insertPos = findRunPos(state.doc, 'B');
    expect(insertPos).not.toBeNull();

    const emptyRun = schema.node('run');
    const tr = state.tr.insert(insertPos ?? 0, emptyRun);
    const { state: nextState, transactions } = state.applyTransaction(tr);

    expect(transactions.length).toBeGreaterThan(1); // plugin appended a transaction
    expect(nextState.doc.textContent).toBe('AB');
    expect(countEmptyRuns(nextState.doc)).toBe(0);
  });

  it('removes multiple empty runs inserted by a transaction', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.node('run', null, schema.text('A')),
        schema.node('run', null, schema.text('B')),
      ]),
    ]);
    const state = EditorState.create({ schema, doc, plugins: [cleanupEmptyRunsPlugin] });

    const insertPos = findRunPos(state.doc, 'B');
    expect(insertPos).not.toBeNull();

    const emptyRun = schema.node('run');
    const tr = state.tr.insert(insertPos ?? 0, [emptyRun, emptyRun]);
    const { state: nextState, transactions } = state.applyTransaction(tr);

    expect(transactions.length).toBeGreaterThan(1);
    expect(nextState.doc.textContent).toBe('AB');
    expect(countEmptyRuns(nextState.doc)).toBe(0);
  });

  it('does nothing when no transaction changes the document', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.node('run', null, schema.text('AB'))]),
    ]);
    const state = EditorState.create({ schema, doc, plugins: [cleanupEmptyRunsPlugin] });

    const tr = state.tr.setSelection(TextSelection.create(state.doc, 2)); // selection change only
    const { state: nextState, transactions } = state.applyTransaction(tr);

    expect(transactions.length).toBe(1); // no appended transaction
    expect(nextState.doc.eq(state.doc)).toBe(true);
  });
});
