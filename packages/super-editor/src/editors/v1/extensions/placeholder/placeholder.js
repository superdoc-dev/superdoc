import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Extension } from '@core/Extension.js';

/**
 * Configuration options for Placeholder
 * @typedef {Object} PlaceholderOptions
 * @category Options
 * @property {string} [placeholder='Type something...'] - Placeholder text to display when editor is empty
 */

/**
 * @module Placeholder
 * @sidebarTitle Placeholder
 * @snippetPath /snippets/extensions/placeholder.mdx
 */
export const Placeholder = Extension.create({
  name: 'placeholder',

  addOptions() {
    return {
      placeholder: 'Type something...',
    };
  },

  addPmPlugins() {
    const applyDecoration = (state) => {
      const plainText = state.doc.textBetween(0, state.doc.content.size, ' ', ' ');
      if (plainText !== '') return DecorationSet.empty;

      const { $from } = state.selection;
      if ($from.depth === 0) return DecorationSet.empty;
      const decoration = Decoration.node($from.before(), $from.after(), {
        'data-placeholder': this.options.placeholder,
        class: 'sd-editor-placeholder',
      });
      return DecorationSet.create(state.doc, [decoration]);
    };

    const placeholderPlugin = new Plugin({
      key: new PluginKey('placeholder'),
      state: {
        init: (_, state) => {
          return applyDecoration(state);
        },
        apply: (tr, oldValue, oldState, newState) => {
          return applyDecoration(newState);
        },
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    });

    return [placeholderPlugin];
  },
});
