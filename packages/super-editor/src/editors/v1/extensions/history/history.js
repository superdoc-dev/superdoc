// @ts-nocheck
import { TextSelection } from 'prosemirror-state';
import { history, redo as originalRedo, undo as originalUndo } from 'prosemirror-history';
import { undo as yUndo, redo as yRedo, yUndoPlugin } from 'y-prosemirror';
import { Extension } from '@core/Extension.js';
import { CustomSelectionPluginKey } from '@core/selection-state.js';
import { DEFAULT_SELECTION_STATE } from '../custom-selection/custom-selection.js';

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

function createHistoryDispatch(editor, dispatch, inputType) {
  if (!dispatch) return dispatch;
  return (historyTr) => {
    let cleaned = applySelectionCleanup(editor, historyTr);
    if (inputType) {
      cleaned = cleaned.setMeta('inputType', inputType);
    }
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

function getPresentationHistoryProxy(editor) {
  const presentationEditor = editor?.presentationEditor ?? editor?._presentationEditor ?? null;
  if (!presentationEditor || typeof presentationEditor.getActiveEditor !== 'function') {
    return null;
  }

  return presentationEditor.getActiveEditor() === editor ? presentationEditor : null;
}

function resolveHistoryDispatch(editor, allowDispatch) {
  if (!allowDispatch) {
    return undefined;
  }

  return editor?.view?.dispatch?.bind(editor.view) ?? editor?.dispatch?.bind(editor);
}

export function runEditorUndo(editor, options = {}) {
  const state = editor?.state;
  const tr = state?.tr;
  const allowDispatch = options.allowDispatch !== false;
  const inputType = 'historyUndo';
  if (!state || !tr) {
    return false;
  }

  const dispatch = resolveHistoryDispatch(editor, allowDispatch);

  if (editor.options.collaborationProvider && editor.options.ydoc) {
    const result = yUndo(state, dispatch);
    if (allowDispatch && result) {
      runSelectionCleanupAfterCollabHistory(editor);
    }
    return result;
  }

  const wrappedDispatch = createHistoryDispatch(editor, dispatch, allowDispatch ? inputType : undefined);
  return originalUndo(state, wrappedDispatch);
}

export function runEditorRedo(editor, options = {}) {
  const state = editor?.state;
  const tr = state?.tr;
  const allowDispatch = options.allowDispatch !== false;
  const inputType = 'historyRedo';
  if (!state || !tr) {
    return false;
  }

  const dispatch = resolveHistoryDispatch(editor, allowDispatch);

  if (editor.options.collaborationProvider && editor.options.ydoc) {
    const result = yRedo(state, dispatch);
    if (allowDispatch && result) {
      runSelectionCleanupAfterCollabHistory(editor);
    }
    return result;
  }

  const wrappedDispatch = createHistoryDispatch(editor, dispatch, allowDispatch ? inputType : undefined);
  return originalRedo(state, wrappedDispatch);
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
      undo: () => ({ tr, dispatch }) => {
        tr?.setMeta('preventDispatch', true);
        const allowDispatch = typeof dispatch === 'function';
        const presentationEditor = getPresentationHistoryProxy(this.editor);
        if (presentationEditor) {
          if (allowDispatch && typeof presentationEditor.undo === 'function') {
            return Boolean(presentationEditor.undo());
          }
          return typeof presentationEditor.canUndo === 'function' ? Boolean(presentationEditor.canUndo()) : false;
        }
        return runEditorUndo(this.editor, { allowDispatch });
      },

      /**
       * Redo the last undone action
       * @category Command
       * @example
       * editor.commands.redo()
       * @note Only available after an undo action
       */
      redo: () => ({ tr, dispatch }) => {
        tr?.setMeta('preventDispatch', true);
        const allowDispatch = typeof dispatch === 'function';
        const presentationEditor = getPresentationHistoryProxy(this.editor);
        if (presentationEditor) {
          if (allowDispatch && typeof presentationEditor.redo === 'function') {
            return Boolean(presentationEditor.redo());
          }
          return typeof presentationEditor.canRedo === 'function' ? Boolean(presentationEditor.canRedo()) : false;
        }
        return runEditorRedo(this.editor, { allowDispatch });
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
