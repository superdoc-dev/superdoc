/**
 * Bookmark node resolver — finds, resolves, and extracts info from bookmarkStart nodes.
 */

import type { Editor } from '../../core/Editor.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  BookmarkAddress,
  BookmarkDomain,
  BookmarkInfo,
  DiscoveryItem,
  Position,
  StoryLocator,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import { BODY_STORY_KEY, buildStoryKey } from '../story-runtime/story-key.js';
import { resolveLiveStorySessionRuntime } from '../story-runtime/live-story-session-runtime-registry.js';
import { enumerateEffectiveNoteEntries } from './note-entry-lookup.js';

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

export interface DocumentBookmarkEntry {
  name: string;
  bookmarkId: string;
  storyKey: string;
}

type StoryEditorEntry = {
  id?: unknown;
  editor?: Editor;
};

type NoteEntry = {
  id?: unknown;
  content?: unknown[];
  doc?: Record<string, unknown>;
};

type ConverterWithStories = {
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerEditors?: StoryEditorEntry[];
  footerEditors?: StoryEditorEntry[];
  footnotes?: NoteEntry[];
  endnotes?: NoteEntry[];
};

export function normalizeStory(locator?: StoryLocator): StoryLocator | undefined {
  if (!locator || locator.storyType === 'body') return undefined;
  return locator;
}

export function buildBookmarkAddress(name: string, story?: StoryLocator): BookmarkAddress {
  const normalizedStory = normalizeStory(story);
  return normalizedStory
    ? { kind: 'entity', entityType: 'bookmark', name, story: normalizedStory }
    : { kind: 'entity', entityType: 'bookmark', name };
}

