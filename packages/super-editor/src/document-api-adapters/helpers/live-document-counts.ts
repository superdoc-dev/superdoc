import type { Editor } from '../../core/Editor.js';
import type { BlockIndex } from './node-address-resolver.js';
import type { InlineIndex } from './inline-address-resolver.js';
import { getBlockIndex, getInlineIndex } from './index-cache.js';
import { getTextAdapter } from '../get-text-adapter.js';
import { resolveCommentIdFromAttrs } from './value-utils.js';
import { groupTrackedChanges } from './tracked-change-resolver.js';
import { findAllSdtNodes, resolveControlType } from './content-controls/index.js';
import { projectListItemCandidate, type ListItemProjection } from './list-item-resolver.js';
import { computeSequenceIdMap } from './list-sequence-helpers.js';

/** Snapshot of document-level counts derived from the current editor state. */
export interface LiveDocumentCounts {
  words: number;
  characters: number;
  paragraphs: number;
  headings: number;
  tables: number;
  images: number;
  comments: number;
  trackedChanges: number;
  sdtFields: number;
  lists: number;
}

type LiveDocumentCountsCacheEntry = {
  doc: Editor['state']['doc'];
  counts: LiveDocumentCounts;
};

const FIELD_LIKE_SDT_TYPES = new Set(['text', 'date', 'checkbox', 'comboBox', 'dropDownList']);
const liveDocumentCountsCache = new WeakMap<Editor, LiveDocumentCountsCacheEntry>();

/**
 * Computes live document counts from the current editor snapshot.
 *
 * The helper caches the fully-derived counts by immutable ProseMirror
 * document snapshot. Repeated `doc.info()` reads against the same snapshot
 * reuse the cached result instead of rescanning text, tracked changes, or
 * content controls.
 *
 * Count semantics:
 * - `words`: whitespace-delimited tokens from the Document API text projection
 * - `characters`: full length of the Document API text projection (includes
 *    inter-block newlines and one `'\n'` per non-text leaf node — "characters with spaces")
 * - `paragraphs`: block-classified paragraphs (excludes headings and list items)
 * - `headings`: block-classified headings (style-based detection)
 * - `tables`: top-level table containers only (excludes rows and cells)
 * - `images`: block images + inline images (dual-kind)
 * - `comments`: unique anchored comment IDs from inline candidates
 * - `trackedChanges`: grouped tracked-change entities from the current snapshot
 * - `sdtFields`: field-like SDT/content-control nodes (text/date/checkbox/choice controls)
 * - `lists`: unique list sequences, not individual list items. When list items
 *    are visible but `numId` is unavailable, counts fall back to visible runs.
 */
export function getLiveDocumentCounts(editor: Editor): LiveDocumentCounts {
  const currentDoc = editor.state.doc;
  const cached = liveDocumentCountsCache.get(editor);

  if (cached && cached.doc === currentDoc) {
    return cloneLiveDocumentCounts(cached.counts);
  }

  const counts = computeLiveDocumentCounts(editor);
  liveDocumentCountsCache.set(editor, { doc: currentDoc, counts });

  return cloneLiveDocumentCounts(counts);
}

function computeLiveDocumentCounts(editor: Editor): LiveDocumentCounts {
  const text = getTextAdapter(editor, {});
  const blockIndex = getBlockIndex(editor);
  const inlineIndex = getInlineIndex(editor);

  const blockCounts = countBlockNodeTypes(blockIndex);
  const inlineImages = countInlineImages(inlineIndex);

  return {
    words: countWordsFromText(text),
    characters: text.length,
    paragraphs: blockCounts.paragraphs,
    headings: blockCounts.headings,
    tables: blockCounts.tables,
    images: blockCounts.blockImages + inlineImages,
    comments: countUniqueCommentIds(inlineIndex),
    trackedChanges: countTrackedChanges(editor),
    sdtFields: countSdtFields(editor),
    lists: countLists(editor, blockIndex),
  };
}

function cloneLiveDocumentCounts(counts: LiveDocumentCounts): LiveDocumentCounts {
  return { ...counts };
}

/**
 * Counts whitespace-delimited words in a text projection.
 * Uses `text.trim().match(/\S+/g)` — any non-whitespace run is one word.
 */
