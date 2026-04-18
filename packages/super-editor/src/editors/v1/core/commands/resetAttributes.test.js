// @ts-check
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { resetAttributes } from './resetAttributes.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: {
        title: { default: null },
        nested: { default: {} },
      },
      toDOM: (node) => ['p', node.attrs, 0],
      parseDOM: [{ tag: 'p' }],
    },
  },
  marks: {
    highlight: {
      attrs: {
        color: { default: 'yellow' },
        meta: { default: {} },
      },
      toDOM: (mark) => ['span', { 'data-color': mark.attrs.color }],
    },
  },
});

const createState = (doc) => {
  const selection = TextSelection.create(doc, 1, doc.content.size - 1);
  return EditorState.create({ doc, selection });
};

describe('resetAttributes', () => {
  it('removes node attributes using simple and dot-notation keys', () => {
    const paragraph = schema.nodes.paragraph.create(
      { title: 'Heading', nested: { deep: { keep: true, drop: 'x' } }, extra: 'value' },
      schema.text('Hello'),
    );
    const doc = schema.nodes.doc.create({}, paragraph);
    let state = createState(doc);
    let appliedTr = null;

    const command = resetAttributes('paragraph', ['title', 'nested.deep.drop']);
    const dispatched = command({
      state,
      tr: state.tr,
      dispatch: (tr) => {
        appliedTr = tr;
        state = state.apply(tr);
      },
    });

    expect(dispatched).toBe(true);
    expect(appliedTr).not.toBeNull();

    const updated = state.doc.firstChild;
    // resetAttributes restores defaults rather than deleting keys
    expect(updated.attrs.title).toBeNull();
    expect(updated.attrs.nested).toEqual({ deep: { keep: true } });
    expect(updated.attrs.extra).toBeUndefined();
  });

  it('resets mark attributes across the selection', () => {
    const highlight = schema.marks.highlight.create({ color: 'red', meta: { temp: true, keep: 1 } });
    const paragraph = schema.nodes.paragraph.create({}, schema.text('Hi', [highlight]));
    const doc = schema.nodes.doc.create({}, paragraph);
    let state = createState(doc);
    let appliedTr = null;

    const command = resetAttributes('highlight', ['color', 'meta.temp']);
    const dispatched = command({
      state,
      tr: state.tr,
      dispatch: (tr) => {
        appliedTr = tr;
        state = state.apply(tr);
      },
    });

    expect(dispatched).toBe(true);
    expect(appliedTr).not.toBeNull();
    const textNode = state.doc.firstChild.firstChild;
    const updatedMark = textNode.marks.find((m) => m.type === schema.marks.highlight);
    // Default from schema should be restored
    expect(updatedMark.attrs.color).toBe('yellow');
    expect(updatedMark.attrs.meta).toEqual({ keep: 1 });
  });

  it('returns false when the schema type is not found', () => {
    const paragraph = schema.nodes.paragraph.create({}, schema.text('Hello'));
    const doc = schema.nodes.doc.create({}, paragraph);
    const state = createState(doc);

    const command = resetAttributes('unknown', ['foo']);
    const result = command({ state, tr: state.tr, dispatch: () => {} });

    expect(result).toBe(false);
  });
});
