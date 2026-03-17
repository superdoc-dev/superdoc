import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  BookmarkAddress,
  BookmarkGetInput,
  BookmarkInfo,
  BookmarkInsertInput,
  BookmarkRenameInput,
  BookmarkRemoveInput,
  BookmarkMutationResult,
  BookmarkListInput,
  BookmarksListResult,
} from './bookmarks.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interface
// ---------------------------------------------------------------------------

export interface BookmarksApi {
  list(query?: BookmarkListInput): BookmarksListResult;
  get(input: BookmarkGetInput): BookmarkInfo;
  insert(input: BookmarkInsertInput, options?: MutationOptions): BookmarkMutationResult;
  rename(input: BookmarkRenameInput, options?: MutationOptions): BookmarkMutationResult;
  remove(input: BookmarkRemoveInput, options?: MutationOptions): BookmarkMutationResult;
}

export type BookmarksAdapter = BookmarksApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateBookmarkTarget(target: unknown, operationName: string): asserts target is BookmarkAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'entity' || t.entityType !== 'bookmark' || typeof t.name !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a BookmarkAddress with kind 'entity', entityType 'bookmark', and a string name.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeBookmarksList(adapter: BookmarksAdapter, query?: BookmarkListInput): BookmarksListResult {
  return adapter.list(query);
}

export function executeBookmarksGet(adapter: BookmarksAdapter, input: BookmarkGetInput): BookmarkInfo {
  validateBookmarkTarget(input.target, 'bookmarks.get');
  return adapter.get(input);
}

export function executeBookmarksInsert(
  adapter: BookmarksAdapter,
  input: BookmarkInsertInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  if (!input.name || typeof input.name !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'bookmarks.insert requires a non-empty name string.');
  }
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeBookmarksRename(
  adapter: BookmarksAdapter,
  input: BookmarkRenameInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  validateBookmarkTarget(input.target, 'bookmarks.rename');
  if (!input.newName || typeof input.newName !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'bookmarks.rename requires a non-empty newName string.');
  }
  return adapter.rename(input, normalizeMutationOptions(options));
}

export function executeBookmarksRemove(
  adapter: BookmarksAdapter,
  input: BookmarkRemoveInput,
  options?: MutationOptions,
): BookmarkMutationResult {
  validateBookmarkTarget(input.target, 'bookmarks.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}