export function countWordsFromText(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

interface BlockNodeTypeCounts {
  paragraphs: number;
  headings: number;
  tables: number;
  blockImages: number;
}

/**
 * Single-pass count of block-level node types from the cached block index.
 *
 * Only counts the four types relevant to `doc.info()`. Other block types
 * (listItem, tableRow, tableCell, tableOfContents, sdt) are intentionally skipped.
 */
export function countBlockNodeTypes(blockIndex: BlockIndex): BlockNodeTypeCounts {
  let paragraphs = 0;
  let headings = 0;
  let tables = 0;
  let blockImages = 0;

  for (const candidate of blockIndex.candidates) {
    switch (candidate.nodeType) {
      case 'paragraph':
        paragraphs++;
        break;
      case 'heading':
        headings++;
        break;
      case 'table':
        tables++;
        break;
      case 'image':
        blockImages++;
        break;
      // listItem, tableRow, tableCell, tableOfContents, sdt — not counted
    }
  }

  return { paragraphs, headings, tables, blockImages };
}

/**
 * Counts inline images from the cached inline index.
 */
export function countInlineImages(inlineIndex: InlineIndex): number {
  return inlineIndex.byType.get('image')?.length ?? 0;
}

/**
 * Counts unique anchored comment IDs from inline comment candidates.
 *
 * Preserves current semantics: comments are counted from inline anchors
 * (marks and range nodes), deduplicated by resolved comment ID. This does
 * NOT count from the entity store (which includes replies and unanchored entries).
 */
export function countUniqueCommentIds(inlineIndex: InlineIndex): number {
  const commentCandidates = inlineIndex.byType.get('comment') ?? [];
  const uniqueIds = new Set<string>();

  for (const candidate of commentCandidates) {
    const commentId = resolveCommentIdFromAttrs(candidate.attrs ?? {});
    if (commentId) {
      uniqueIds.add(commentId);
    }
  }

  return uniqueIds.size;
}

/**
 * Counts grouped tracked-change entities from the current editor snapshot.
 *
 * This matches `trackChanges.list().total`, not the raw number of PM marks.
 */
export function countTrackedChanges(editor: Editor): number {
  return groupTrackedChanges(editor).length;
}

/**
 * Counts field-like SDT/content-control nodes in the document.
 *
 * Structural container controls such as groups and repeating sections are
 * intentionally excluded so this count tracks user-facing SDT "fields".
 */
export function countSdtFields(editor: Editor): number {
  const allSdts = findAllSdtNodes(editor.state.doc);
  return allSdts.filter((sdt) => FIELD_LIKE_SDT_TYPES.has(resolveControlType(sdt.node.attrs ?? {}))).length;
}

/**
 * Counts unique list sequences in document order.
 *
 * Multiple contiguous items in the same list count as one list. Numbered
 * lists preserve the existing `listId`/sequence semantics. When imported
 * list items are visibly rendered but do not yet expose a `numId`, the
 * counter falls back to visible list runs so those lists still count.
 */
export function countLists(editor: Editor, blockIndex: BlockIndex): number {
  const listItems = getListItemProjections(editor, blockIndex);
  if (listItems.length === 0) return 0;

  const sequenceIds = computeSequenceIdMap(listItems);
  let listCount = 0;
  let previousSequenceId: string | undefined;
  let previousFallbackItem: ListItemProjection | undefined;

  for (const item of listItems) {
    const sequenceId = sequenceIds.get(item.address.nodeId) ?? '';

    if (sequenceId) {
      if (sequenceId !== previousSequenceId) {
        listCount += 1;
      }
      previousSequenceId = sequenceId;
      previousFallbackItem = undefined;
      continue;
    }

    previousSequenceId = undefined;
    if (!previousFallbackItem || startsNewFallbackListSequence(previousFallbackItem, item)) {
      listCount += 1;
    }
    previousFallbackItem = item;
  }

  return listCount;
}

function getListItemProjections(editor: Editor, blockIndex: BlockIndex): ListItemProjection[] {
  return blockIndex.candidates
    .filter((candidate) => candidate.nodeType === 'listItem')
    .map((candidate) => projectListItemCandidate(editor, candidate));
}

function startsNewFallbackListSequence(previous: ListItemProjection, current: ListItemProjection): boolean {
  if (hasKnownListKindChange(previous, current)) {
    return true;
  }

  return hasOrdinalRestartAtSameVisibleLevel(previous, current);
}

function hasKnownListKindChange(previous: ListItemProjection, current: ListItemProjection): boolean {
  return previous.kind != null && current.kind != null && previous.kind !== current.kind;
}

function hasOrdinalRestartAtSameVisibleLevel(previous: ListItemProjection, current: ListItemProjection): boolean {
  const previousLevel = resolveVisibleListLevel(previous);
  const currentLevel = resolveVisibleListLevel(current);

  if (previousLevel == null || currentLevel == null || previousLevel !== currentLevel) {
    return false;
  }

  if (previous.ordinal == null || current.ordinal == null) {
    return false;
  }

  return current.ordinal <= previous.ordinal;
}

function resolveVisibleListLevel(item: ListItemProjection): number | undefined {
  if (item.level != null) {
    return item.level;
  }

  return item.path && item.path.length > 0 ? item.path.length - 1 : undefined;
}
