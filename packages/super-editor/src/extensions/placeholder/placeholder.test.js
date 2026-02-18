// @ts-check
import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
  },
});

/**
 * Recreates the placeholder plugin logic for testing without the Extension system.
 */
function createPlaceholderPlugin(placeholderText = 'Type something...') {
  const applyDecoration = (state) => {
    const plainText = state.doc.textBetween(0, state.doc.content.size, ' ', ' ');
    if (plainText !== '') return DecorationSet.empty;

    const { $from } = state.selection;
    if ($from.depth === 0) return DecorationSet.empty;
    const decoration = Decoration.node($from.before(), $from.after(), {
      'data-placeholder': placeholderText,
      class: 'sd-editor-placeholder',
    });
    return DecorationSet.create(state.doc, [decoration]);
  };

  return new Plugin({
    key: new PluginKey('placeholder'),
    state: {
      init: (_, state) => applyDecoration(state),
      apply: (tr, oldValue, oldState, newState) => applyDecoration(newState),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

describe('placeholder plugin', () => {
  it('adds decoration on empty document with cursor in paragraph', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]);
    const plugin = createPlaceholderPlugin();
    const state = EditorState.create({ doc, schema, plugins: [plugin] });

    const decorations = plugin.getState(state);
    expect(decorations.find()).toHaveLength(1);
    expect(decorations.find()[0].type.attrs['data-placeholder']).toBe('Type something...');
  });

  it('returns empty decorations when document has text', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('Hello')])]);
    const plugin = createPlaceholderPlugin();
    const state = EditorState.create({ doc, schema, plugins: [plugin] });

    const decorations = plugin.getState(state);
    expect(decorations).toBe(DecorationSet.empty);
  });

  it('does not throw when selection is at doc root (depth 0)', () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]);
    const plugin = createPlaceholderPlugin();
    const state = EditorState.create({ doc, schema, plugins: [plugin] });

    // TextSelection.create at pos 0 lands at doc root (depth 0)
    const tr = state.tr;
    tr.setSelection(TextSelection.create(doc, 0));
    const newState = state.apply(tr);

    expect(plugin.getState(newState)).toBe(DecorationSet.empty);
  });
});
