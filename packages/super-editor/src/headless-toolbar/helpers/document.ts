import { undoDepth, redoDepth } from 'prosemirror-history';
import { yUndoPluginKey } from 'y-prosemirror';
import { isCommandDisabled } from './general.js';
import { resolveStateEditor } from './context.js';
import type { ToolbarCommandState, ToolbarContext } from '../types.js';

export const getCurrentUndoDepth = (context: ToolbarContext | null) => {
  const stateEditor = resolveStateEditor(context);

  if (!stateEditor?.state) {
    return 0;
  }

  try {
    if (stateEditor.options?.ydoc) {
      const undoManager = yUndoPluginKey.getState(stateEditor.state)?.undoManager;
      return undoManager?.undoStack?.length ?? 0;
    }

    return undoDepth(stateEditor.state);
  } catch {
    return 0;
  }
};

export const getCurrentRedoDepth = (context: ToolbarContext | null) => {
  const stateEditor = resolveStateEditor(context);

  if (!stateEditor?.state) {
    return 0;
  }

  try {
    if (stateEditor.options?.ydoc) {
      const undoManager = yUndoPluginKey.getState(stateEditor.state)?.undoManager;
      return undoManager?.redoStack?.length ?? 0;
    }

    return redoDepth(stateEditor.state);
  } catch {
    return 0;
  }
};

export const createHistoryStateDeriver =
  (kind: 'undo' | 'redo') =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    const isDisabled = isCommandDisabled(context);

    if (isDisabled) {
      return {
        active: false,
        disabled: true,
      };
    }

    const depth = kind === 'undo' ? getCurrentUndoDepth(context) : getCurrentRedoDepth(context);

    return {
      active: false,
      disabled: depth === 0,
    };
  };

export const createRulerStateDeriver =
  () =>
  ({ context, superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any> }): ToolbarCommandState => {
    return {
      active: Boolean(superdoc?.config?.rulers),
      disabled: isCommandDisabled(context),
    };
  };

export const createZoomStateDeriver =
  () =>
  ({ context, superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any> }): ToolbarCommandState => {
    return {
      active: false,
      disabled: !context,
      value: typeof superdoc?.getZoom === 'function' ? superdoc.getZoom() : 100,
    };
  };

export const createDocumentModeStateDeriver =
  () =>
  ({ context, superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any> }): ToolbarCommandState => {
    return {
      active: false,
      disabled: !context,
      value: superdoc?.config?.documentMode ?? 'editing',
    };
  };

export const createRulerExecute =
  () =>
  ({ superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any>; payload?: unknown }) => {
    superdoc.toggleRuler?.();
    return true;
  };

export const createZoomExecute =
  () =>
  ({ superdoc, payload }: { context: ToolbarContext | null; superdoc: Record<string, any>; payload?: unknown }) => {
    if (typeof payload !== 'number' || payload <= 0) {
      return false;
    }

    superdoc.setZoom?.(payload);
    return true;
  };

export const createDocumentModeExecute =
  () =>
  ({ superdoc, payload }: { context: ToolbarContext | null; superdoc: Record<string, any>; payload?: unknown }) => {
    const validModes = ['editing', 'suggesting', 'viewing'];

    if (
      typeof superdoc?.setDocumentMode !== 'function' ||
      typeof payload !== 'string' ||
      !validModes.includes(payload)
    ) {
      return false;
    }

    superdoc.setDocumentMode(payload);

    return true;
  };
