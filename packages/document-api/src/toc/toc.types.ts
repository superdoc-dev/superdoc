import type { BaseNodeInfo, BlockNodeAddress } from '../types/base.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { ReceiptFailure } from '../types/receipt.js';

// ---------------------------------------------------------------------------
// TOC address
// ---------------------------------------------------------------------------

export interface TocAddress {
  kind: 'block';
  nodeType: 'tableOfContents';
  nodeId: string;
}

// ---------------------------------------------------------------------------
// TOC switch config model
// ---------------------------------------------------------------------------

/** Configurable source switches. */
export interface TocSourceConfig {
  /** Outline heading level range from \o switch. */
  outlineLevels?: { from: number; to: number };
  /** Whether to use applied paragraph outline level (\u switch). */
  useAppliedOutlineLevel?: boolean;
  /** TC field identifier filter (\f switch). Only TC fields with this identifier are collected. */
  tcFieldIdentifier?: string;
  /** TC field level range filter (\l switch). Only TC fields within this range are collected. */
  tcFieldLevels?: { from: number; to: number };
}

/** Configurable display switches. */
export interface TocDisplayConfig {
  /** Make TOC entries hyperlinks (\h switch). */
  hyperlinks?: boolean;
  /** Hide tab leader and page numbers in web layout view (\z switch). */
  hideInWebView?: boolean;
  /** Omit page numbers for specified levels (\n switch). */
  omitPageNumberLevels?: { from: number; to: number };
  /** Separator character between entry text and page number (\p switch). */
  separator?: string;
  /** Whether page numbers are included. Convenience projection of the \n switch. */
  includePageNumbers?: boolean;
  /** Tab leader style between entry text and page number. */
  tabLeader?: 'none' | 'dot' | 'hyphen' | 'underscore' | 'middleDot';
  /** Whether TOC entry page numbers use right-aligned tab stops. Stored as a PM node attribute (not a field switch). */
  rightAlignPageNumbers?: boolean;
}

/** Round-tripped but not configurable via toc.configure. */
export interface TocPreservedSwitches {
  /** Custom styles from \t switch. */
  customStyles?: Array<{ styleName: string; level: number }>;
  /** Bookmark name from \b switch. */
  bookmarkName?: string;
  /** Caption type from \a switch. */
  captionType?: string;
  /** SEQ field identifier from \c switch. */
  seqFieldIdentifier?: string;
  /** Separator for SEQ/chapter numbers from \d switch. */
  chapterSeparator?: string;
  /** Chapter number source from \s switch. */
  chapterNumberSource?: string;
  /** Preserve tab entries from \w switch. */
  preserveTabEntries?: boolean;
  /** Completely unrecognized switches stored verbatim. */
  rawExtensions?: string[];
}

/** Full parsed switch model used internally by the parser/serializer. */
export interface TocSwitchConfig {
  source: TocSourceConfig;
  display: TocDisplayConfig;
  preserved: TocPreservedSwitches;
}

/** Patch for toc.configure — only configurable fields, all optional. */
export type TocConfigurePatch = TocSourceConfig & TocDisplayConfig;

// ---------------------------------------------------------------------------
// Node info
// ---------------------------------------------------------------------------

export interface TableOfContentsProperties {
  instruction: string;
  sourceConfig: TocSourceConfig;
  displayConfig: TocDisplayConfig;
  preservedSwitches: TocPreservedSwitches;
  entryCount: number;
}

export interface TableOfContentsNodeInfo extends BaseNodeInfo {
  nodeType: 'tableOfContents';
  kind: 'block';
  properties: TableOfContentsProperties;
}

// ---------------------------------------------------------------------------
// Discovery domain
// ---------------------------------------------------------------------------

