/**
 * TOC bookmark synchronization — ensures `_Toc` bookmarks exist around
 * headings referenced by TOC entry hyperlinks.
 *
 * Word's TOC `<w:hyperlink w:anchor="...">` elements require matching
 * `<w:bookmarkStart w:name="...">` / `<w:bookmarkEnd>` pairs around
 * the target heading. Without them, TOC links in the exported DOCX
 * are broken until the user manually runs "Update Table" in Word.
 *
 * This module generates deterministic `_Toc`-prefixed bookmark names
 * and injects the bookmark nodes after TOC content is materialized.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';

const TOC_BOOKMARK_PREFIX = '_Toc';

// ---------------------------------------------------------------------------
// Bookmark name generation
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic `_Toc`-prefixed bookmark name from a block ID.
 *
 * Uses percent-style encoding to produce a valid OOXML bookmark name that is
 * **injective** — no two distinct block IDs can produce the same output.
 *
 * Encoding rules (using `_` as escape character):
 * - Alphanumeric chars except `_` pass through unchanged
 * - `_` is escaped as `__` (escape-the-escape)
 * - Any other character is escaped as `_xx` (two-digit lowercase hex)
 *
 * Examples:
 * - `ba2b746a-930a-...` → `_Tocba2b746a_2d930a_2d...`
 * - `p-1` → `_Tocp_2d1`
 * - `p1`  → `_Tocp1`   (no collision with `p-1`)
 */
export function generateTocBookmarkName(blockId: string): string {
  return `${TOC_BOOKMARK_PREFIX}${encodeBlockId(blockId)}`;
}

/**
 * Injective encoding of a block ID into valid bookmark name characters.
 * Uses `_` as the escape character: literal `_` → `__`, non-alphanumeric → `_xx`.
 */
function encodeBlockId(input: string): string {
  let result = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '_') {
      result += '__';
    } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
      result += ch;
    } else {
      result += `_${ch.charCodeAt(0).toString(16).padStart(2, '0')}`;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Bookmark synchronization
// ---------------------------------------------------------------------------

/**
 * Ensures `_Toc` bookmarks exist around heading paragraphs referenced by
 * TOC entry hyperlinks.
 *
 * Call after the TOC content has been committed to the editor state. This
 * builds and dispatches a follow-up transaction that inserts any missing
 * `bookmarkStart` / `bookmarkEnd` pairs.
 *
 * Skips silently when:
 * - No sources require bookmarks
 * - All required bookmarks already exist
 * - The schema lacks bookmark node types (headless/test environments)
 */
export function syncTocBookmarks(editor: Editor, sources: Array<{ sdBlockId: string }>): void {
  const { schema, doc } = editor.state;
  if (!schema.nodes.bookmarkStart || !schema.nodes.bookmarkEnd) return;

  const needed = deduplicateByBlockId(sources);
  const existing = collectExistingTocBookmarkNames(doc);
  const missing = needed.filter((t) => !existing.has(t.bookmarkName));
  if (missing.length === 0) return;

  const paragraphPositions = buildBlockIdPositionMap(doc);
  const insertions = resolveInsertionTargets(missing, paragraphPositions, doc);
  if (insertions.length === 0) return;

  const { tr } = editor.state;
  let nextId = findMaxBookmarkId(doc) + 1;

  for (const { bookmarkName, contentStart, contentEnd } of insertions) {
    const bookmarkId = String(nextId++);
    const endNode = schema.nodes.bookmarkEnd.create({ id: bookmarkId });
    const startNode = schema.nodes.bookmarkStart.create({ name: bookmarkName, id: bookmarkId });

    // Insert bookmarkStart first, then bookmarkEnd. This ordering is critical
    // for empty paragraphs where contentStart === contentEnd: Mapping.map() is
    // right-biased, so inserting start first guarantees end maps to after start.
    // tr.mapping.map() converts original-doc positions to current-transaction
    // positions, accounting for earlier insertions in this loop.
    tr.insert(tr.mapping.map(contentStart), startNode);
    tr.insert(tr.mapping.map(contentEnd), endNode);
  }

  if (tr.docChanged) {
    dispatchTransaction(editor, tr);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface TocBookmarkTarget {
  blockId: string;
  bookmarkName: string;
}

/**
 * Deduplicates sources by blockId — each heading needs at most one bookmark.
 * The injective encoding in `encodeBlockId` guarantees unique names, but the
 * collision guard is retained as defense-in-depth.
 */
function deduplicateByBlockId(sources: Array<{ sdBlockId: string }>): TocBookmarkTarget[] {
  const seenBlockIds = new Set<string>();
  const claimedNames = new Map<string, string>(); // bookmarkName → first blockId
  const targets: TocBookmarkTarget[] = [];

  for (const { sdBlockId } of sources) {
    if (seenBlockIds.has(sdBlockId)) continue;
    seenBlockIds.add(sdBlockId);

    const bookmarkName = generateTocBookmarkName(sdBlockId);
    const existingOwner = claimedNames.get(bookmarkName);
    if (existingOwner !== undefined && existingOwner !== sdBlockId) continue;

    claimedNames.set(bookmarkName, sdBlockId);
    targets.push({ blockId: sdBlockId, bookmarkName });
  }

  return targets;
}

/** Collects names of all existing `_Toc`-prefixed bookmarks in the document. */
function collectExistingTocBookmarkNames(doc: ProseMirrorNode): Set<string> {
  const names = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'bookmarkStart') {
      const name = node.attrs?.name as string | undefined;
      if (name?.startsWith(TOC_BOOKMARK_PREFIX)) names.add(name);
    }
    return true;
  });
  return names;
}

