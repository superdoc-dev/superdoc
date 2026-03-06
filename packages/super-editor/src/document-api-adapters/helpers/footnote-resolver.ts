/**
 * Footnote/endnote resolver — finds, resolves, and extracts info from
 * footnoteReference and endnoteReference nodes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { FootnoteAddress, FootnoteDomain, FootnoteInfo, DiscoveryItem } from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedFootnote {
  node: ProseMirrorNode;
  pos: number;
  noteId: string;
  type: 'footnote' | 'endnote';
}

// ---------------------------------------------------------------------------
// Converter access
// ---------------------------------------------------------------------------

interface FootnoteStore {
  footnoteNumberById?: Record<string, number>;
  endnoteNumberById?: Record<string, number>;
  footnotes?: Record<string, { content?: string }>;
  endnotes?: Record<string, { content?: string }>;
}

function getConverterStore(editor: Editor): FootnoteStore {
  return (editor as unknown as { converter?: FootnoteStore }).converter ?? {};
}

// ---------------------------------------------------------------------------
// Node resolution
// ---------------------------------------------------------------------------

/**
 * Finds all footnote/endnote reference nodes in document order.
 */
export function findAllFootnotes(doc: ProseMirrorNode, typeFilter?: 'footnote' | 'endnote'): ResolvedFootnote[] {
  const results: ResolvedFootnote[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteReference') {
      if (!typeFilter || typeFilter === 'footnote') {
        const noteId = String(node.attrs?.id ?? '');
        results.push({ node, pos, noteId, type: 'footnote' });
      }
    } else if (node.type.name === 'endnoteReference') {
      if (!typeFilter || typeFilter === 'endnote') {
        const noteId = String(node.attrs?.id ?? '');
        results.push({ node, pos, noteId, type: 'endnote' });
      }
    }
    return true;
  });

  return results;
}

/**
 * Resolves a FootnoteAddress to its reference node.
 * @throws DocumentApiAdapterError with code TARGET_NOT_FOUND if not found.
 */
export function resolveFootnoteTarget(doc: ProseMirrorNode, target: FootnoteAddress): ResolvedFootnote {
  const all = findAllFootnotes(doc);
  const found = all.find((f) => f.noteId === target.noteId);
  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Footnote/endnote with noteId "${target.noteId}" not found.`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Info extraction
// ---------------------------------------------------------------------------

function resolveDisplayNumber(editor: Editor, resolved: ResolvedFootnote): string {
  const store = getConverterStore(editor);
  const numberMap = resolved.type === 'footnote' ? store.footnoteNumberById : store.endnoteNumberById;

  if (numberMap && numberMap[resolved.noteId] !== undefined) {
    return String(numberMap[resolved.noteId]);
  }
  return resolved.noteId;
}

function resolveContent(editor: Editor, resolved: ResolvedFootnote): string {
  const store = getConverterStore(editor);
  const contentMap = resolved.type === 'footnote' ? store.footnotes : store.endnotes;

  if (contentMap && contentMap[resolved.noteId]) {
    return contentMap[resolved.noteId].content ?? '';
  }
  return '';
}

export function extractFootnoteInfo(editor: Editor, resolved: ResolvedFootnote): FootnoteInfo {
  return {
    address: { kind: 'entity', entityType: 'footnote', noteId: resolved.noteId },
    type: resolved.type,
    noteId: resolved.noteId,
    displayNumber: resolveDisplayNumber(editor, resolved),
    content: resolveContent(editor, resolved),
  };
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

export function buildFootnoteDiscoveryItem(
  editor: Editor,
  resolved: ResolvedFootnote,
  evaluatedRevision: string,
): DiscoveryItem<FootnoteDomain> {
  const address: FootnoteAddress = { kind: 'entity', entityType: 'footnote', noteId: resolved.noteId };
  const domain: FootnoteDomain = {
    address,
    type: resolved.type,
    noteId: resolved.noteId,
    displayNumber: resolveDisplayNumber(editor, resolved),
    content: resolveContent(editor, resolved),
  };

  const handle = buildResolvedHandle(resolved.noteId, 'stable', 'node');
  const id = `footnote:${resolved.noteId}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}
