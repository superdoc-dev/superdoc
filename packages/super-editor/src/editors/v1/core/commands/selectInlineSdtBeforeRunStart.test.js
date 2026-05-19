import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { selectInlineSdtBeforeRunStart } from './selectInlineSdtBeforeRunStart.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      structuredContent: {
        inline: true,
        group: 'inline',
        content: 'inline*',
        isolating: true,
        attrs: {
          lockMode: { default: 'unlocked' },
        },
      },
      run: { inline: true, group: 'inline', content: 'inline*' },
      text: { group: 'inline' },
    },
    marks: {},
  });

const makeDoc = (schema, lockMode = 'contentLocked') => {
  const sdtRun = schema.nodes.run.create(null, schema.text('Locked content'));
  const sdt = schema.nodes.structuredContent.create({ lockMode }, sdtRun);
  const followingRun = schema.nodes.run.create(null, schema.text('Adding text'));
  return schema.node('doc', null, [schema.node('paragraph', null, [sdt, followingRun])]);
};

const findNode = (doc, typeName, predicate = () => true) => {
  let result = null;
  doc.descendants((node, pos) => {
    if (node.type.name === typeName && predicate(node)) {
      result = { node, pos, end: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return result;
};

describe('selectInlineSdtBeforeRunStart', () => {
  it.each(['unlocked', 'contentLocked'])('selects the %s inline SDT wrapper before the current run', (lockMode) => {
    const schema = makeSchema();
    const doc = makeDoc(schema, lockMode);
    const sdt = findNode(doc, 'structuredContent');
    const followingRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Adding'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, followingRun.pos + 1),
    });

    let dispatched;
    const ok = selectInlineSdtBeforeRunStart()({ state, dispatch: (tr) => (dispatched = tr) });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(dispatched.selection).toBeInstanceOf(NodeSelection);
    expect(dispatched.selection.from).toBe(sdt.pos);
    expect(dispatched.selection.to).toBe(sdt.end);
  });

  it.each(['sdtLocked', 'sdtContentLocked'])('consumes Backspace without selecting %s wrappers', (lockMode) => {
    const schema = makeSchema();
    const doc = makeDoc(schema, lockMode);
    const followingRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Adding'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, followingRun.pos + 1),
    });
    const dispatch = vi.fn();

    const ok = selectInlineSdtBeforeRunStart()({ state, dispatch });

    expect(ok).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the cursor is not at the start of a run', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const followingRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Adding'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, followingRun.pos + 2),
    });
    const dispatch = vi.fn();

    const ok = selectInlineSdtBeforeRunStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the previous sibling is not an inline SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.nodes.run.create(null, schema.text('Before')),
        schema.nodes.run.create(null, schema.text('Adding text')),
      ]),
    ]);
    const followingRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Adding'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, followingRun.pos + 1),
    });
    const dispatch = vi.fn();

    const ok = selectInlineSdtBeforeRunStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
