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
  const nodeType = node?.type?.name;
  if (nodeType !== 'footnoteReference' && nodeType !== 'endnoteReference') return null;
  const noteId = node?.attrs?.id;
  if (noteId == null || String(noteId).length === 0) return null;
  return {
    storyType: nodeType === 'endnoteReference' ? 'endnote' : 'footnote',
    noteId: String(noteId),
  };
}
