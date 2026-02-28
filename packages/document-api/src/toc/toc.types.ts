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

/** Configurable source switches (ship now). */
export interface TocSourceConfig {
  /** Outline heading level range from \o switch. */
  outlineLevels?: { from: number; to: number };
  /** Whether to use applied paragraph outline level (\u switch). */
  useAppliedOutlineLevel?: boolean;
}

/** Configurable display switches (ship now). */
export interface TocDisplayConfig {
  /** Make TOC entries hyperlinks (\h switch). */
  hyperlinks?: boolean;
  /** Hide tab leader and page numbers in web layout view (\z switch). */
  hideInWebView?: boolean;
  /** Omit page numbers for specified levels (\n switch). */
  omitPageNumberLevels?: { from: number; to: number };
  /** Separator character between entry text and page number (\p switch). */
  separator?: string;
}

/** Round-tripped but not configurable via toc.configure. */
export interface TocPreservedSwitches {
  /** Custom styles from \t switch. */
  customStyles?: Array<{ styleName: string; level: number }>;
  /** Bookmark name from \b switch. */
  bookmarkName?: string;
  /** TC field entry identifier from \f switch. */
  tcFieldIdentifier?: string;
  /** TC field level range from \l switch. */
  tcFieldLevels?: { from: number; to: number };
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
