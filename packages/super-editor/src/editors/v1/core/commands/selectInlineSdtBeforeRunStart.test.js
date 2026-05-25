import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { selectInlineSdtAfterRunEnd, selectInlineSdtBeforeRunStart } from './selectInlineSdtBeforeRunStart.js';

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

const makeDocWithPreviousRun = (schema, lockMode = 'contentLocked') => {
  const previousRun = schema.nodes.run.create(null, schema.text('Before text'));
  const sdtRun = schema.nodes.run.create(null, schema.text('Locked content'));
  const sdt = schema.nodes.structuredContent.create({ lockMode }, sdtRun);
  return schema.node('doc', null, [schema.node('paragraph', null, [previousRun, sdt])]);
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
  it.each(['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'])(
    'selects only the %s inline SDT content before the current run',
    (lockMode) => {
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
      expect(dispatched.selection).toBeInstanceOf(TextSelection);
      expect(dispatched.selection).not.toBeInstanceOf(NodeSelection);
      expect(dispatched.selection.from).toBe(sdt.pos + 1);
      expect(dispatched.selection.to).toBe(sdt.end - 1);
      expect(dispatched.selection.content().content.textBetween(0, dispatched.selection.content().content.size)).toBe(
        'Locked content',
      );
    },
  );

  it.each(['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'])(
    'selects only the %s inline SDT content from the trailing boundary',
    (lockMode) => {
      const schema = makeSchema();
      const doc = makeDoc(schema, lockMode);
      const sdt = findNode(doc, 'structuredContent');
      const state = EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, sdt.end),
      });

      let dispatched;
      const ok = selectInlineSdtBeforeRunStart()({ state, dispatch: (tr) => (dispatched = tr) });

      expect(ok).toBe(true);
      expect(dispatched).toBeDefined();
      expect(dispatched.selection).toBeInstanceOf(TextSelection);
      expect(dispatched.selection).not.toBeInstanceOf(NodeSelection);
      expect(dispatched.selection.from).toBe(sdt.pos + 1);
      expect(dispatched.selection.to).toBe(sdt.end - 1);
    },
  );

  it('returns true without dispatching when no dispatch is provided', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const followingRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Adding'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, followingRun.pos + 1),
    });

    const ok = selectInlineSdtBeforeRunStart()({ state });

    expect(ok).toBe(true);
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

describe('selectInlineSdtAfterRunEnd', () => {
  it.each(['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'])(
    'selects only the %s inline SDT content after the current run',
    (lockMode) => {
      const schema = makeSchema();
      const doc = makeDocWithPreviousRun(schema, lockMode);
      const sdt = findNode(doc, 'structuredContent');
      const previousRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Before'));
      const state = EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, previousRun.end - 1),
      });

      let dispatched;
      const ok = selectInlineSdtAfterRunEnd()({ state, dispatch: (tr) => (dispatched = tr) });

      expect(ok).toBe(true);
      expect(dispatched).toBeDefined();
      expect(dispatched.selection).toBeInstanceOf(TextSelection);
      expect(dispatched.selection).not.toBeInstanceOf(NodeSelection);
      expect(dispatched.selection.from).toBe(sdt.pos + 1);
      expect(dispatched.selection.to).toBe(sdt.end - 1);
      expect(dispatched.selection.content().content.textBetween(0, dispatched.selection.content().content.size)).toBe(
        'Locked content',
      );
    },
  );

  it.each(['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'])(
    'selects only the %s inline SDT content from the leading boundary',
    (lockMode) => {
      const schema = makeSchema();
      const doc = makeDocWithPreviousRun(schema, lockMode);
      const sdt = findNode(doc, 'structuredContent');
      const state = EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, sdt.pos),
      });

      let dispatched;
      const ok = selectInlineSdtAfterRunEnd()({ state, dispatch: (tr) => (dispatched = tr) });

      expect(ok).toBe(true);
      expect(dispatched).toBeDefined();
      expect(dispatched.selection).toBeInstanceOf(TextSelection);
      expect(dispatched.selection).not.toBeInstanceOf(NodeSelection);
      expect(dispatched.selection.from).toBe(sdt.pos + 1);
      expect(dispatched.selection.to).toBe(sdt.end - 1);
    },
  );

  it('returns true without dispatching when no dispatch is provided', () => {
    const schema = makeSchema();
    const doc = makeDocWithPreviousRun(schema);
    const previousRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Before'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, previousRun.end - 1),
    });

    const ok = selectInlineSdtAfterRunEnd()({ state });

    expect(ok).toBe(true);
  });

  it('returns false when the cursor is not at the end of a run', () => {
    const schema = makeSchema();
    const doc = makeDocWithPreviousRun(schema);
    const previousRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Before'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, previousRun.end - 2),
    });
    const dispatch = vi.fn();

    const ok = selectInlineSdtAfterRunEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the next sibling is not an inline SDT', () => {
    const schema = makeSchema();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.nodes.run.create(null, schema.text('Before text')),
        schema.nodes.run.create(null, schema.text('After')),
      ]),
    ]);
    const previousRun = findNode(doc, 'run', (node) => node.textContent.startsWith('Before'));
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, previousRun.end - 1),
    });
    const dispatch = vi.fn();

    const ok = selectInlineSdtAfterRunEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
