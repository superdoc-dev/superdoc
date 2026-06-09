import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import {
  selectBlockSdtAfterTextBlockEnd,
  selectBlockSdtBeforeTextBlockStart,
} from './selectBlockSdtAtTextBlockBoundary.js';
import { findFirstContentCursorPosInNode, findLastContentCursorPosInNode } from './helpers/textPositions.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      run: { inline: true, group: 'inline', content: 'inline*' },
      structuredContentBlock: {
        group: 'block',
        content: 'block*',
        isolating: true,
        attrs: {
          lockMode: { default: 'unlocked' },
        },
      },
      mathBlock: { group: 'block', atom: true },
      image: { inline: true, group: 'inline', atom: true },
      text: { group: 'inline' },
    },
    marks: {},
  });

const run = (schema, text) => schema.nodes.run.create(null, schema.text(text));
const paragraph = (schema, text) => schema.nodes.paragraph.create(null, run(schema, text));

const findTextPos = (doc, text, offset = 0) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (!node.isText || found != null) return found == null;
    const index = node.text.indexOf(text);
    if (index === -1) return true;
    found = pos + index + offset;
    return false;
  });
  expect(found).not.toBeNull();
  return found;
};

const findBlockSdt = (doc) => {
  let result = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'structuredContentBlock') return true;
    result = { node, pos, end: pos + node.nodeSize };
    return false;
  });
  expect(result).not.toBeNull();
  return result;
};

const findBlockSdtByText = (doc, text) => {
  let result = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'structuredContentBlock' || node.textContent !== text) return true;
    result = { node, pos, end: pos + node.nodeSize };
    return false;
  });
  expect(result).not.toBeNull();
  return result;
};

const makeDoc = (schema, lockMode = 'contentLocked') => {
  const imageRun = schema.nodes.run.create(null, schema.nodes.image.create());
  const sdt = schema.nodes.structuredContentBlock.create({ lockMode }, [
    paragraph(schema, 'Inner text'),
    schema.nodes.paragraph.create(null, imageRun),
  ]);
  return schema.node('doc', null, [paragraph(schema, 'Before'), sdt, paragraph(schema, 'After')]);
};

const makeNestedDoc = (schema, lockMode = 'contentLocked') => {
  const innerSdt = schema.nodes.structuredContentBlock.create({ lockMode }, [paragraph(schema, 'Nested text')]);
  const outerSdt = schema.nodes.structuredContentBlock.create({ lockMode: 'unlocked' }, [
    paragraph(schema, 'Outer before'),
    innerSdt,
    paragraph(schema, 'Outer after'),
  ]);
  return schema.node('doc', null, [paragraph(schema, 'Before'), outerSdt, paragraph(schema, 'After')]);
};

const makeEmptyBlockSdtDoc = (schema) => {
  const sdt = schema.nodes.structuredContentBlock.create({ lockMode: 'contentLocked' }, [
    schema.nodes.paragraph.create(),
  ]);
  return schema.node('doc', null, [paragraph(schema, 'Before'), sdt, paragraph(schema, 'After')]);
};

const makeAtomBlockSdtDoc = (schema) => {
  const sdt = schema.nodes.structuredContentBlock.create({ lockMode: 'contentLocked' }, [
    schema.nodes.mathBlock.create(),
  ]);
  return schema.node('doc', null, [paragraph(schema, 'Before'), sdt, paragraph(schema, 'After')]);
};

