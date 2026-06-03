import { selectionHasNodeOrMark } from '../cursor-helpers.js';
import { tableActionsOptions } from './constants.js';
import { findTocAncestor } from '@extensions/table-of-contents/find-toc-ancestor.js';
import { markRaw } from 'vue';
import { undoDepth, redoDepth } from 'prosemirror-history';
import { yUndoPluginKey } from 'y-prosemirror';
import {
  collectTrackedChanges,
  collectTrackedChangesForContext,
} from '@extensions/track-changes/permission-helpers.js';
import { isList } from '@core/commands/list-helpers';
import { isCellSelection } from '@extensions/table/tableHelpers/isCellSelection.js';
import { hasExpandedSelection } from '@utils/selectionUtils.js';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { selectedRect } from 'prosemirror-tables';

export const resolveContextMenuCommandEditor = (editor) => {
  return typeof editor?.getActiveEditor === 'function' ? editor.getActiveEditor() : editor;
};

const TRACKED_MARK_NAMES = new Set(['trackInsert', 'trackDelete', 'trackFormat']);
const TRACKED_MARK_PRIORITY = {
  trackDelete: 3,
  trackFormat: 2,
  trackInsert: 1,
};

function isTrackedChangeMark(mark) {
  return Boolean(mark?.type?.name && TRACKED_MARK_NAMES.has(mark.type.name));
}

