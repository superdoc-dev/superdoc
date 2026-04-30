/**
 * Bookmark plan-engine wrappers — bridge bookmark operations to the adapter layer.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  BookmarkListInput,
  BookmarksListResult,
  BookmarkGetInput,
  BookmarkInfo,
  BookmarkInsertInput,
  BookmarkRenameInput,
  BookmarkRemoveInput,
  BookmarkMutationResult,
  BookmarkAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  findAllBookmarks,
  findAllBookmarkMarkersInDocument,
  findAllBookmarksInDocument,
  resolveBookmarkTarget,
  extractBookmarkInfo,
  buildBookmarkDiscoveryItem,
  buildBookmarkAddress,
  type DocumentBookmarkEntry,
} from '../helpers/bookmark-resolver.js';
import { paginate, resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { getRevision, checkRevision } from './revision-tracker.js';
import { disposeEphemeralWriteRuntime, executeDomainCommand, resolveWriteStoryRuntime } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { DocumentApiAdapterError } from '../errors.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';
import { parseStoryKey, BODY_STORY_KEY } from '../story-runtime/story-key.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

export const BOOKMARK_SCAN_REVISION_PREFIX = 'bookmark-scan:';

function bookmarkSuccess(address: BookmarkAddress): BookmarkMutationResult {
  return { success: true, bookmark: address };
}

function bookmarkFailure(code: ReceiptFailureCode, message: string): BookmarkMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

function parseBookmarkId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function allocateBookmarkId(editor: Editor): string {
  const entries = findAllBookmarkMarkersInDocument(editor);
  let maxId = -1;
  for (const entry of entries) {
    const id = parseBookmarkId(entry.bookmarkId);
    if (id !== null && id > maxId) maxId = id;
  }
  return String(maxId + 1);
}

function bookmarkExistsAnywhere(
  editor: Editor,
  name: string,
  exclude?: { storyKey: string; bookmarkId: string },
  preCollected?: DocumentBookmarkEntry[],
): boolean {
  const entries = preCollected ?? findAllBookmarksInDocument(editor);
  return entries.some((bookmark) => {
    if (bookmark.name !== name) return false;
    if (!exclude) return true;
    return !(bookmark.storyKey === exclude.storyKey && bookmark.bookmarkId === exclude.bookmarkId);
  });
}

type BookmarkStorySnapshot = {
  storyKey: string;
  runtime: ReturnType<typeof resolveStoryRuntime>;
  revision: string;
};

function collectBookmarkStorySnapshots(editor: Editor, entries: DocumentBookmarkEntry[]): BookmarkStorySnapshot[] {
  const storyKeys = [...new Set(entries.map((entry) => entry.storyKey))];

  return storyKeys.flatMap((storyKey) => {
    const locator = storyKey === BODY_STORY_KEY ? undefined : parseStoryKey(storyKey);

    try {
      const runtime = resolveStoryRuntime(editor, locator);
      return [{ storyKey, runtime, revision: getRevision(runtime.editor) }];
    } catch (error) {
      if (error instanceof DocumentApiAdapterError && error.code === 'STORY_NOT_FOUND') {
        return [];
      }
      throw error;
    }
  });
}

function buildDocumentBookmarkRevision(hostRevision: string, snapshots: BookmarkStorySnapshot[]): string {
  if (snapshots.length === 0) {
    return hostRevision;
  }

  if (snapshots.length === 1 && snapshots[0]?.storyKey === BODY_STORY_KEY) {
    return hostRevision;
  }

  const parts = [...snapshots]
    .sort((left, right) => left.storyKey.localeCompare(right.storyKey))
    .map((snapshot) => `${snapshot.storyKey}@${snapshot.revision}`);

  return `${BOOKMARK_SCAN_REVISION_PREFIX}${parts.join('|')}`;
}

function getDocumentBookmarkRevision(editor: Editor, preCollected?: DocumentBookmarkEntry[]): string {
  const hostRevision = getRevision(editor);
  const entries = preCollected ?? findAllBookmarksInDocument(editor);
  const snapshots = collectBookmarkStorySnapshots(editor, entries);
  return buildDocumentBookmarkRevision(hostRevision, snapshots);
}

function expectedRevisionMatchesStory(storyEditor: Editor, expectedRevision: string): boolean {
  return expectedRevision === getRevision(storyEditor);
}

function expectedRevisionMatchesDocumentScan(hostEditor: Editor, expectedRevision: string): boolean {
  return (
    expectedRevision.startsWith(BOOKMARK_SCAN_REVISION_PREFIX) &&
    expectedRevision === getDocumentBookmarkRevision(hostEditor)
  );
}

function checkBookmarkRevision(hostEditor: Editor, storyEditor: Editor, expectedRevision: string | undefined): void {
  if (expectedRevision === undefined) return;

  if (expectedRevisionMatchesStory(storyEditor, expectedRevision)) {
    return;
  }

  if (expectedRevisionMatchesDocumentScan(hostEditor, expectedRevision)) {
    return;
  }

  checkRevision(storyEditor, expectedRevision);
}

function resolveBookmarkMutationStory(editor: Editor, target: BookmarkAddress): BookmarkAddress['story'] | undefined {
  if (target.story) {
    return target.story;
  }

  const matches = findAllBookmarksInDocument(editor).filter((bookmark) => bookmark.name === target.name);
  if (matches.length > 1) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      `Bookmark name "${target.name}" exists in multiple stories. Pass target.story to disambiguate the mutation.`,
    );
  }

  const entry = matches[0];
  if (!entry) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Bookmark with name "${target.name}" not found.`);
  }

  return entry.storyKey === BODY_STORY_KEY ? undefined : parseStoryKey(entry.storyKey);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function bookmarksListWrapper(editor: Editor, query?: BookmarkListInput): BookmarksListResult {
  if (query?.in) {
    return listBookmarksFromStory(editor, query.in, query);
  }

  const entries = findAllBookmarksInDocument(editor);
  const hostRevision = getRevision(editor);
  const snapshots = collectBookmarkStorySnapshots(editor, entries);

  const allItems = snapshots.flatMap(({ storyKey, runtime, revision }) => {
    const doc = runtime.editor.state.doc;
    const bookmarks = findAllBookmarks(doc);
    return bookmarks.map((bookmark) => buildBookmarkDiscoveryItem(doc, bookmark, revision, runtime.locator, storyKey));
  });

  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: buildDocumentBookmarkRevision(hostRevision, snapshots),
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

function listBookmarksFromStory(
  editor: Editor,
  storyLocator: BookmarkListInput['in'],
  query?: BookmarkListInput,
): BookmarksListResult {
  const runtime = resolveStoryRuntime(editor, storyLocator);
  const storyEditor = runtime.editor;
  const doc = storyEditor.state.doc;
  const revision = getRevision(storyEditor);
  const bookmarks = findAllBookmarks(doc);

  const allItems = bookmarks.map((bookmark) => buildBookmarkDiscoveryItem(doc, bookmark, revision, runtime.locator));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function bookmarksGetWrapper(editor: Editor, input: BookmarkGetInput): BookmarkInfo {
  if (input.target.story) {
    const runtime = resolveStoryRuntime(editor, input.target.story);
    const resolved = resolveBookmarkTarget(runtime.editor.state.doc, input.target);
    return extractBookmarkInfo(runtime.editor.state.doc, resolved, runtime.locator);
  }

  const entry = findAllBookmarksInDocument(editor).find((bookmark) => bookmark.name === input.target.name);
  if (!entry) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Bookmark with name "${input.target.name}" not found.`);
  }

  const locator = entry.storyKey === BODY_STORY_KEY ? undefined : parseStoryKey(entry.storyKey);
  const runtime = resolveStoryRuntime(editor, locator);
  const resolved = resolveBookmarkTarget(runtime.editor.state.doc, input.target);
  return extractBookmarkInfo(runtime.editor.state.doc, resolved, runtime.locator);
}

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

export function bookmarksInsertWrapper(
  editor: Editor,
  input: BookmarkInsertInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  rejectTrackedMode('bookmarks.insert', options);
  const runtime = resolveWriteStoryRuntime(editor, input.at.story);
  const storyEditor = runtime.editor;
  const address: BookmarkAddress = buildBookmarkAddress(input.name, runtime.locator);

  try {
    checkBookmarkRevision(editor, storyEditor, options?.expectedRevision);
    const allBookmarks = findAllBookmarksInDocument(editor);

    if (bookmarkExistsAnywhere(editor, input.name, undefined, allBookmarks)) {
      return bookmarkFailure('NO_OP', `Bookmark with name "${input.name}" already exists.`);
    }

    if (options?.dryRun) {
      return bookmarkSuccess(address);
    }

    const bookmarkStartType = storyEditor.schema.nodes.bookmarkStart;
    const bookmarkEndType = storyEditor.schema.nodes.bookmarkEnd;
    if (!bookmarkStartType || !bookmarkEndType) {
      throw new DocumentApiAdapterError(
        'CAPABILITY_UNAVAILABLE',
        'bookmarks.insert requires bookmarkStart and bookmarkEnd node types in the schema.',
      );
    }

    const resolved = resolveInlineInsertPosition(storyEditor, input.at, 'bookmarks.insert');

    const receipt = executeDomainCommand(storyEditor, () => {
      const bookmarkId = allocateBookmarkId(editor);
      const startAttrs: Record<string, unknown> = {
        name: input.name,
        id: bookmarkId,
      };
      if (input.tableColumn) {
        startAttrs.colFirst = input.tableColumn.colFirst;
        startAttrs.colLast = input.tableColumn.colLast;
      }

      const startNode = bookmarkStartType.create(startAttrs);
      const endNode = bookmarkEndType.create({ id: bookmarkId });

      const { tr } = storyEditor.state;
      tr.insert(resolved.to, endNode);
      tr.insert(resolved.from, startNode);
      storyEditor.dispatch(tr);
      clearIndexCache(storyEditor);
      return true;
    });

    if (!receiptApplied(receipt)) {
      return bookmarkFailure('NO_OP', 'Insert operation produced no change.');
    }

    if (runtime.commit) runtime.commit(editor);
    return bookmarkSuccess(address);
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}

export function bookmarksRenameWrapper(
  editor: Editor,
  input: BookmarkRenameInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  rejectTrackedMode('bookmarks.rename', options);
  const runtime = resolveWriteStoryRuntime(editor, resolveBookmarkMutationStory(editor, input.target));
  const storyEditor = runtime.editor;

  try {
    checkBookmarkRevision(editor, storyEditor, options?.expectedRevision);
    const resolved = resolveBookmarkTarget(storyEditor.state.doc, input.target);

    if (resolved.name === input.newName) {
      return bookmarkFailure('NO_OP', 'New name is identical to current name.');
    }

    if (
      bookmarkExistsAnywhere(editor, input.newName, { storyKey: runtime.storyKey, bookmarkId: resolved.bookmarkId })
    ) {
      throw new DocumentApiAdapterError(
        'INVALID_INPUT',
        `bookmarks.rename: a bookmark with name "${input.newName}" already exists.`,
      );
    }

    const newAddress: BookmarkAddress = buildBookmarkAddress(input.newName, runtime.locator);

    if (options?.dryRun) {
      return bookmarkSuccess(newAddress);
    }

    const receipt = executeDomainCommand(storyEditor, () => {
      const { tr } = storyEditor.state;
      tr.setNodeMarkup(resolved.pos, undefined, {
        ...resolved.node.attrs,
        name: input.newName,
      });
      storyEditor.dispatch(tr);
      clearIndexCache(storyEditor);
      return true;
    });

    if (!receiptApplied(receipt)) {
      return bookmarkFailure('NO_OP', 'Rename operation produced no change.');
    }

    if (runtime.commit) runtime.commit(editor);
    return bookmarkSuccess(newAddress);
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}

export function bookmarksRemoveWrapper(
  editor: Editor,
  input: BookmarkRemoveInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  rejectTrackedMode('bookmarks.remove', options);
  const runtime = resolveWriteStoryRuntime(editor, resolveBookmarkMutationStory(editor, input.target));
  const storyEditor = runtime.editor;

  try {
    checkBookmarkRevision(editor, storyEditor, options?.expectedRevision);
    const resolved = resolveBookmarkTarget(storyEditor.state.doc, input.target);
    const address: BookmarkAddress = buildBookmarkAddress(resolved.name, runtime.locator);

    if (options?.dryRun) {
      return bookmarkSuccess(address);
    }

    const receipt = executeDomainCommand(storyEditor, () => {
      const { tr } = storyEditor.state;

      if (resolved.endPos !== null && resolved.endPos > resolved.pos) {
        const endNode = tr.doc.nodeAt(resolved.endPos);
        if (endNode) {
          tr.delete(resolved.endPos, resolved.endPos + endNode.nodeSize);
        }
      }

      const startNode = tr.doc.nodeAt(resolved.pos);
      if (startNode) {
        tr.delete(resolved.pos, resolved.pos + startNode.nodeSize);
      }

      storyEditor.dispatch(tr);
      clearIndexCache(storyEditor);
      return true;
    });

    if (!receiptApplied(receipt)) {
      return bookmarkFailure('NO_OP', 'Remove operation produced no change.');
    }

    if (runtime.commit) runtime.commit(editor);
    return bookmarkSuccess(address);
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}
