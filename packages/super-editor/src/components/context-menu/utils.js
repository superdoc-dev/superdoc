import { selectionHasNodeOrMark } from '../cursor-helpers.js';
import { tableActionsOptions } from './constants.js';
import { markRaw } from 'vue';
import { undoDepth, redoDepth } from 'prosemirror-history';
import { yUndoPluginKey } from 'y-prosemirror';
import {
  collectTrackedChanges,
  collectTrackedChangesForContext,
} from '@extensions/track-changes/permission-helpers.js';
import { isList } from '@core/commands/list-helpers';
/**
 * Get props by item id
 *
 * Takes in the itemId for the menu item and passes the ContextMenu props to help
 * compute the props needed
 * @param {string} itemId
 * @param {Object} props
 * @returns {Object}
 */
export const getPropsByItemId = (itemId, props) => {
  // Common props that are needed regardless of trigger type
  const editor = props.editor;

  const baseProps = {
    editor: markRaw(props.editor),
  };

  switch (itemId) {
    case 'insert-text':
      const { state } = editor.view;
      const { from, to, empty } = state.selection;
      const selectedText = !empty ? state.doc.textBetween(from, to) : '';

      return {
        ...baseProps,
        selectedText,
        handleClose: props.closePopover || (() => null),
        apiKey: editor.options?.aiApiKey,
        endpoint: editor.options?.aiEndpoint,
      };
    case 'insert-link':
      return baseProps;
    case 'insert-table':
      return {
        ...baseProps,
        onSelect: ({ rows, cols }) => {
          editor.commands.insertTable({ rows, cols });
          props.closePopover();
        },
      };
    case 'edit-table':
      return {
        ...baseProps,
        options: tableActionsOptions,
        onSelect: ({ command }) => {
          if (editor.commands[command]) {
            editor.commands[command]();
          }
          props.closePopover();
        },
      };
    case 'copy':
    case 'paste':
      return {
        ...baseProps,
        // These actions don't need additional props
      };

    default:
      return baseProps;
  }
};

/**
 * Get the current editor context for menu logic
 *
 * @param {Object} editor - The editor instance
 * @param {MouseEvent} [event] - Optional mouse event (for context menu)
 * @returns {Promise<Object>} context - Enhanced editor context with comprehensive state information
 */
export async function getEditorContext(editor, event) {
  if (!editor) return null;

  const state = editor.state;
  if (!state) return null;

  const { from, to, empty } = state.selection;
  const selectedText = !empty ? state.doc.textBetween(from, to) : '';

  let pos = null;
  let node = null;

  if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
    const coords = { left: event.clientX, top: event.clientY };
    const hit = editor.posAtCoords?.(coords);
    if (typeof hit?.pos === 'number') {
      pos = hit.pos;
      node = state.doc.nodeAt(pos);
    }
  }

  if (pos === null && typeof from === 'number') {
    pos = from;
    node = state.doc.nodeAt(pos);
  }

  // Don't read clipboard proactively to avoid permission prompts
  // Clipboard will be read only when user actually clicks "Paste"
  const clipboardContent = {
    html: null,
    text: null,
    hasContent: true, // Assume clipboard might have content - we'll check on paste
    raw: null,
  };

  const structureFromResolvedPos = pos !== null ? getStructureFromResolvedPos(state, pos) : null;
  const isInTable =
    structureFromResolvedPos?.isInTable ?? selectionHasNodeOrMark(state, 'table', { requireEnds: true });
  const isInList = structureFromResolvedPos?.isInList ?? selectionIncludesListParagraph(state);
  const isInSectionNode =
    structureFromResolvedPos?.isInSectionNode ??
    selectionHasNodeOrMark(state, 'documentSection', { requireEnds: true });
  const currentNodeType = node?.type?.name || null;

  const activeMarks = [];
  let trackedChangeId = null;

  if (event && pos !== null) {
    const $pos = state.doc.resolve(pos);

    const processMark = (mark) => {
      if (!activeMarks.includes(mark.type.name)) {
        activeMarks.push(mark.type.name);
      }
      if (
        !trackedChangeId &&
        (mark.type.name === 'trackInsert' || mark.type.name === 'trackDelete' || mark.type.name === 'trackFormat')
      ) {
        trackedChangeId = mark.attrs.id;
      }
    };

    $pos.marks().forEach(processMark);

    const nodeBefore = $pos.nodeBefore;
    const nodeAfter = $pos.nodeAfter;

    if (nodeBefore?.marks) {
      nodeBefore.marks.forEach(processMark);
    }

    if (nodeAfter?.marks) {
      nodeAfter.marks.forEach(processMark);
    }

    state.storedMarks?.forEach(processMark);
  } else {
    state.storedMarks?.forEach((mark) => activeMarks.push(mark.type.name));
    state.selection.$head.marks().forEach((mark) => activeMarks.push(mark.type.name));
  }

  const isTrackedChange =
    activeMarks.includes('trackInsert') || activeMarks.includes('trackDelete') || activeMarks.includes('trackFormat');

  const trackedChanges =
    event && pos !== null
      ? collectTrackedChangesForContext({ state, pos, trackedChangeId })
      : collectTrackedChanges({ state, from, to });

  const cursorCoords = pos !== null ? editor.coordsAtPos?.(pos) : null;
  const cursorPosition = cursorCoords
    ? {
        x: cursorCoords.left,
        y: cursorCoords.top,
      }
    : event
      ? { x: event.clientX, y: event.clientY }
      : null;

  return {
    selectedText,
    hasSelection: !empty,
    selectionStart: from,
    selectionEnd: to,
    isInTable,
    isInList,
    isInSectionNode,
    currentNodeType,
    activeMarks,
    isTrackedChange,
    trackedChangeId,
    documentMode: editor.options?.documentMode || 'editing',
    canUndo: computeCanUndo(editor, state),
    canRedo: computeCanRedo(editor, state),
    isEditable: editor.isEditable,
    clipboardContent,
    cursorPosition,
    pos,
    node,
    event,
    trigger: event ? 'click' : 'slash',
    editor,
    trackedChanges,
  };
}

