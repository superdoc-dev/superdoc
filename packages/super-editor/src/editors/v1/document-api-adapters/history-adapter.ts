import { undoDepth, redoDepth } from 'prosemirror-history';
import { yUndoPluginKey } from 'y-prosemirror';
import type { HistoryAdapter, HistoryState, HistoryActionResult, OperationId } from '@superdoc/document-api';
import { OPERATION_IDS, COMMAND_CATALOG } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { DocumentApiAdapterError } from './errors.js';

function isCollabHistory(editor: Editor): boolean {
  return Boolean(editor.options.collaborationProvider && editor.options.ydoc);
}

function getUndoDepth(editor: Editor): number {
  if (!editor.state) return 0;
  try {
    if (isCollabHistory(editor)) {
      const undoManager = yUndoPluginKey.getState(editor.state)?.undoManager;
      return undoManager?.undoStack?.length ?? 0;
    }
    return undoDepth(editor.state);
  } catch {
    return 0;
  }
}

function getRedoDepth(editor: Editor): number {
  if (!editor.state) return 0;
  try {
    if (isCollabHistory(editor)) {
      const undoManager = yUndoPluginKey.getState(editor.state)?.undoManager;
      return undoManager?.redoStack?.length ?? 0;
    }
    return redoDepth(editor.state);
  } catch {
    return 0;
  }
}

/** Cached list of history-unsafe operation IDs, computed once from the catalog. */
const HISTORY_UNSAFE_OPS: readonly OperationId[] = OPERATION_IDS.filter(
  (id) => COMMAND_CATALOG[id].historyUnsafe === true,
);

export function createHistoryAdapter(editor: Editor): HistoryAdapter {
  return {
    get(): HistoryState {
      const ud = getUndoDepth(editor);
      const rd = getRedoDepth(editor);
      return {
        undoDepth: ud,
        redoDepth: rd,
        canUndo: ud > 0,
        canRedo: rd > 0,
        historyUnsafeOperations: HISTORY_UNSAFE_OPS,
      };
    },

    undo(): HistoryActionResult {
      if (typeof editor.commands?.undo !== 'function') {
        throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'history.undo command is not available.', {
          reason: 'missing_command',
        });
      }
      const revBefore = getRevision(editor);
      const depth = getUndoDepth(editor);
      if (depth === 0) {
        return { noop: true, reason: 'EMPTY_UNDO_STACK', revision: { before: revBefore, after: revBefore } };
      }
      const success = Boolean(editor.commands.undo());
      const revAfter = getRevision(editor);
      return {
        noop: !success,
        reason: success ? undefined : 'NO_EFFECT',
        revision: { before: revBefore, after: revAfter },
      };
    },

    redo(): HistoryActionResult {
      if (typeof editor.commands?.redo !== 'function') {
        throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'history.redo command is not available.', {
          reason: 'missing_command',
        });
      }
      const revBefore = getRevision(editor);
      const depth = getRedoDepth(editor);
      if (depth === 0) {
        return { noop: true, reason: 'EMPTY_REDO_STACK', revision: { before: revBefore, after: revBefore } };
      }
      const success = Boolean(editor.commands.redo());
      const revAfter = getRevision(editor);
      return {
        noop: !success,
        reason: success ? undefined : 'NO_EFFECT',
        revision: { before: revBefore, after: revAfter },
      };
    },
  };
}
