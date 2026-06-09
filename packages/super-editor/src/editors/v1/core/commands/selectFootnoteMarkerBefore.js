import { TextSelection } from 'prosemirror-state';

export const SELECT_FOOTNOTE_MARKER_META = 'selectFootnoteMarker';

const isNoteReference = (node) =>
  node?.type.name === 'footnoteReference' || node?.type.name === 'endnoteReference';

function getPreviousNoteMarker(state) {
  const { $from } = state.selection;

  // Run-wrapped case: caret at the start of a run, marker is the node before the run.
  if ($from.parent.type.name === 'run' && $from.parentOffset === 0) {
    const runStart = $from.before($from.depth);
    const node = state.doc.resolve(runStart).nodeBefore;
    if (!isNoteReference(node)) return null;
    return { node, pos: runStart - node.nodeSize };
  }

  const node = $from.nodeBefore;
  if (!isNoteReference(node)) return null;
  return { node, pos: $from.pos - node.nodeSize };
}

function getNextNoteMarker(state) {
  const { $from } = state.selection;

  // Run-wrapped case: caret at the end of a run, marker is the node after the run.
  if ($from.parent.type.name === 'run' && $from.parentOffset === $from.parent.content.size) {
    const runEnd = $from.after($from.depth);
    const node = state.doc.resolve(runEnd).nodeAfter;
    if (!isNoteReference(node)) return null;
    return { node, pos: runEnd };
  }

  const node = $from.nodeAfter;
  if (!isNoteReference(node)) return null;
  return { node, pos: $from.pos };
}

function selectNoteMarker(state, dispatch, marker) {
  if (dispatch) {
    const from = marker.pos;
    const to = marker.pos + marker.node.nodeSize;
    dispatch(
      state.tr.setMeta(SELECT_FOOTNOTE_MARKER_META, true).setSelection(TextSelection.create(state.doc, from, to)),
    );
  }

  return true;
}

/**
 * SD-3400: Word-like staged delete of footnote/endnote markers.
 *
 * When Backspace is pressed with a collapsed caret immediately after a
 * footnote/endnote reference marker, select the marker instead of deleting it.
 * The next Backspace sees a non-empty selection, so this command returns false
 * and the chain falls through to `deleteSelection`, which removes the marker and
 * lets the footnote renumber (and drop from the note area, since the renderer
 * only paints notes that still have a body reference).
 *
 * `footnoteReference` is `selectable: false`, so a `TextSelection` spanning the
 * atom is used as the highlight (a `NodeSelection` is unavailable).
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectFootnoteMarkerBefore =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const marker = getPreviousNoteMarker(state);
    if (!marker) return false;

    return selectNoteMarker(state, dispatch, marker);
  };

/**
 * SD-3400: forward (Delete-key) mirror of {@link selectFootnoteMarkerBefore}.
 * Selects a footnote/endnote marker immediately after the caret on the first
 * Delete; the second Delete removes it via the selection fall-through.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const selectFootnoteMarkerAfter =
  () =>
  ({ state, dispatch }) => {
    const { selection } = state;
    if (!selection.empty) return false;

    const marker = getNextNoteMarker(state);
    if (!marker) return false;

    return selectNoteMarker(state, dispatch, marker);
  };
