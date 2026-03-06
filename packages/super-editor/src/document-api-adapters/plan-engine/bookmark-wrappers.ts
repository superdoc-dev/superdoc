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
  resolveBookmarkTarget,
  extractBookmarkInfo,
  buildBookmarkDiscoveryItem,
} from '../helpers/bookmark-resolver.js';
import { paginate, resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { TextSelection } from 'prosemirror-state';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function bookmarkSuccess(address: BookmarkAddress): BookmarkMutationResult {
  return { success: true, bookmark: address };
}

function bookmarkFailure(code: ReceiptFailureCode, message: string): BookmarkMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function bookmarksListWrapper(editor: Editor, query?: BookmarkListInput): BookmarksListResult {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const bookmarks = findAllBookmarks(doc);

  const allItems = bookmarks.map((b) => buildBookmarkDiscoveryItem(doc, b, revision));
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
  const resolved = resolveBookmarkTarget(editor.state.doc, input.target);
  return extractBookmarkInfo(editor.state.doc, resolved);
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

  // Check for duplicate name
  const existing = findAllBookmarks(editor.state.doc);
  if (existing.some((b) => b.name === input.name)) {
    return bookmarkFailure('NO_OP', `Bookmark with name "${input.name}" already exists.`);
  }

  const address: BookmarkAddress = { kind: 'entity', entityType: 'bookmark', name: input.name };

  if (options?.dryRun) {
    return bookmarkSuccess(address);
  }

  const resolved = resolveInlineInsertPosition(editor, input.at, 'bookmarks.insert');

  const receipt = executeDomainCommand(
    editor,
    () => {
      // Set selection to the target range before inserting
      const { tr: selTr } = editor.state;
      selTr.setSelection(TextSelection.create(selTr.doc, resolved.from, resolved.to));
      editor.view!.dispatch(selTr);

      const result = editor.commands.insertBookmark({
        name: input.name,
        ...(input.tableColumn && {
          colFirst: input.tableColumn.colFirst,
          colLast: input.tableColumn.colLast,
        }),
      });
      if (result) clearIndexCache(editor);
      return result;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return bookmarkFailure('NO_OP', 'Insert operation produced no change.');
  }

  return bookmarkSuccess(address);
}

export function bookmarksRenameWrapper(
  editor: Editor,
  input: BookmarkRenameInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  rejectTrackedMode('bookmarks.rename', options);

  const resolved = resolveBookmarkTarget(editor.state.doc, input.target);

  if (resolved.name === input.newName) {
    return bookmarkFailure('NO_OP', 'New name is identical to current name.');
  }

  // Check that the new name is not already taken
  const all = findAllBookmarks(editor.state.doc);
  if (all.some((b) => b.name === input.newName)) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      `bookmarks.rename: a bookmark with name "${input.newName}" already exists.`,
    );
  }

  const newAddress: BookmarkAddress = { kind: 'entity', entityType: 'bookmark', name: input.newName };

  if (options?.dryRun) {
    return bookmarkSuccess(newAddress);
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      tr.setNodeMarkup(resolved.pos, undefined, {
        ...resolved.node.attrs,
        name: input.newName,
      });
      editor.view!.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return bookmarkFailure('NO_OP', 'Rename operation produced no change.');
  }

  return bookmarkSuccess(newAddress);
}

export function bookmarksRemoveWrapper(
  editor: Editor,
  input: BookmarkRemoveInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  rejectTrackedMode('bookmarks.remove', options);

  const resolved = resolveBookmarkTarget(editor.state.doc, input.target);
  const address: BookmarkAddress = { kind: 'entity', entityType: 'bookmark', name: resolved.name };

  if (options?.dryRun) {
    return bookmarkSuccess(address);
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;

      // Delete bookmarkEnd first (if it exists and is after start) to avoid position shifts
      if (resolved.endPos !== null && resolved.endPos > resolved.pos) {
        const endNode = tr.doc.nodeAt(resolved.endPos);
        if (endNode) {
          tr.delete(resolved.endPos, resolved.endPos + endNode.nodeSize);
        }
      }

      // Delete bookmarkStart
      const startNode = tr.doc.nodeAt(resolved.pos);
      if (startNode) {
        tr.delete(resolved.pos, resolved.pos + startNode.nodeSize);
      }

      editor.view!.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) {
    return bookmarkFailure('NO_OP', 'Remove operation produced no change.');
  }

  return bookmarkSuccess(address);
}