function computeCanUndo(editor, state) {
  if (typeof editor?.can === 'function') {
    try {
      const can = editor.can();
      if (can && typeof can.undo === 'function') {
        return !!can.undo();
      }
    } catch (error) {
      console.warn('[ContextMenu] Unable to determine undo availability via editor.can():', error);
    }
  }

  if (isCollaborationEnabled(editor)) {
    try {
      const undoManager = yUndoPluginKey.getState(state)?.undoManager;
      return !!undoManager && undoManager.undoStack.length > 0;
    } catch (error) {
      console.warn('[ContextMenu] Unable to determine undo availability via y-prosemirror:', error);
    }
  }

  try {
    return undoDepth(state) > 0;
  } catch (error) {
    console.warn('[ContextMenu] Unable to determine undo availability via history plugin:', error);
    return false;
  }
}

function computeCanRedo(editor, state) {
  if (typeof editor?.can === 'function') {
    try {
      const can = editor.can();
      if (can && typeof can.redo === 'function') {
        return !!can.redo();
      }
    } catch (error) {
      console.warn('[ContextMenu] Unable to determine redo availability via editor.can():', error);
    }
  }

  if (isCollaborationEnabled(editor)) {
    try {
      const undoManager = yUndoPluginKey.getState(state)?.undoManager;
      return !!undoManager && undoManager.redoStack.length > 0;
    } catch (error) {
      console.warn('[ContextMenu] Unable to determine redo availability via y-prosemirror:', error);
    }
  }

  try {
    return redoDepth(state) > 0;
  } catch (error) {
    console.warn('[ContextMenu] Unable to determine redo availability via history plugin:', error);
    return false;
  }
}

function isCollaborationEnabled(editor) {
  return Boolean(editor?.options?.collaborationProvider && editor?.options?.ydoc);
}

function selectionIncludesListParagraph(state) {
  const { $from, $to, from, to } = state.selection;

  const hasListInResolvedPos = ($pos) => {
    for (let depth = $pos.depth; depth > 0; depth--) {
      if (isList($pos.node(depth))) {
        return true;
      }
    }
    return false;
  };

  if (hasListInResolvedPos($from) || hasListInResolvedPos($to)) {
    return true;
  }

  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (isList(node)) {
      found = true;
      return false;
    }
    return true;
  });

  return found;
}

function getStructureFromResolvedPos(state, pos) {
  try {
    const $pos = state.doc.resolve(pos);
    let isInList = false;
    let isInTable = false;
    let isInSectionNode = false;

    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      const name = node.type.name;

      if (!isInList && isList(node)) {
        isInList = true;
      }

      if (!isInTable && (name === 'table' || name === 'tableRow' || name === 'tableCell' || name === 'tableHeader')) {
        isInTable = true;
      }

      if (!isInSectionNode && name === 'documentSection') {
        isInSectionNode = true;
      }

      if (isInList && isInTable && isInSectionNode) {
        break;
      }
    }

    return {
      isInTable,
      isInList,
      isInSectionNode,
    };
  } catch (error) {
    console.warn('[ContextMenu] Unable to resolve position for structural context:', error);
    return null;
  }
}

export {
  getStructureFromResolvedPos as __getStructureFromResolvedPosForTest,
  isCollaborationEnabled as __isCollaborationEnabledForTest,
};
