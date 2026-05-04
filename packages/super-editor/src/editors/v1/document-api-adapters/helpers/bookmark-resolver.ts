/**
 * Bookmark node resolver — finds, resolves, and extracts info from bookmark marker nodes.
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

export type BookmarkMarkerType = 'bookmarkStart' | 'bookmarkEnd';

export interface DocumentBookmarkMarkerEntry {
  bookmarkId: string;
  storyKey: string;
  markerType: BookmarkMarkerType;
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

type StoryBookmarkCollector<T> = {
  collectFromDoc: (doc: ProseMirrorNode, storyKey: string, results: T[]) => void;
  collectFromPmJson: (pmJson: unknown, storyKey: string, results: T[]) => void;
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
  return collectFromDocumentStories(editor, {
    collectFromDoc: collectBookmarksFromDoc,
    collectFromPmJson: collectBookmarksFromPmJson,
  });
}

export function findAllBookmarkMarkersInDocument(editor: Editor): DocumentBookmarkMarkerEntry[] {
  return collectFromDocumentStories(editor, {
    collectFromDoc: collectBookmarkMarkersFromDoc,
    collectFromPmJson: collectBookmarkMarkersFromPmJson,
  });
}

function collectFromDocumentStories<T>(editor: Editor, collector: StoryBookmarkCollector<T>): T[] {
  const results: T[] = [];
  const seenStoryKeys = new Set<string>();
  const converter = (editor as unknown as { converter?: ConverterWithStories }).converter;

  seenStoryKeys.add(BODY_STORY_KEY);
  collector.collectFromDoc(editor.state.doc, BODY_STORY_KEY, results);

  collectFromHeaderFooterEditors(editor, converter?.headerEditors, results, seenStoryKeys, collector);
  collectFromHeaderFooterEditors(editor, converter?.footerEditors, results, seenStoryKeys, collector);
  collectFromHeaderFooterCache(editor, converter?.headers, results, seenStoryKeys, collector);
  collectFromHeaderFooterCache(editor, converter?.footers, results, seenStoryKeys, collector);
  collectFromNotes(editor, converter?.footnotes, 'footnote', results, seenStoryKeys, collector);
  collectFromNotes(editor, converter?.endnotes, 'endnote', results, seenStoryKeys, collector);

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
        name: readBookmarkName(node.attrs),
        bookmarkId: readBookmarkId(node.attrs),
        storyKey,
      });
    }
    return true;
  });
}

function collectBookmarkMarkersFromDoc(
  doc: ProseMirrorNode,
  storyKey: string,
  results: DocumentBookmarkMarkerEntry[],
): void {
  doc.descendants((node) => {
    if (!isBookmarkMarkerType(node.type.name)) return true;

    const bookmarkId = readBookmarkId(node.attrs);
    if (bookmarkId) {
      results.push({ bookmarkId, storyKey, markerType: node.type.name });
    }

    return true;
  });
}

function collectFromHeaderFooterEditors<T>(
  hostEditor: Editor,
  editors: StoryEditorEntry[] | undefined,
  results: T[],
  seenStoryKeys: Set<string>,
  collector: StoryBookmarkCollector<T>,
): void {
  if (!Array.isArray(editors)) return;

  for (const entry of editors) {
    const refId = typeof entry?.id === 'string' && entry.id.length > 0 ? entry.id : null;
    const storyEditor = entry?.editor;
    if (!refId || !storyEditor?.state?.doc) continue;

    const storyKey = buildStoryKey({ kind: 'story', storyType: 'headerFooterPart', refId });
    if (seenStoryKeys.has(storyKey)) continue;
    seenStoryKeys.add(storyKey);
    collectFromLiveOrDoc(hostEditor, storyKey, storyEditor.state.doc, results, collector);
  }
}

function collectFromHeaderFooterCache<T>(
  hostEditor: Editor,
  collection: Record<string, unknown> | undefined,
  results: T[],
  seenStoryKeys: Set<string>,
  collector: StoryBookmarkCollector<T>,
): void {
  if (!collection || typeof collection !== 'object') return;

  for (const [refId, pmJson] of Object.entries(collection)) {
    if (typeof refId !== 'string' || refId.length === 0) continue;

    const storyKey = buildStoryKey({ kind: 'story', storyType: 'headerFooterPart', refId });
    if (seenStoryKeys.has(storyKey)) continue;
    seenStoryKeys.add(storyKey);
    collectFromLiveOrPmJson(hostEditor, storyKey, pmJson, results, collector);
  }
}

function collectFromNotes<T>(
  hostEditor: Editor,
  notes: NoteEntry[] | undefined,
  storyType: 'footnote' | 'endnote',
  results: T[],
  seenStoryKeys: Set<string>,
  collector: StoryBookmarkCollector<T>,
): void {
  for (const note of enumerateEffectiveNoteEntries(notes)) {
    const noteId = note?.id != null ? String(note.id) : '';
    if (!noteId) continue;

    const pmJson = getNotePmJson(note);
    if (!pmJson) continue;

    const storyKey = buildStoryKey({ kind: 'story', storyType, noteId });
    if (seenStoryKeys.has(storyKey)) continue;
    seenStoryKeys.add(storyKey);

    collectFromLiveOrPmJson(hostEditor, storyKey, pmJson, results, collector);
  }
}

function collectFromLiveOrDoc<T>(
  hostEditor: Editor,
  storyKey: string,
  fallbackDoc: ProseMirrorNode,
  results: T[],
  collector: StoryBookmarkCollector<T>,
): void {
  const liveDoc = resolveLiveStorySessionRuntime(hostEditor, storyKey)?.editor?.state?.doc;
  collector.collectFromDoc(liveDoc ?? fallbackDoc, storyKey, results);
}

function collectFromLiveOrPmJson<T>(
  hostEditor: Editor,
  storyKey: string,
  fallbackPmJson: unknown,
  results: T[],
  collector: StoryBookmarkCollector<T>,
): void {
  const liveDoc = resolveLiveStorySessionRuntime(hostEditor, storyKey)?.editor?.state?.doc;
  if (liveDoc) {
    collector.collectFromDoc(liveDoc, storyKey, results);
    return;
  }

  collector.collectFromPmJson(fallbackPmJson, storyKey, results);
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

    const name = readBookmarkName(node.attrs);
    const bookmarkId = readBookmarkId(node.attrs);
    results.push({ name, bookmarkId, storyKey });
  });
}

function collectBookmarkMarkersFromPmJson(
  pmJson: unknown,
  storyKey: string,
  results: DocumentBookmarkMarkerEntry[],
): void {
  if (!isObjectRecord(pmJson)) return;

  visitPmJson(pmJson, (node) => {
    if (!isBookmarkMarkerType(node.type)) return;

    const bookmarkId = readBookmarkId(node.attrs);
    if (bookmarkId) {
      results.push({ bookmarkId, storyKey, markerType: node.type });
    }
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

function isBookmarkMarkerType(type: unknown): type is BookmarkMarkerType {
  return type === 'bookmarkStart' || type === 'bookmarkEnd';
}

function readBookmarkId(attrs: unknown): string {
  if (!isObjectRecord(attrs) || attrs.id == null) return '';
  return String(attrs.id);
}

function readBookmarkName(attrs: unknown): string {
  if (!isObjectRecord(attrs) || typeof attrs.name !== 'string') return '';
  return attrs.name;
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