/** Maps block IDs (sdBlockId or paraId) to paragraph positions. */
function buildBlockIdPositionMap(doc: ProseMirrorNode): Map<string, number> {
  const map = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const id = (node.attrs?.sdBlockId ?? node.attrs?.paraId) as string | undefined;
      if (id && !map.has(id)) map.set(id, pos);
    }
    return true;
  });
  return map;
}

interface BookmarkInsertion {
  bookmarkName: string;
  /** Position of the first inline content inside the paragraph (paragraphPos + 1). */
  contentStart: number;
  /** Position just before the paragraph's closing boundary (paragraphPos + nodeSize - 1). */
  contentEnd: number;
}

/**
 * Resolves which paragraphs need bookmark insertions and sorts them
 * descending by position for safe back-to-front processing.
 */
function resolveInsertionTargets(
  missing: TocBookmarkTarget[],
  positions: Map<string, number>,
  doc: ProseMirrorNode,
): BookmarkInsertion[] {
  const result: BookmarkInsertion[] = [];

  for (const { blockId, bookmarkName } of missing) {
    const pos = positions.get(blockId);
    if (pos === undefined) continue;

    const node = doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph') continue;

    result.push({
      bookmarkName,
      contentStart: pos + 1,
      contentEnd: pos + node.nodeSize - 1,
    });
  }

  // Descending position order so each insertion only shifts positions we've
  // already processed, keeping earlier mapped positions correct.
  result.sort((a, b) => b.contentStart - a.contentStart);
  return result;
}

/** Scans the document for the highest existing bookmark numeric ID. */
function findMaxBookmarkId(doc: ProseMirrorNode): number {
  let maxId = -1;
  doc.descendants((node) => {
    if (node.type.name !== 'bookmarkStart' && node.type.name !== 'bookmarkEnd') return true;
    const raw = node.attrs?.id;
    const id = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
    if (!isNaN(id) && id > maxId) maxId = id;
    return true;
  });
  return maxId;
}

function dispatchTransaction(editor: Editor, tr: unknown): void {
  if (typeof editor.dispatch === 'function') {
    editor.dispatch(tr as Parameters<Editor['dispatch']>[0]);
  } else if (typeof editor.view?.dispatch === 'function') {
    editor.view.dispatch(tr as Parameters<NonNullable<Editor['view']>['dispatch']>[0]);
  }
}
