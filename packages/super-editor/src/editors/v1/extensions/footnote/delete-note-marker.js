import { removeNoteReferenceAt } from '../../document-api-adapters/plan-engine/footnote-wrappers.js';

const NOTE_TYPE_BY_NODE = {
  footnoteReference: 'footnote',
  endnoteReference: 'endnote',
};

/**
 * SD-3400: detects the staged-delete selection produced by
 * `selectFootnoteMarkerBefore`/`selectFootnoteMarkerAfter` — a TextSelection
 * spanning exactly one footnote/endnote reference atom.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @returns {{ pos: number, noteId: string, type: 'footnote' | 'endnote' } | null}
 */
export function getSelectedNoteMarker(state) {
  const { from, to, empty } = state.selection;
  if (empty) return null;

  const node = state.doc.nodeAt(from);
  const type = NOTE_TYPE_BY_NODE[node?.type?.name];
  if (!type || from + node.nodeSize !== to) return null;

  return { pos: from, noteId: String(node.attrs?.id ?? ''), type };
}

/**
 * SD-3400: second stage of the Word-like staged delete, symmetric with the
 * note-area delete ("remove on both sides"). Where plain `deleteSelection`
 * would only remove the body marker — leaving an orphaned `w:footnote`
 * element in the notes part — this routes the removal through the document
 * API wrapper, which tombstones the note: the `w:footnote` element stays in
 * the part so undo restores the note text, and export prunes session-managed
 * ids that have no surviving reference (SD-3400).
 *
 * Plain orchestrator (no PM command plumbing) so any caller can use it; the
 * `deleteSelectedNoteMarker` editor command is a thin shim over this function.
 *
 * @param {import('@core/Editor.js').Editor} editor
 * @returns {boolean} True when a staged-selected marker was removed.
 */
export function deleteSelectedNoteMarker(editor) {
  const marker = getSelectedNoteMarker(editor.state);
  if (!marker) return false;
  return removeNoteReferenceAt(editor, marker);
}
