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
 */

/**
 * Whether a footnote can be inserted at the current cursor.
 *
 * Word disables References > Insert Footnote while editing a header, footer,
 * footnote, or endnote (§17.11.14 also makes a note inside a note
 * non-conformant). Two checks cover both call shapes:
 * 1. The target editor is itself a story editor (`options.parentEditor`).
 * 2. The host editor is the target but a non-body story surface is active
 *    (`getActiveStoryLocator()` is non-null for header/footer and note
 *    sessions) — inserting would write the marker into the BODY while the
 *    user is editing somewhere else entirely.
 *
 * Surface-eligibility predicate only: it does not check that the document
 * API (`editor.doc.footnotes`) is wired. Exported so custom toolbars can
 * drive their disabled state, like Word's ribbon.
 *
 * @param {import('@core/Editor.js').Editor} editor
 * @returns {boolean} True when insertion is allowed (body context).
 */
export function canInsertNoteAtCursor(editor) {
  if (!editor) return false;
  if (editor.options?.parentEditor) return false;
  if (editor.presentationEditor?.getActiveStoryLocator?.() != null) return false;
  return true;
}

/**
 * @param {import('@core/Editor.js').Editor} editor
 * @returns {boolean} True when the footnote was inserted.
 */
export function insertFootnoteAtCursor(editor) {
  // Blocked contexts: keep focus wherever the user is editing (the session
  // never lost focus because nothing was inserted).
  if (!canInsertNoteAtCursor(editor)) return false;

  const result = editor.doc?.footnotes?.insert({ type: 'footnote', content: '' });
  if (!result?.success) return false;
  const noteId = result.footnote?.noteId;
  if (noteId != null) {
    editor.presentationEditor?.activateNoteSession?.({ storyType: 'footnote', noteId: String(noteId) });
  }
  return true;
}