function choosePreferredTrackedChangeId(marks) {
  const candidates = [];
  const seen = new Set();

  marks.forEach((mark, index) => {
    if (!isTrackedChangeMark(mark)) return;
    const id = typeof mark.attrs?.id === 'string' ? mark.attrs.id : '';
    if (!id) return;
    const key = `${mark.type.name}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id,
      markType: mark.type.name,
      isChildOverlap: Boolean(mark.attrs?.overlapParentId),
      index,
    });
  });

  candidates.sort((a, b) => {
    if (a.isChildOverlap !== b.isChildOverlap) return a.isChildOverlap ? -1 : 1;
    const priorityDelta = (TRACKED_MARK_PRIORITY[b.markType] ?? 0) - (TRACKED_MARK_PRIORITY[a.markType] ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    return a.index - b.index;
  });

  return candidates[0]?.id ?? null;
}

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
  const editor = resolveContextMenuCommandEditor(props.editor);

  const baseProps = {
    editor: markRaw(editor),
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
  const { from } = state.selection;

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

  const selection = getContextSelection({ editor, state, pos, event });
  const hasSelection = hasExpandedSelection(selection);
  const selectedText = hasSelection ? state.doc.textBetween(selection.from, selection.to) : '';

  // Don't read clipboard proactively to avoid permission prompts
  // Clipboard will be read only when user actually clicks "Paste"
  const clipboardContent = {
    html: null,
    text: null,
    hasContent: true, // Assume clipboard might have content - we'll check on paste
    raw: null,
  };

  const structureFromResolvedPos = pos !== null ? getStructureFromResolvedPos(state, pos) : null;
  const tocAncestor = pos !== null ? findTocAncestor(state.doc, pos) : null;
  const isInTable =
    structureFromResolvedPos?.isInTable ?? selectionHasNodeOrMark(state, 'table', { requireEnds: true });
  const isInList = structureFromResolvedPos?.isInList ?? selectionIncludesListParagraph(state);
  // .superdoc-list-marker = DomPainter markerContainer / presentation mode
  // .list-marker = ParagraphNodeView / flow editor mode
  const isOnListMarker = Boolean(event?.target?.closest?.(`.${DOM_CLASS_NAMES.LIST_MARKER}, .list-marker`));
  const isInSectionNode =
    structureFromResolvedPos?.isInSectionNode ??
    selectionHasNodeOrMark(state, 'documentSection', { requireEnds: true });
  const currentNodeType = node?.type?.name || null;

  const cellSelectionInfo = getCellSelectionInfo(state);

  const activeMarks = [];
  let trackedChangeId = null;
  const trackedMarkCandidates = [];

  if (event && pos !== null) {
    const $pos = state.doc.resolve(pos);

    const processMark = (mark) => {
      if (!activeMarks.includes(mark.type.name)) {
        activeMarks.push(mark.type.name);
      }
      if (isTrackedChangeMark(mark)) {
        trackedMarkCandidates.push(mark);
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
    trackedChangeId = choosePreferredTrackedChangeId(trackedMarkCandidates);
  } else {
    state.storedMarks?.forEach((mark) => activeMarks.push(mark.type.name));
    state.selection.$head.marks().forEach((mark) => activeMarks.push(mark.type.name));
  }

  const isTrackedChange =
    activeMarks.includes('trackInsert') || activeMarks.includes('trackDelete') || activeMarks.includes('trackFormat');

  // If there is an expanded selection and the right-click happened inside
  // that selection, use collectTrackedChanges for the full selection range
  const shouldUseSelectionTrackedChanges =
    event && pos !== null ? hasExpandedSelection(selection) && selectionContainsPos(selection, pos) : hasSelection;
  const trackedChanges = shouldUseSelectionTrackedChanges
    ? collectTrackedChanges({ state, from: selection.from, to: selection.to })
    : event && pos !== null
      ? collectTrackedChangesForContext({ state, pos, trackedChangeId })
      : collectTrackedChanges({ state, from: selection.from, to: selection.to });

  const cursorCoords = pos !== null ? editor.coordsAtPos?.(pos) : null;
  const cursorPosition = cursorCoords
    ? {
        x: cursorCoords.left,
        y: cursorCoords.top,
      }
    : event
      ? { x: event.clientX, y: event.clientY }
      : null;

  // Resolve proofing context if available (PresentationEditor mode)
  const proofingContext = resolveProofingContext(editor, pos);

  return {
    selectedText,
    hasSelection,
    selectionStart: selection.from,
    selectionEnd: selection.to,
    isInTable,
    isInList,
    isOnListMarker,
    isInSectionNode,
    isCellSelection: cellSelectionInfo.isCellSelection,
    tableSelectionKind: cellSelectionInfo.tableSelectionKind,
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
    editor: markRaw(editor),
    trackedChanges,
    proofingContext,
    tocAncestor,
  };
}

function selectionContainsPos(selection, pos) {
  return hasExpandedSelection(selection) && Number.isFinite(pos) && pos >= selection.from && pos <= selection.to;
}

function getContextSelection({ editor, state, pos, event }) {
  const currentSelection = state.selection;
  const preservedSelection = editor?.options?.preservedSelection ?? editor?.options?.lastSelection;

  if (hasExpandedSelection(currentSelection)) {
    return currentSelection;
  }

  if (!hasExpandedSelection(preservedSelection)) {
    return currentSelection;
  }

  if (event) {
    return selectionContainsPos(preservedSelection, pos) ? preservedSelection : currentSelection;
  }

  return preservedSelection;
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

function getCellSelectionInfo(state) {
  if (!isCellSelection(state.selection)) {
    return { isCellSelection: false, tableSelectionKind: null };
  }

  let tableSelectionKind = 'cells';
  try {
    const rect = selectedRect(state);
    const selectedRows = rect.bottom - rect.top;
    const selectedCols = rect.right - rect.left;
    const totalRows = rect.map.height;
    const totalCols = rect.map.width;

    const allRows = selectedRows === totalRows;
    const allCols = selectedCols === totalCols;

    if (allRows && allCols) {
      tableSelectionKind = 'table';
    } else if (allCols) {
      tableSelectionKind = 'row';
    } else if (allRows) {
      tableSelectionKind = 'column';
    }
  } catch (error) {
    console.warn('[ContextMenu] Unable to resolve cell selection rectangle:', error);
  }

  return { isCellSelection: true, tableSelectionKind };
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

/**
 * Resolve proofing context at a position.
 * Returns null if proofing is not active or no issue exists at the position.
 */
function resolveProofingContext(editor, pos) {
  if (pos == null || !Number.isFinite(pos)) return null;

  try {
    // The context menu is wired to either the PresentationEditor wrapper
    // (since SD-2875: 1.29+) or the inner / story Editor that carries a
    // back-reference to it. Resolve the manager from whichever shape the
    // caller passed — without this fallback, suggestions silently vanish
    // when the wrapper itself is the menu's editor handle.
    const manager =
      editor?._presentationEditor?.proofingManager ??
      editor?.presentationEditor?.proofingManager ??
      editor?.proofingManager ??
      null;
    if (!manager) return null;
    const issue = manager.getIssueAtPosition(pos);
    if (!issue) return null;

    const config = manager.config;

    return {
      issue,
      suggestions: issue.replacements?.slice(0, config.maxSuggestions) ?? [],
      canIgnore: config.allowIgnoreWord,
      word: issue.word ?? '',
      /** Ignore this word for the current session. */
      ignoreWord: (word) => manager.ignoreWord(word),
    };
  } catch {
    return null;
  }
}

export {
  getStructureFromResolvedPos as __getStructureFromResolvedPosForTest,
  isCollaborationEnabled as __isCollaborationEnabledForTest,
  getCellSelectionInfo as __getCellSelectionInfoForTest,
  resolveProofingContext as __resolveProofingContextForTest,
  choosePreferredTrackedChangeId as __choosePreferredTrackedChangeIdForTest,
};
