/**
 * SD-3400: insert a footnote at the current cursor and focus the new note.
 *
 * Plain orchestrator over two existing capabilities:
 * 1. `editor.doc.footnotes.insert` (document API) — allocates the note id,
 *    creates the body reference at the selection head, writes the OOXML note
 *    element, and bootstraps the footnotes part (with separators) when the
 *    document has none.
 * 2. `presentationEditor.activateNoteSession` — opens the note session with
 *    the caret at the note's start and smart-scrolls it into view.
 *
 * Lives outside the ProseMirror extension so any caller (custom toolbar
 * actions, tests, tooling) can use it without PM command plumbing. The
 * `insertFootnote` editor command is a thin shim over this function.
 *
 * @param {import('@core/Editor.js').Editor} editor
 * @returns {boolean} True when the footnote was inserted.
 */
export function insertFootnoteAtCursor(editor) {
  const result = editor.doc?.footnotes?.insert({ type: 'footnote', content: '' });
  if (!result?.success) return false;
  const noteId = result.footnote?.noteId;
  if (noteId != null) {
    editor.presentationEditor?.activateNoteSession?.({ storyType: 'footnote', noteId: String(noteId) });
  }
  return true;
}
