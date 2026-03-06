import type { InlineAnchor, BlockNodeAddress } from '../types/base.js';
import type { TextTarget } from '../types/address.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { TocCreateLocation } from '../toc/toc.types.js';

// ---------------------------------------------------------------------------
// Address types
// ---------------------------------------------------------------------------

export interface IndexAddress {
  kind: 'block';
  nodeType: 'index';
  nodeId: string;
}

export interface IndexEntryAddress {
  kind: 'inline';
  nodeType: 'indexEntry';
  anchor: InlineAnchor;
}

// ---------------------------------------------------------------------------
// Config (Amendment 7: expanded with all useful switches)
// ---------------------------------------------------------------------------

export interface IndexConfig {
  headingSeparator?: string; // \h switch
  entryPageSeparator?: string; // \e switch
  pageRangeSeparator?: string; // \g switch
  sequenceId?: string; // \s switch
  columns?: number; // \c switch
  entryTypeFilter?: string; // \f switch
  pageRangeBookmark?: string; // \b switch (bookmark-limited page range)
  letterRange?: { from: string; to: string }; // \p switch
  runIn?: boolean; // \r switch (run-in format)
  accentedSorting?: boolean; // \a switch
}

// ---------------------------------------------------------------------------
// Entry data (Amendment 7: expanded with all XE switches)
// ---------------------------------------------------------------------------

export interface IndexEntryData {
  text: string;
  subEntry?: string;
  bold?: boolean; // \b
  italic?: boolean; // \i
  crossReference?: string; // \t switch
  pageRangeBookmark?: string; // \r switch
  entryType?: string; // \f switch
  yomi?: string; // \y switch
}

// ---------------------------------------------------------------------------
// Input types — INDEX lifecycle
// ---------------------------------------------------------------------------

export interface IndexListInput {
  limit?: number;
  offset?: number;
}

export interface IndexGetInput {
  target: IndexAddress;
}

export interface IndexInsertInput {
  at: TocCreateLocation;
  config?: IndexConfig;
}

export interface IndexConfigureInput {
  target: IndexAddress;
  patch: IndexConfig;
}

export interface IndexRebuildInput {
  target: IndexAddress;
}

export interface IndexRemoveInput {
  target: IndexAddress;
}

// ---------------------------------------------------------------------------
// Input types — XE entries
// ---------------------------------------------------------------------------

export interface IndexEntryListInput {
  entryType?: string;
  limit?: number;
  offset?: number;
}

export interface IndexEntryGetInput {
  target: IndexEntryAddress;
}

export interface IndexEntryInsertInput {
  at: TextTarget;
  entry: IndexEntryData;
}

export interface IndexEntryUpdateInput {
  target: IndexEntryAddress;
  patch: Partial<IndexEntryData>;
}

export interface IndexEntryRemoveInput {
  target: IndexEntryAddress;
}

// ---------------------------------------------------------------------------
// Info / Domain — INDEX
// ---------------------------------------------------------------------------

export interface IndexInfo {
  address: IndexAddress;
  instruction: string;
  config: IndexConfig;
  entryCount: number;
}

export interface IndexDomain {
  address: IndexAddress;
  instruction: string;
  config: IndexConfig;
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Info / Domain — XE entries (Amendment 9: includes all expanded fields)
// ---------------------------------------------------------------------------

export interface IndexEntryInfo {
  address: IndexEntryAddress;
  text: string;
  subEntry?: string;
  bold: boolean;
  italic: boolean;
  crossReference?: string;
  pageRangeBookmark?: string;
  entryType?: string;
  instruction: string;
}

export interface IndexEntryDomain {
  address: IndexEntryAddress;
  text: string;
  subEntry?: string;
  bold: boolean;
  italic: boolean;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface IndexMutationSuccess {
  success: true;
  index: IndexAddress;
}

export interface IndexMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type IndexMutationResult = IndexMutationSuccess | IndexMutationFailure;

export interface IndexEntryMutationSuccess {
  success: true;
  entry: IndexEntryAddress;
}

export interface IndexEntryMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type IndexEntryMutationResult = IndexEntryMutationSuccess | IndexEntryMutationFailure;

// ---------------------------------------------------------------------------
// List results
// ---------------------------------------------------------------------------

export type IndexListResult = DiscoveryOutput<IndexDomain>;
export type IndexEntryListResult = DiscoveryOutput<IndexEntryDomain>;
