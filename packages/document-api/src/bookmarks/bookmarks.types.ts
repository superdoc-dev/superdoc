import type { Position } from '../types/base.js';
import type { TextTarget } from '../types/address.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Bookmark address
// ---------------------------------------------------------------------------

export interface BookmarkAddress {
  kind: 'entity';
  entityType: 'bookmark';
  name: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface BookmarkListInput {
  limit?: number;
  offset?: number;
}

export interface BookmarkGetInput {
  target: BookmarkAddress;
}

export interface BookmarkInsertInput {
  name: string;
  at: TextTarget;
  /**
   * For table-column bookmarks: restricts the bookmark to a column range
   * within a table row. (Amendment 8)
   */
  tableColumn?: {
    colFirst: number;
    colLast: number;
  };
}

export interface BookmarkRenameInput {
  target: BookmarkAddress;
  newName: string;
}

export interface BookmarkRemoveInput {
  target: BookmarkAddress;
}

// ---------------------------------------------------------------------------
// Info / domain
// ---------------------------------------------------------------------------

export interface BookmarkInfo {
  address: BookmarkAddress;
  name: string;
  bookmarkId: string;
  range: { from: Position; to: Position };
  tableColumn?: {
    colFirst: number;
    colLast: number;
  };
}

export interface BookmarkDomain {
  address: BookmarkAddress;
  name: string;
  bookmarkId: string;
  range: { from: Position; to: Position };
  tableColumn?: { colFirst: number; colLast: number };
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface BookmarkMutationSuccess {
  success: true;
  bookmark: BookmarkAddress;
}

export interface BookmarkMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type BookmarkMutationResult = BookmarkMutationSuccess | BookmarkMutationFailure;

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export type BookmarksListResult = DiscoveryOutput<BookmarkDomain>;
