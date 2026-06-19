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
import { isRenderedNoteBlockId, type RenderedNoteTarget } from '../notes/note-target.js';

/**
 * Painted header/footer content lives inside these containers and carries
 * `data-pm-start` values in the header/footer part's OWN coordinate space.
 * Resolving those against the body document is meaningless and, for positions
 * past the body size, makes `nodeAt` throw — which would abort the caller's
 * double-click handling before header/footer activation runs.
 */
const HEADER_FOOTER_CONTAINER_SELECTOR = '.superdoc-page-header, .superdoc-page-footer';

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
  // Only BODY fragments carry body-space pm positions. Header/footer and
  // rendered-note fragments use their own story's coordinate space.
  if (refEl.closest(HEADER_FOOTER_CONTAINER_SELECTOR)) return null;
  const blockId = refEl.closest('[data-block-id]')?.getAttribute('data-block-id') ?? '';
  if (isRenderedNoteBlockId(blockId)) return null;
  const pmStart = Number(refEl.getAttribute('data-pm-start'));
  if (!Number.isFinite(pmStart) || pmStart < 0 || pmStart >= doc.content.size) return null;
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
 * the body. The importer emits the bookmark as a flat bookmarkStart/bookmarkEnd
 * marker pair matched by id, so the note is found by scanning the document
 * range from the named bookmarkStart to its matching bookmarkEnd. (The schema
 * also permits bookmarkStart to hold content; scanning to at least the end of
 * the start node covers that shape too.) Returns null for cross-references to
 * anything other than a note (headings, tables), letting the double-click fall
 * through to default text behavior.
 */
function noteTargetFromCrossReference(doc: ProseMirrorNode, bookmarkName: unknown): RenderedNoteTarget | null {
  if (typeof bookmarkName !== 'string' || bookmarkName.length === 0) return null;

  let startPos = -1;
  let rangeEnd = -1;
  let bookmarkId: unknown = null;
  let foundEnd = false;
  doc.descendants((node, pos) => {
    if (foundEnd) return false;
    if (startPos < 0) {
      if (node.type?.name === 'bookmarkStart' && node.attrs?.name === bookmarkName) {
        startPos = pos;
        rangeEnd = pos + node.nodeSize;
        bookmarkId = node.attrs?.id;
      }
      return true;
    }
    if (node.type?.name === 'bookmarkEnd' && bookmarkId != null && node.attrs?.id === bookmarkId) {
      rangeEnd = pos;
      foundEnd = true;
      return false;
    }
    return true;
  });
  if (startPos < 0) return null;

  let result: RenderedNoteTarget | null = null;
  doc.nodesBetween(startPos, rangeEnd, (node) => {
    if (result) return false;
    result = noteTargetFromReferenceNode(node);
    return !result;
  });
  return result;
}
