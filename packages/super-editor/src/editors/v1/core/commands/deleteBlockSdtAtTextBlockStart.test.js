import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { deleteBlockSdtAtTextBlockStart } from './deleteBlockSdtAtTextBlockStart.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      structuredContentBlock: {
        group: 'block',
        content: 'block*',
        isolating: true,
        attrs: {
          lockMode: { default: 'unlocked' },
        },
      },
      text: { group: 'inline' },
    },
    marks: {},
  });

const makeDoc = (schema, lockMode = 'unlocked', sdtContent = [schema.node('paragraph', null, schema.text('Inner'))]) =>
  schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('Before')),
    schema.node('structuredContentBlock', { lockMode }, sdtContent),
    schema.node('paragraph', null, schema.text('After')),
  ]);

const findBlockSdt = (doc) => {
  let result = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'structuredContentBlock') {
      result = { node, pos, end: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  return result;
};

const paragraphStartInSdt = (doc, index = 0) => {
  const sdt = findBlockSdt(doc);
  expect(sdt).not.toBeNull();

  let seen = 0;
  let start = null;
  sdt.node.descendants((node, offset) => {
    if (node.type.name !== 'paragraph') return true;
    if (seen === index) {
      start = sdt.pos + 1 + offset + 1;
      return false;
    }
    seen += 1;
    return true;
  });

  expect(start).not.toBeNull();
  return start;
};

describe('deleteBlockSdtAtTextBlockStart', () => {
  it('deletes an unlocked block SDT when the caret is at the start of its first paragraph', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, paragraphStartInSdt(doc)) });

    let dispatched;
    const ok = deleteBlockSdtAtTextBlockStart()({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    expect(findBlockSdt(dispatched.doc)).toBeNull();
    expect(dispatched.doc.textContent).toBe('BeforeAfter');
  });

  it('returns false for sdtLocked so Delete can fall through for in-SDT content edits', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema, 'sdtLocked');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, paragraphStartInSdt(doc)) });
    const dispatch = vi.fn();

    const ok = deleteBlockSdtAtTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('consumes sdtContentLocked block SDT wrapper delete without dispatching', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema, 'sdtContentLocked');
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, paragraphStartInSdt(doc)) });
    const dispatch = vi.fn();

    const ok = deleteBlockSdtAtTextBlockStart()({ state, dispatch });

    expect(ok).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false when the caret is not at the paragraph start', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, paragraphStartInSdt(doc) + 1),
    });
    const dispatch = vi.fn();

    const ok = deleteBlockSdtAtTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false from later paragraphs inside the same block SDT', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema, 'unlocked', [
      schema.node('paragraph', null, schema.text('First')),
      schema.node('paragraph', null, schema.text('Second')),
    ]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, paragraphStartInSdt(doc, 1)),
    });
    const dispatch = vi.fn();

    const ok = deleteBlockSdtAtTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns false outside a block SDT', () => {
    const schema = makeSchema();
    const doc = makeDoc(schema);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 1) });
    const dispatch = vi.fn();

    const ok = deleteBlockSdtAtTextBlockStart()({ state, dispatch });

    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
