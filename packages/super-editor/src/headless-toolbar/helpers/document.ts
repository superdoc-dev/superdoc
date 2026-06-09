import { undoDepth, redoDepth } from 'prosemirror-history';
import { yUndoPluginKey } from 'y-prosemirror';
import { isCommandDisabled, isMutationCommandDisabled } from './general.js';
import { resolveStateEditor } from './context.js';
import type { ToolbarCommandState, ToolbarContext } from '../types.js';

/**
 * Document-wide history state takes precedence when a PresentationEditor
 * with an active unified-history coordinator is wired up — it reports the
 * cross-surface stack depths instead of whichever editor currently holds
 * focus.
 */
const readCoordinatorDepths = (context: ToolbarContext | null): { undoDepth: number; redoDepth: number } | null => {
  const state = context?.presentationEditor?.getHistoryState?.();
  if (!state) return null;
  return { undoDepth: state.undoDepth, redoDepth: state.redoDepth };
};

export const getCurrentUndoDepth = (context: ToolbarContext | null) => {
  const coordinatorDepths = readCoordinatorDepths(context);
  if (coordinatorDepths) return coordinatorDepths.undoDepth;

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
  const coordinatorDepths = readCoordinatorDepths(context);
  if (coordinatorDepths) return coordinatorDepths.redoDepth;

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

/**
 * Disable a toolbar control when a document-api operation is unavailable
 * (missing extension commands, tracked-mode restrictions, etc.).
 */
export const createDocumentOperationCapabilityStateDeriver =
  (operationId: string) =>
  ({ context }: { context: ToolbarContext | null }): ToolbarCommandState => {
    if (isMutationCommandDisabled(context)) {
      return {
        active: false,
        disabled: true,
      };
    }

    const doc = context?.target?.doc;
    if (typeof doc?.capabilities !== 'function') {
      return {
        active: false,
        disabled: true,
      };
    }

    try {
      const available = Boolean(doc.capabilities().operations[operationId]?.available);
      return {
        active: false,
        disabled: !available,
      };
    } catch {
      return {
        active: false,
        disabled: true,
      };
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

export const createFormattingMarksStateDeriver =
  () =>
  ({ superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any> }): ToolbarCommandState => {
    return {
      active: Boolean(superdoc?.config?.layoutEngineOptions?.showFormattingMarks),
      disabled: typeof superdoc?.toggleFormattingMarks !== 'function',
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

export const createZoomFitWidthStateDeriver =
  () =>
  ({ context, superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any> }): ToolbarCommandState => {
    const mode = typeof superdoc?.getZoomState === 'function' ? superdoc.getZoomState()?.mode : undefined;
    return {
      active: mode === 'fit-width',
      disabled: !context || typeof superdoc?.setZoomMode !== 'function',
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

export const createFormattingMarksExecute =
  () =>
  ({ superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any>; payload?: unknown }) => {
    if (typeof superdoc?.toggleFormattingMarks !== 'function') return false;
    superdoc.toggleFormattingMarks();
    return true;
  };

export const createZoomExecute =
  () =>
  ({ superdoc, payload }: { context: ToolbarContext | null; superdoc: Record<string, any>; payload?: unknown }) => {
    const normalizedPayload = Number.parseInt(String(payload), 10);

    if (!Number.isFinite(normalizedPayload) || normalizedPayload <= 0) {
      return false;
    }

    superdoc.setZoom?.(normalizedPayload);
    return true;
  };

// Toggle fit-width mode. A second activation returns to manual at the
// current value, matching toolbar toggle conventions; numeric zoom stays
// on the separate `zoom` command.
export const createZoomFitWidthExecute =
  () =>
  ({ superdoc }: { context: ToolbarContext | null; superdoc: Record<string, any>; payload?: unknown }) => {
    if (typeof superdoc?.setZoomMode !== 'function') return false;
    const mode = typeof superdoc.getZoomState === 'function' ? superdoc.getZoomState()?.mode : undefined;
    superdoc.setZoomMode(mode === 'fit-width' ? 'manual' : 'fit-width');
    return true;
  };

export const createDocumentModeExecute =
  () =>
  ({ superdoc, payload }: { context: ToolbarContext | null; superdoc: Record<string, any>; payload?: unknown }) => {
    const validModes = ['editing', 'suggesting', 'viewing'];
    const normalizedPayload = typeof payload === 'string' ? payload.toLowerCase() : payload;

    if (
      typeof superdoc?.setDocumentMode !== 'function' ||
      typeof normalizedPayload !== 'string' ||
      !validModes.includes(normalizedPayload)
    ) {
      return false;
    }

    superdoc.setDocumentMode(normalizedPayload);

    return true;
  };
