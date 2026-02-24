import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Extension } from '@core/Extension.js';

const focusPluginKey = new PluginKey('focus');

/**
 * Custom highlight/focus plugin for highlighting a range (e.g. clause selection).
 * Exposes setFocus(from, to) and clearFocus() commands.
 * Rendered in presentation mode via DecorationBridge (background on painted text).
 *
 * @module Focus
 * @category Plugin
 */
export const Focus = Extension.create({
  name: 'focus',

  addPmPlugins() {
    const pluginKey = focusPluginKey;

    const focusPlugin = new Plugin({
      key: pluginKey,

      state: {
        init() {
          return DecorationSet.empty;
        },

        apply(tr, pluginState) {
          const meta = tr.getMeta(pluginKey);
          if (!meta) {
            return pluginState.map(tr.mapping, tr.doc);
          }

          const { from, to } = meta;
          if (from === to) {
            return DecorationSet.empty;
          }

          const decorations = [
            Decoration.inline(from, to, {
              class: 'highlight-selection',
            }),
          ];

          return DecorationSet.create(tr.doc, decorations);
        },
      },

      props: {
        decorations(state) {
          return pluginKey.getState(state);
        },
      },
    });

    return [focusPlugin];
  },

  addCommands() {
    const pluginKey = focusPluginKey;

    return {
      /**
       * Highlight a range in the document (e.g. selected clause).
       * @param {number} from - Start position
       * @param {number} to - End position
       * @category Command
       * @example
       * const [from, to] = [state.selection.from, state.selection.to];
       * editor.commands.setFocus(from, to);
       */
      setFocus:
        (from, to) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            const tr = state.tr.setMeta(pluginKey, { from, to });
            dispatch(tr);
          }
          return true;
        },

      /**
       * Clear the focus/highlight decoration.
       * @category Command
       * @example
       * editor.commands.clearFocus();
       */
      clearFocus:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            const tr = state.tr.setMeta(pluginKey, { from: 0, to: 0 });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