describe('selectBlockSdtBeforeTextBlockStart', () => {
  it.each(['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'])(
    'selects the previous %s block SDT content from the following textblock start',
    (lockMode) => {
      const schema = makeSchema();
      const doc = makeDoc(schema, lockMode);
      const sdt = findBlockSdt(doc);
      const afterStart = findTextPos(doc, 'After');
      const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });

      let dispatched;
      const ok = selectBlockSdtBeforeTextBlockStart()({ state, dispatch: (tr) => (dispatched = tr) });

      expect(ok).toBe(true);
      expect(dispatched).toBeDefined();
      expect(dispatched.selection).toBeInstanceOf(TextSelection);
      expect(dispatched.selection.from).toBe(findFirstContentCursorPosInNode(sdt.node, sdt.pos));
      expect(dispatched.selection.to).toBe(findLastContentCursorPosInNode(sdt.node, sdt.pos));
    },
  );

  it('returns false away from the following textblock start', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, findTextPos(doc, 'After', 1)),
    });
    const dispatch = vi.fn();

    const ok = selectBlockSdtBeforeTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['empty paragraph', makeEmptyBlockSdtDoc],
    ['block atom', makeAtomBlockSdtDoc],
  ])('returns false for previous block SDT with %s content', (_, makeAdjacentDoc) => {
    const schema = makeSchema();
    const doc = makeAdjacentDoc(schema);
    const afterStart = findTextPos(doc, 'After');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, afterStart) });
    const dispatch = vi.fn();

    const ok = selectBlockSdtBeforeTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('selects nested previous block SDT content from the following nested textblock start', () => {
    const schema = makeSchema();
    const doc = makeNestedDoc(schema);
    const nestedSdt = findBlockSdtByText(doc, 'Nested text');
    const outerAfterStart = findTextPos(doc, 'Outer after');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, outerAfterStart) });

    let dispatched;
    const ok = selectBlockSdtBeforeTextBlockStart()({ state, dispatch: (tr) => (dispatched = tr) });

    expect(ok).toBe(true);
    expect(dispatched.selection.from).toBe(findFirstContentCursorPosInNode(nestedSdt.node, nestedSdt.pos));
    expect(dispatched.selection.to).toBe(findLastContentCursorPosInNode(nestedSdt.node, nestedSdt.pos));
  });
});

describe('selectBlockSdtAfterTextBlockEnd', () => {
  it.each(['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'])(
    'selects the next %s block SDT content from the preceding textblock end',
    (lockMode) => {
      const schema = makeSchema();
      const doc = makeDoc(schema, lockMode);
      const sdt = findBlockSdt(doc);
      const beforeEnd = findTextPos(doc, 'Before', 'Before'.length);
      const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });

      let dispatched;
      const ok = selectBlockSdtAfterTextBlockEnd()({ state, dispatch: (tr) => (dispatched = tr) });

      expect(ok).toBe(true);
      expect(dispatched).toBeDefined();
      expect(dispatched.selection).toBeInstanceOf(TextSelection);
      expect(dispatched.selection.from).toBe(findFirstContentCursorPosInNode(sdt.node, sdt.pos));
      expect(dispatched.selection.to).toBe(findLastContentCursorPosInNode(sdt.node, sdt.pos));
    },
  );

  it.each([
    ['empty paragraph', makeEmptyBlockSdtDoc],
    ['block atom', makeAtomBlockSdtDoc],
  ])('returns false for next block SDT with %s content', (_, makeAdjacentDoc) => {
    const schema = makeSchema();
    const doc = makeAdjacentDoc(schema);
    const beforeEnd = findTextPos(doc, 'Before', 'Before'.length);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, beforeEnd) });
    const dispatch = vi.fn();

    const ok = selectBlockSdtAfterTextBlockEnd()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('selects nested next block SDT content from the preceding nested textblock end', () => {
    const schema = makeSchema();
    const doc = makeNestedDoc(schema);
    const nestedSdt = findBlockSdtByText(doc, 'Nested text');
    const outerBeforeEnd = findTextPos(doc, 'Outer before', 'Outer before'.length);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, outerBeforeEnd) });

    let dispatched;
    const ok = selectBlockSdtAfterTextBlockEnd()({ state, dispatch: (tr) => (dispatched = tr) });

    expect(ok).toBe(true);
    expect(dispatched.selection.from).toBe(findFirstContentCursorPosInNode(nestedSdt.node, nestedSdt.pos));
    expect(dispatched.selection.to).toBe(findLastContentCursorPosInNode(nestedSdt.node, nestedSdt.pos));
  });
});
