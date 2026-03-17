/**
 * Footnote/endnote resolver — finds, resolves, and extracts info from
 * footnoteReference and endnoteReference nodes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { FootnoteAddress, FootnoteDomain, FootnoteInfo, DiscoveryItem } from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import { findNoteEntryById } from './note-entry-lookup.js';

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
  footnotes?: FootnoteCollection;
  endnotes?: FootnoteCollection;
}

function getConverterStore(editor: Editor): FootnoteStore {
  return (editor as unknown as { converter?: FootnoteStore }).converter ?? {};
}

type FootnoteEntry = {
  id?: string | number;
  content?: unknown;
};

type LegacyFootnoteMap = Record<string, { content?: string }>;
type FootnoteCollection = FootnoteEntry[] | LegacyFootnoteMap;

function isLegacyFootnoteMap(value: unknown): value is LegacyFootnoteMap {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function extractTextFromNode(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return '';

  const candidate = node as { text?: unknown; content?: unknown[] };
  if (typeof candidate.text === 'string') return candidate.text;
  if (!Array.isArray(candidate.content)) return '';

  return candidate.content.map((child) => extractTextFromNode(child)).join('');
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((node) => extractTextFromNode(node))
    .filter((text) => text.length > 0)
    .join('\n');
}

function resolveCollectionContent(collection: FootnoteCollection | undefined, noteId: string): string {
  if (!collection) return '';

  if (Array.isArray(collection)) {
    const match = findNoteEntryById(collection, noteId);
    return extractTextFromContent(match?.content);
  }

  if (isLegacyFootnoteMap(collection)) {
    return collection[noteId]?.content ?? '';
  }

  return '';
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
  const collection = resolved.type === 'footnote' ? store.footnotes : store.endnotes;
  return resolveCollectionContent(collection, resolved.noteId);
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