export function findAllBookmarksInDocument(editor: Editor): DocumentBookmarkEntry[] {
  const results: DocumentBookmarkEntry[] = [];
  const seenStoryKeys = new Set<string>();
  const converter = (editor as unknown as { converter?: ConverterWithStories }).converter;

  seenStoryKeys.add(BODY_STORY_KEY);
  collectBookmarksFromDoc(editor.state.doc, BODY_STORY_KEY, results);

  collectBookmarksFromHeaderFooterEditors(editor, converter?.headerEditors, results, seenStoryKeys);
  collectBookmarksFromHeaderFooterEditors(editor, converter?.footerEditors, results, seenStoryKeys);
  collectBookmarksFromHeaderFooterCache(editor, converter?.headers, results, seenStoryKeys);
  collectBookmarksFromHeaderFooterCache(editor, converter?.footers, results, seenStoryKeys);
  collectBookmarksFromNotes(editor, converter?.footnotes, 'footnote', results, seenStoryKeys);
  collectBookmarksFromNotes(editor, converter?.endnotes, 'endnote', results, seenStoryKeys);

  return results;
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

function collectBookmarksFromDoc(doc: ProseMirrorNode, storyKey: string, results: DocumentBookmarkEntry[]): void {
  doc.descendants((node) => {
    if (node.type.name === 'bookmarkStart') {
      results.push({
        name: (node.attrs?.name as string) ?? '',
        bookmarkId: (node.attrs?.id as string) ?? '',
        storyKey,
      });
    }
    return true;
  });
}

function collectBookmarksFromHeaderFooterEditors(
  hostEditor: Editor,
  editors: StoryEditorEntry[] | undefined,
  results: DocumentBookmarkEntry[],
  seenStoryKeys: Set<string>,
): void {
  if (!Array.isArray(editors)) return;

  for (const entry of editors) {
    const refId = typeof entry?.id === 'string' && entry.id.length > 0 ? entry.id : null;
    const storyEditor = entry?.editor;
    if (!refId || !storyEditor?.state?.doc) continue;

    const storyKey = buildStoryKey({ kind: 'story', storyType: 'headerFooterPart', refId });
    if (seenStoryKeys.has(storyKey)) continue;
    seenStoryKeys.add(storyKey);
    collectBookmarksFromLiveOrDoc(hostEditor, storyKey, storyEditor.state.doc, results);
  }
}

function collectBookmarksFromHeaderFooterCache(
  hostEditor: Editor,
  collection: Record<string, unknown> | undefined,
  results: DocumentBookmarkEntry[],
  seenStoryKeys: Set<string>,
): void {
  if (!collection || typeof collection !== 'object') return;

  for (const [refId, pmJson] of Object.entries(collection)) {
    if (typeof refId !== 'string' || refId.length === 0) continue;

    const storyKey = buildStoryKey({ kind: 'story', storyType: 'headerFooterPart', refId });
    if (seenStoryKeys.has(storyKey)) continue;
    seenStoryKeys.add(storyKey);
    collectBookmarksFromLiveOrPmJson(hostEditor, storyKey, pmJson, results);
  }
}

function collectBookmarksFromNotes(
  hostEditor: Editor,
  notes: NoteEntry[] | undefined,
  storyType: 'footnote' | 'endnote',
  results: DocumentBookmarkEntry[],
  seenStoryKeys: Set<string>,
): void {
  for (const note of enumerateEffectiveNoteEntries(notes)) {
    const noteId = note?.id != null ? String(note.id) : '';
    if (!noteId) continue;

    const pmJson = getNotePmJson(note);
    if (!pmJson) continue;

    const storyKey = buildStoryKey({ kind: 'story', storyType, noteId });
    if (seenStoryKeys.has(storyKey)) continue;
    seenStoryKeys.add(storyKey);

    collectBookmarksFromLiveOrPmJson(hostEditor, storyKey, pmJson, results);
  }
}

function collectBookmarksFromLiveOrDoc(
  hostEditor: Editor,
  storyKey: string,
  fallbackDoc: ProseMirrorNode,
  results: DocumentBookmarkEntry[],
): void {
  const liveDoc = resolveLiveStorySessionRuntime(hostEditor, storyKey)?.editor?.state?.doc;
  collectBookmarksFromDoc(liveDoc ?? fallbackDoc, storyKey, results);
}

function collectBookmarksFromLiveOrPmJson(
  hostEditor: Editor,
  storyKey: string,
  fallbackPmJson: unknown,
  results: DocumentBookmarkEntry[],
): void {
  const liveDoc = resolveLiveStorySessionRuntime(hostEditor, storyKey)?.editor?.state?.doc;
  if (liveDoc) {
    collectBookmarksFromDoc(liveDoc, storyKey, results);
    return;
  }

  collectBookmarksFromPmJson(fallbackPmJson, storyKey, results);
}

function getNotePmJson(note: NoteEntry): Record<string, unknown> | null {
  if (Array.isArray(note.content)) {
    return {
      type: 'doc',
      content: note.content.length > 0 ? note.content : [{ type: 'paragraph' }],
    };
  }

  if (note.doc && typeof note.doc === 'object') {
    return note.doc;
  }

  return null;
}

function collectBookmarksFromPmJson(pmJson: unknown, storyKey: string, results: DocumentBookmarkEntry[]): void {
  if (!isObjectRecord(pmJson)) return;

  visitPmJson(pmJson, (node) => {
    if (node.type !== 'bookmarkStart') return;

    const attrs = isObjectRecord(node.attrs) ? node.attrs : undefined;
    const name = typeof attrs?.name === 'string' ? attrs.name : '';
    const bookmarkId = attrs?.id != null ? String(attrs.id) : '';
    results.push({ name, bookmarkId, storyKey });
  });
}

function visitPmJson(node: Record<string, unknown>, visitor: (node: Record<string, unknown>) => void): void {
  visitor(node);

  const content = node.content;
  if (!Array.isArray(content)) return;

  for (const child of content) {
    if (isObjectRecord(child)) {
      visitPmJson(child, visitor);
    }
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

export function extractBookmarkInfo(
  doc: ProseMirrorNode,
  resolved: ResolvedBookmark,
  story?: StoryLocator,
): BookmarkInfo {
  const from = nodePositionToPosition(doc, resolved.pos);
  const to = resolved.endPos !== null ? nodePositionToPosition(doc, resolved.endPos) : from;

  const colFirst = resolved.node.attrs?.colFirst as number | undefined;
  const colLast = resolved.node.attrs?.colLast as number | undefined;

  const info: BookmarkInfo = {
    address: buildBookmarkAddress(resolved.name, story),
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
  story?: StoryLocator,
  idScope?: string,
): DiscoveryItem<BookmarkDomain> {
  const from = nodePositionToPosition(doc, resolved.pos);
  const to = resolved.endPos !== null ? nodePositionToPosition(doc, resolved.endPos) : from;

  const colFirst = resolved.node.attrs?.colFirst as number | undefined;
  const colLast = resolved.node.attrs?.colLast as number | undefined;

  const domain: BookmarkDomain = {
    address: buildBookmarkAddress(resolved.name, story),
    name: resolved.name,
    bookmarkId: resolved.bookmarkId,
    range: { from, to },
  };

  if (colFirst !== undefined && colFirst !== null && colLast !== undefined && colLast !== null) {
    domain.tableColumn = { colFirst, colLast };
  }

  const handle = buildResolvedHandle(resolved.name, 'stable', 'node');
  const idPrefix = idScope ? `bookmark:${encodeURIComponent(idScope)}:` : 'bookmark:';
  const id = `${idPrefix}${encodeURIComponent(resolved.name)}:${encodeURIComponent(evaluatedRevision)}`;
  return buildDiscoveryItem(id, handle, domain);
}
