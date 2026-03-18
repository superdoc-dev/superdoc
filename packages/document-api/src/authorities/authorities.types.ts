import type { InlineAnchor } from '../types/base.js';
import type { TextTarget } from '../types/address.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { TocCreateLocation } from '../toc/toc.types.js';

// ---------------------------------------------------------------------------
// Address types
// ---------------------------------------------------------------------------

export interface AuthoritiesAddress {
  kind: 'block';
  nodeType: 'tableOfAuthorities';
  nodeId: string;
}

export interface AuthorityEntryAddress {
  kind: 'inline';
  nodeType: 'authorityEntry';
  anchor: InlineAnchor;
}

// ---------------------------------------------------------------------------
// Category type
// ---------------------------------------------------------------------------

export type AuthorityCategory =
  | 'cases'
  | 'statutes'
  | 'otherAuthorities'
  | 'rules'
  | 'treatises'
  | 'regulations'
  | 'constitutional'
  | number;

// ---------------------------------------------------------------------------
// TOA config
// ---------------------------------------------------------------------------

export interface AuthoritiesConfig {
  category?: number;
  entryPageSeparator?: string;
  usePassim?: boolean;
  includeHeadings?: boolean;
  tabLeader?: 'none' | 'dot' | 'hyphen' | 'underscore';
  pageRangeSeparator?: string;
}

// ---------------------------------------------------------------------------
// TOA inputs
// ---------------------------------------------------------------------------

export interface AuthoritiesListInput {
  limit?: number;
  offset?: number;
}
export interface AuthoritiesGetInput {
  target: AuthoritiesAddress;
}
export interface AuthoritiesRemoveInput {
  target: AuthoritiesAddress;
}
export interface AuthoritiesRebuildInput {
  target: AuthoritiesAddress;
}

export interface AuthoritiesInsertInput {
  at: TocCreateLocation;
  config?: AuthoritiesConfig;
}

export interface AuthoritiesConfigureInput {
  target: AuthoritiesAddress;
  patch: AuthoritiesConfig;
}

// ---------------------------------------------------------------------------
// TOA info / domain
// ---------------------------------------------------------------------------

export interface AuthoritiesInfo {
  address: AuthoritiesAddress;
  instruction: string;
  config: AuthoritiesConfig;
  entryCount: number;
}

export interface AuthoritiesDomain {
  address: AuthoritiesAddress;
  instruction: string;
  config: AuthoritiesConfig;
  entryCount: number;
}

// ---------------------------------------------------------------------------
// TA entry data
// ---------------------------------------------------------------------------

export interface AuthorityEntryData {
  longCitation: string;
  shortCitation?: string;
  category: AuthorityCategory;
  bold?: boolean;
  italic?: boolean;
}

// ---------------------------------------------------------------------------
// TA entry inputs
// ---------------------------------------------------------------------------

export interface AuthorityEntryListInput {
  category?: AuthorityCategory;
  limit?: number;
  offset?: number;
}
export interface AuthorityEntryGetInput {
  target: AuthorityEntryAddress;
}
export interface AuthorityEntryRemoveInput {
  target: AuthorityEntryAddress;
}

export interface AuthorityEntryInsertInput {
  at: TextTarget;
  entry: AuthorityEntryData;
}

export interface AuthorityEntryUpdateInput {
  target: AuthorityEntryAddress;
  patch: Partial<AuthorityEntryData>;
}

// ---------------------------------------------------------------------------
// TA entry info / domain
// ---------------------------------------------------------------------------

export interface AuthorityEntryInfo {
  address: AuthorityEntryAddress;
  longCitation: string;
  shortCitation?: string;
  category: AuthorityCategory;
  bold: boolean;
  italic: boolean;
  instruction: string;
}

export interface AuthorityEntryDomain {
  address: AuthorityEntryAddress;
  longCitation: string;
  shortCitation?: string;
  category: AuthorityCategory;
  bold: boolean;
  italic: boolean;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface AuthoritiesMutationSuccess {
  success: true;
  authorities: AuthoritiesAddress;
}
export interface AuthoritiesMutationFailure {
  success: false;
  failure: ReceiptFailure;
}
export type AuthoritiesMutationResult = AuthoritiesMutationSuccess | AuthoritiesMutationFailure;

export interface AuthorityEntryMutationSuccess {
  success: true;
  entry: AuthorityEntryAddress;
}
export interface AuthorityEntryMutationFailure {
  success: false;
  failure: ReceiptFailure;
}
export type AuthorityEntryMutationResult = AuthorityEntryMutationSuccess | AuthorityEntryMutationFailure;

// ---------------------------------------------------------------------------
// List results
// ---------------------------------------------------------------------------

export type AuthoritiesListResult = DiscoveryOutput<AuthoritiesDomain>;
export type AuthorityEntryListResult = DiscoveryOutput<AuthorityEntryDomain>;
