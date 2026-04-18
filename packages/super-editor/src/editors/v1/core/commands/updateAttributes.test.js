// @ts-check
import { describe, it, expect } from 'vitest';
import { Schema, DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { updateAttributes } from './updateAttributes.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { default: 1 },
        nested: { default: {} },
      },
      toDOM: (node) => ['p', node.attrs, 0],
      parseDOM: [
        {
          tag: 'p',
          getAttrs: (dom) => ({
            level: Number(dom.getAttribute('data-level')) || 1,
            nested: JSON.parse(dom.getAttribute('data-nested') || '{}'),
          }),
        },
      ],
    },
  },
  marks: {
    strong: {
      attrs: {
        color: { default: null },
        nested: { default: {} },
      },
      toDOM: (mark) => ['strong', { 'data-color': mark.attrs.color }],
      parseDOM: [{ tag: 'strong' }],
    },
  },
});

const createState = (doc) => {
  const selection = TextSelection.create(doc, 1, doc.content.size - 1);
  return EditorState.create({ doc, selection });
};

describe('updateAttributes', () => {
  it('merges nested attributes on a node using dot notation', () => {
    const paragraph = schema.nodes.paragraph.create({ level: 1, nested: { existing: true } }, schema.text('Hello'));
    const doc = schema.nodes.doc.create({}, paragraph);
    let state = createState(doc);
    let appliedTr = null;

    const command = updateAttributes('paragraph', { level: 2, 'nested.deep': 'value' });
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
    const updatedParagraph = state.doc.firstChild;
    expect(updatedParagraph.attrs.level).toBe(2);
    expect(updatedParagraph.attrs.nested).toEqual({ existing: true, deep: 'value' });
  });

  it('updates mark attributes within the selection', () => {
    const strong = schema.marks.strong.create({ color: 'red', nested: { foo: 'bar' } });
    const paragraph = schema.nodes.paragraph.create({}, schema.text('Bold', [strong]));
    const doc = schema.nodes.doc.create({}, paragraph);
    let state = createState(doc);
    let appliedTr = null;

    const command = updateAttributes('strong', { color: 'blue', 'nested.deep': 3 });
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
    const updatedMark = textNode.marks.find((m) => m.type === schema.marks.strong);
    expect(updatedMark).toBeTruthy();
    expect(updatedMark.attrs.color).toBe('blue');
    expect(updatedMark.attrs.nested).toEqual({ foo: 'bar', deep: 3 });
  });

  it('returns false if the schema type does not exist', () => {
    const paragraph = schema.nodes.paragraph.create({}, schema.text('Hello'));
    const doc = schema.nodes.doc.create({}, paragraph);
    const state = createState(doc);

    const command = updateAttributes('does_not_exist', { foo: 'bar' });
    const result = command({ state, tr: state.tr, dispatch: () => {} });

    expect(result).toBe(false);
  });
});
