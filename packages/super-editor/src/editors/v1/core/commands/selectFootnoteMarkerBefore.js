import { TextSelection } from 'prosemirror-state';

export const SELECT_FOOTNOTE_MARKER_META = 'selectFootnoteMarker';

const isNoteReference = (node) => node?.type.name === 'footnoteReference' || node?.type.name === 'endnoteReference';

/**
 * Resolves the note marker ending at `boundaryPos` (the position right after it).
 * Real documents wrap each reference in its own run, so the sibling at the
 * boundary is usually that run wrapper, not the marker — look at its last child.
 */
function markerEndingAt(node, boundaryPos) {
  if (isNoteReference(node)) {
    return { node, pos: boundaryPos - node.nodeSize };
  }
  if (node?.type.name === 'run' && isNoteReference(node.lastChild)) {
    const marker = node.lastChild;
    // Marker sits at the end of the run's content, just inside the closing token.
    return { node: marker, pos: boundaryPos - 1 - marker.nodeSize };
  }
  return null;
}

/** Forward mirror of {@link markerEndingAt}: marker starting at `boundaryPos`. */
function markerStartingAt(node, boundaryPos) {
  if (isNoteReference(node)) {
    return { node, pos: boundaryPos };
  }
  if (node?.type.name === 'run' && isNoteReference(node.firstChild)) {
    // Marker sits at the start of the run's content, just inside the opening token.
    return { node: node.firstChild, pos: boundaryPos + 1 };
  }
  return null;
}

function getPreviousNoteMarker(state) {
  const { $from } = state.selection;

  // Caret at the start of a run: the marker (or its run wrapper) precedes the run.
  if ($from.parent.type.name === 'run' && $from.parentOffset === 0) {
    const runStart = $from.before($from.depth);
    return markerEndingAt(state.doc.resolve(runStart).nodeBefore, runStart);
  }

  return markerEndingAt($from.nodeBefore, $from.pos);
}

function getNextNoteMarker(state) {
  const { $from } = state.selection;

  // Caret at the end of a run: the marker (or its run wrapper) follows the run.
  if ($from.parent.type.name === 'run' && $from.parentOffset === $from.parent.content.size) {
    const runEnd = $from.after($from.depth);
    return markerStartingAt(state.doc.resolve(runEnd).nodeAfter, runEnd);
  }

  return markerStartingAt($from.nodeAfter, $from.pos);
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