export interface TocDomain {
  address: TocAddress;
  instruction: string;
  sourceConfig: TocSourceConfig;
  displayConfig: TocDisplayConfig;
  preserved: TocPreservedSwitches;
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Query / input / result types
// ---------------------------------------------------------------------------

export type TocListQuery = {
  limit?: number;
  offset?: number;
};

export type TocListResult = DiscoveryOutput<TocDomain>;

export interface TocGetInput {
  target: TocAddress;
}

export type TocInfo = TableOfContentsNodeInfo;

export interface TocConfigureInput {
  target: TocAddress;
  patch: TocConfigurePatch;
}

export interface TocUpdateInput {
  target: TocAddress;
  /** Update mode. 'all' rebuilds from sources; 'pageNumbers' updates only page numbers. */
  mode?: 'all' | 'pageNumbers';
}

export interface TocRemoveInput {
  target: TocAddress;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface TocMutationSuccess {
  success: true;
  toc: TocAddress;
}

export interface TocMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type TocMutationResult = TocMutationSuccess | TocMutationFailure;

// ---------------------------------------------------------------------------
// Create types
// ---------------------------------------------------------------------------

export type TocCreateLocation =
  | { kind: 'documentStart' }
  | { kind: 'documentEnd' }
  | { kind: 'before'; target: BlockNodeAddress }
  | { kind: 'after'; target: BlockNodeAddress };

export interface CreateTableOfContentsInput {
  at?: TocCreateLocation;
  config?: TocConfigurePatch;
}

export interface CreateTableOfContentsSuccess {
  success: true;
  toc: TocAddress;
}

export interface CreateTableOfContentsFailure {
  success: false;
  failure: ReceiptFailure;
}

export type CreateTableOfContentsResult = CreateTableOfContentsSuccess | CreateTableOfContentsFailure;

// ---------------------------------------------------------------------------
// TC entry address types
// ---------------------------------------------------------------------------

/** Address for a single TC field node in the document. */
export interface TocEntryAddress {
  kind: 'inline';
  nodeType: 'tableOfContentsEntry';
  /** Public ID (FNV-1a hash of instruction + position, revision-scoped). */
  nodeId: string;
}

/** Insertion target for toc.markEntry — anchored to a paragraph. */
export interface TocEntryInsertionTarget {
  kind: 'inline-insert';
  /** Insert TC field adjacent to a block-addressed paragraph. */
  anchor: {
    nodeType: 'paragraph';
    /** Target paragraph's sdBlockId. */
    nodeId: string;
  };
  /** Where within the paragraph to insert. Default: 'end'. */
  position?: 'start' | 'end';
}

// ---------------------------------------------------------------------------
// TC entry input types
// ---------------------------------------------------------------------------

export interface TocMarkEntryInput {
  target: TocEntryInsertionTarget;
  /** Entry text — required (v1: explicit text only). */
  text: string;
  /** TC \l switch level. Default: 1. */
  level?: number;
  /** TC \f switch table identifier. */
  tableIdentifier?: string;
  /** TC \n switch — omit page number for this entry. Default: false. */
  omitPageNumber?: boolean;
}

export interface TocUnmarkEntryInput {
  target: TocEntryAddress;
}

export interface TocListEntriesQuery {
  /** Filter by TC \f value. */
  tableIdentifier?: string;
  /** Filter by level range. */
  levelRange?: { from: number; to: number };
  limit?: number;
  offset?: number;
}

export interface TocGetEntryInput {
  target: TocEntryAddress;
}

export interface TocEditEntryInput {
  target: TocEntryAddress;
  patch: {
    text?: string;
    level?: number;
    tableIdentifier?: string;
    omitPageNumber?: boolean;
  };
}

// ---------------------------------------------------------------------------
// TC entry info / domain
// ---------------------------------------------------------------------------

export interface TocEntryProperties {
  /** Raw TC instruction string. */
  instruction: string;
  /** Entry display text. */
  text: string;
  /** TOC level (from \l switch, default 1). */
  level: number;
  /** Table identifier from \f switch, if present. */
  tableIdentifier?: string;
  /** Whether page number is omitted (\n switch). */
  omitPageNumber: boolean;
}

export interface TocEntryInfo {
  nodeType: 'tableOfContentsEntry';
  kind: 'inline';
  properties: TocEntryProperties;
}

export interface TocEntryDomain {
  address: TocEntryAddress;
  instruction: string;
  text: string;
  level: number;
  tableIdentifier?: string;
  omitPageNumber: boolean;
}

export type TocListEntriesResult = DiscoveryOutput<TocEntryDomain>;

// ---------------------------------------------------------------------------
// TC entry mutation results
// ---------------------------------------------------------------------------

export interface TocEntryMutationSuccess {
  success: true;
  entry: TocEntryAddress;
}

export interface TocEntryMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type TocEntryMutationResult = TocEntryMutationSuccess | TocEntryMutationFailure;
