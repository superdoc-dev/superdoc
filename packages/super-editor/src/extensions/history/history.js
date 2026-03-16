// @ts-nocheck
import { TextSelection } from 'prosemirror-state';
import { history, redo as originalRedo, undo as originalUndo } from 'prosemirror-history';
import { undo as yUndo, redo as yRedo, yUndoPlugin } from 'y-prosemirror';
import { Extension } from '@core/Extension.js';
import { CustomSelectionPluginKey, DEFAULT_SELECTION_STATE } from '../custom-selection/custom-selection.js';

function applySelectionCleanup(editor, tr) {
  let cleaned = tr.setMeta(CustomSelectionPluginKey, DEFAULT_SELECTION_STATE);

  const sel = cleaned.selection;
  if (sel && sel instanceof TextSelection && !sel.empty) {
    try {
      const collapsed = TextSelection.create(cleaned.doc, sel.head);
      cleaned = cleaned.setSelection(collapsed);
    } catch {
      // Ignore collapse failures and fall back to original selection
    }
  }

  editor.setOptions({
    preservedSelection: null,
    lastSelection: null,
  });

  return cleaned;
}

function createHistoryDispatch(editor, dispatch) {
  if (!dispatch) return dispatch;
  return (historyTr) => {
    const cleaned = applySelectionCleanup(editor, historyTr);
    dispatch(cleaned);
  };
}

function runSelectionCleanupAfterCollabHistory(editor) {
  const view = editor?.view;
  const state = editor?.state;
  if (!view || !state) return;

  let tr = applySelectionCleanup(editor, state.tr);
  // Avoid creating a new undo step for this synthetic cleanup transaction.
  tr = tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}

/**
 * Configuration options for History
 * @typedef {Object} HistoryOptions
 * @category Options
 * @property {number} [depth=100] - Maximum undo/redo steps to remember
 * @property {number} [newGroupDelay=500] - Milliseconds to wait before starting a new history group
 */

/**
 * @module History
 * @sidebarTitle History
 * @snippetPath /snippets/extensions/history.mdx
 * @shortcut Mod-z | undo | Undo last action
 * @shortcut Mod-Shift-z | redo | Redo last action
 * @shortcut Mod-y | redo | Redo last action (alternative)
 */
export const History = Extension.create({
  name: 'history',

  addOptions() {
    // https://prosemirror.net/docs/ref/#history.history
    return {
      depth: 100,
      newGroupDelay: 500,
    };
  },

  addPmPlugins() {
    if (this.editor.options.collaborationProvider && this.editor.options.ydoc) {
      const undoPlugin = createUndoPlugin();
      return [undoPlugin];
    }
    const historyPlugin = history(this.options);
    return [historyPlugin];
  },

  //prettier-ignore
  addCommands() {
    return {
      /**
       * Undo the last action
       * @category Command
       * @example
       * editor.commands.undo()
       * @note Groups changes within the newGroupDelay window
       */
      undo: () => ({ state, dispatch, tr }) => {
        if (this.editor.options.collaborationProvider && this.editor.options.ydoc) {
          tr.setMeta('preventDispatch', true);
          const result = yUndo(state);
          runSelectionCleanupAfterCollabHistory(this.editor);
          return result;
        }
        tr.setMeta('inputType', 'historyUndo');
        const wrappedDispatch = createHistoryDispatch(this.editor, dispatch);
        return originalUndo(state, wrappedDispatch);
      },

      /**
       * Redo the last undone action
       * @category Command
       * @example
       * editor.commands.redo()
       * @note Only available after an undo action
       */
      redo: () => ({ state, dispatch, tr }) => {
        if (this.editor.options.collaborationProvider && this.editor.options.ydoc) {
          tr.setMeta('preventDispatch', true);
          const result = yRedo(state);
          runSelectionCleanupAfterCollabHistory(this.editor);
          return result;
        }
        tr.setMeta('inputType', 'historyRedo');
        const wrappedDispatch = createHistoryDispatch(this.editor, dispatch);
        return originalRedo(state, wrappedDispatch);
      },
    };
  },

  addShortcuts() {
    return {
      'Mod-z': () => this.editor.commands.undo(),
      'Mod-Shift-z': () => this.editor.commands.redo(),
      'Mod-y': () => this.editor.commands.redo(),
    };
  },
});

const createUndoPlugin = () => {
  const yUndoPluginInstance = yUndoPlugin();
  return yUndoPluginInstance;
};
