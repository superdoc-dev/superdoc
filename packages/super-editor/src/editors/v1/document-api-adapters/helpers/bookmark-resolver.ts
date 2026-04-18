/**
 * Bookmark node resolver — finds, resolves, and extracts info from bookmarkStart nodes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BookmarkAddress, BookmarkDomain, BookmarkInfo, DiscoveryItem, Position } from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedBookmark {
  node: ProseMirrorNode;
  pos: number;
  name: string;
  bookmarkId: string;
  endPos: number | null;
}

// ---------------------------------------------------------------------------
// Node resolution
// ---------------------------------------------------------------------------

/**
 * Finds all bookmarkStart nodes in document order.
 */
export function findAllBookmarks(doc: ProseMirrorNode): ResolvedBookmark[] {
  const results: ResolvedBookmark[] = [];
  const endPositions = collectBookmarkEndPositions(doc);

  doc.descendants((node, pos) => {
    if (node.type.name === 'bookmarkStart') {
      const name = (node.attrs?.name as string) ?? '';
      const bookmarkId = (node.attrs?.id as string) ?? '';
      const endPos = endPositions.get(bookmarkId) ?? null;
      results.push({ node, pos, name, bookmarkId, endPos });
    }
    return true;
  });

  return results;
}

/**
 * Collects endPos for all bookmarkEnd nodes, keyed by bookmark ID.
 */
function collectBookmarkEndPositions(doc: ProseMirrorNode): Map<string, number> {
  const map = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (node.type.name === 'bookmarkEnd') {
      const id = (node.attrs?.id as string) ?? '';
      if (id) map.set(id, pos);
    }
    return true;
  });
  return map;
}

/**
 * Resolves a BookmarkAddress to its ProseMirror node and position.
 * @throws DocumentApiAdapterError with code TARGET_NOT_FOUND if not found.
 */
export function resolveBookmarkTarget(doc: ProseMirrorNode, target: BookmarkAddress): ResolvedBookmark {
  const all = findAllBookmarks(doc);
  const found = all.find((b) => b.name === target.name);
  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Bookmark with name "${target.name}" not found.`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Info extraction
// ---------------------------------------------------------------------------

function nodePositionToPosition(doc: ProseMirrorNode, pos: number): Position {
  const resolved = doc.resolve(pos);
  // Walk up to find the nearest block with sdBlockId
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    const blockId = node.attrs?.sdBlockId as string | undefined;
    if (blockId) {
      return { blockId, offset: pos - resolved.start(depth) };
    }
  }
  return { blockId: '', offset: pos };
}

export function extractBookmarkInfo(doc: ProseMirrorNode, resolved: ResolvedBookmark): BookmarkInfo {
  const from = nodePositionToPosition(doc, resolved.pos);
  const to = resolved.endPos !== null ? nodePositionToPosition(doc, resolved.endPos) : from;

  const colFirst = resolved.node.attrs?.colFirst as number | undefined;
  const colLast = resolved.node.attrs?.colLast as number | undefined;

  const info: BookmarkInfo = {
    address: { kind: 'entity', entityType: 'bookmark', name: resolved.name },
    name: resolved.name,
    bookmarkId: resolved.bookmarkId,
    range: { from, to },
  };

  if (colFirst !== undefined && colFirst !== null && colLast !== undefined && colLast !== null) {
    info.tableColumn = { colFirst, colLast };
  }

  return info;
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

export function buildBookmarkDiscoveryItem(
  doc: ProseMirrorNode,
  resolved: ResolvedBookmark,
  evaluatedRevision: string,
): DiscoveryItem<BookmarkDomain> {
  const from = nodePositionToPosition(doc, resolved.pos);
  const to = resolved.endPos !== null ? nodePositionToPosition(doc, resolved.endPos) : from;

  const colFirst = resolved.node.attrs?.colFirst as number | undefined;
  const colLast = resolved.node.attrs?.colLast as number | undefined;

  const domain: BookmarkDomain = {
    address: { kind: 'entity', entityType: 'bookmark', name: resolved.name },
    name: resolved.name,
    bookmarkId: resolved.bookmarkId,
    range: { from, to },
  };

  if (colFirst !== undefined && colFirst !== null && colLast !== undefined && colLast !== null) {
    domain.tableColumn = { colFirst, colLast };
  }

  const handle = buildResolvedHandle(resolved.name, 'stable', 'node');
  const id = `bookmark:${resolved.name}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}
