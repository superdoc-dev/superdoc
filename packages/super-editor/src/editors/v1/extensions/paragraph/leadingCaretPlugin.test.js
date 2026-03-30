// @ts-check
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { createLeadingCaretPlugin } from './leadingCaretPlugin.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    blockquote: {
      content: 'paragraph+',
      group: 'block',
      toDOM: () => ['blockquote', 0],
      parseDOM: [{ tag: 'blockquote' }],
    },
    paragraph: {
      content: 'inline*',
      group: 'block',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    run: {
      content: 'inline*',
      inline: true,
      group: 'inline',
      toDOM: () => ['span', { 'data-run': 'true' }, 0],
      parseDOM: [{ tag: 'span[data-run]' }],
    },
    fieldAnnotation: {
      inline: true,
      group: 'inline',
      atom: true,
      toDOM: () => ['span', { 'data-field-annotation': 'true' }],
      parseDOM: [{ tag: 'span[data-field-annotation]' }],
    },
    text: { group: 'inline' },
  },
});

const buildDocWithNestedAnnotation = () => {
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.nodes.run.create(null, [schema.nodes.fieldAnnotation.create(), schema.text('Hello')]),
  ]);
  return schema.nodes.doc.create(null, [schema.nodes.blockquote.create(null, [paragraph])]);
};

describe('leadingCaretPlugin', () => {
  it('adds a leading caret decoration for nested paragraphs', () => {
    const doc = buildDocWithNestedAnnotation();
    const plugin = createLeadingCaretPlugin();
    const state = EditorState.create({ doc, schema, plugins: [plugin] });

    const decorations = plugin.spec.props.decorations(state);

    expect(decorations).not.toBeNull();
    expect(decorations.find()).toHaveLength(1);
  });
});
