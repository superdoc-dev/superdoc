/**
 * Resolves a pointer event over a painted BODY footnote/endnote reference to
 * its note target (SD-3400 double-click navigation).
 *
 * The painted reference is a superscript run carrying `data-pm-start` (the PM
 * position of the footnoteReference/endnoteReference node) but no note id, so
 * the PM node at that position supplies the story type and id. Real pointer
 * events usually land on the selection overlay above the pages — when the
 * event target has no `data-pm-start` ancestor, the full `elementsFromPoint`
 * hit chain is walked (same strategy as the rendered-note resolver).
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { RenderedNoteTarget } from '../notes/note-target.js';

export type NoteReferenceHitOptions = {
  /** The pointer event's target. */
  target: HTMLElement | null;
  clientX: number;
  clientY: number;
  /** The body editor's PM document (resolves pm-start → reference node). */
  doc: ProseMirrorNode | null | undefined;
  /** Document used for the elementsFromPoint fallback. */
  ownerDocument: Document;
};

export function resolveNoteReferenceAtPointer(options: NoteReferenceHitOptions): RenderedNoteTarget | null {
  const { target, clientX, clientY, doc, ownerDocument } = options;

  const fromTarget = noteTargetFromPmStartElement(target?.closest?.('[data-pm-start]') as HTMLElement | null, doc);
  if (fromTarget) return fromTarget;

  if (typeof ownerDocument.elementsFromPoint !== 'function') return null;
  for (const element of ownerDocument.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof HTMLElement)) continue;
    const resolved = noteTargetFromPmStartElement(element.closest('[data-pm-start]') as HTMLElement | null, doc);
    if (resolved) return resolved;
  }
  return null;
}

function noteTargetFromPmStartElement(
  refEl: HTMLElement | null,
  doc: ProseMirrorNode | null | undefined,
): RenderedNoteTarget | null {
  if (!refEl || !doc) return null;
  const pmStart = Number(refEl.getAttribute('data-pm-start'));
  if (!Number.isFinite(pmStart)) return null;
  const node = doc.nodeAt(pmStart);
  if (node?.type?.name === 'crossReference') {
    return noteTargetFromCrossReference(doc, node.attrs?.target);
  }
  return noteTargetFromReferenceNode(node);
}

function noteTargetFromReferenceNode(node: ProseMirrorNode | null | undefined): RenderedNoteTarget | null {
  const nodeType = node?.type?.name;
  if (nodeType !== 'footnoteReference' && nodeType !== 'endnoteReference') return null;
  const noteId = node?.attrs?.id;
  if (noteId == null || String(noteId).length === 0) return null;
  return {
    storyType: nodeType === 'endnoteReference' ? 'endnote' : 'footnote',
    noteId: String(noteId),
  };
}

/**
 * Resolves a REF/NOTEREF cross-reference to the note it points at. Word's
 * cross-reference bookmark (`_RefXXXX`) wraps the ORIGINAL note reference in
 * the body, so the note is found by locating the bookmarkStart with the
 * field's target name and scanning its content for a note reference. Returns
 * null for cross-references to anything other than a note (headings, tables),
 * letting the double-click fall through to default text behavior.
 */
function noteTargetFromCrossReference(doc: ProseMirrorNode, bookmarkName: unknown): RenderedNoteTarget | null {
  if (typeof bookmarkName !== 'string' || bookmarkName.length === 0) return null;

  let result: RenderedNoteTarget | null = null;
  doc.descendants((node) => {
    if (result) return false;
    if (node.type?.name !== 'bookmarkStart' || node.attrs?.name !== bookmarkName) return true;
    node.descendants((child) => {
      if (result) return false;
      result = noteTargetFromReferenceNode(child);
      return !result;
    });
    return false;
  });
  return result;
}
