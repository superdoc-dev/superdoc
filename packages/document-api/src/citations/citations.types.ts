import type { InlineAnchor } from '../types/base.js';
import type { TextTarget } from '../types/address.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { TocCreateLocation } from '../toc/toc.types.js';

// ---------------------------------------------------------------------------
// Address types
// ---------------------------------------------------------------------------

export interface CitationAddress {
  kind: 'inline';
  nodeType: 'citation';
  anchor: InlineAnchor;
}

export interface CitationSourceAddress {
  kind: 'entity';
  entityType: 'citationSource';
  sourceId: string;
}

export interface BibliographyAddress {
  kind: 'block';
  nodeType: 'bibliography';
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Citation source types
// ---------------------------------------------------------------------------

export type CitationSourceType =
  | 'book'
  | 'journalArticle'
  | 'conferenceProceedings'
  | 'report'
  | 'website'
  | 'patent'
  | 'case'
  | 'statute'
  | 'thesis'
  | 'film'
  | 'interview'
  | 'misc';

export interface CitationPerson {
  first?: string;
  middle?: string;
  last: string;
}

/** Fields follow the OOXML bibliography schema (Sources.xsd). */
export interface CitationSourceFields {
  title?: string;
  authors?: CitationPerson[];
  year?: string;
  publisher?: string;
  city?: string;
  journalName?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  doi?: string;
  edition?: string;
  editor?: CitationPerson[];
  translator?: CitationPerson[];
  medium?: string;
  shortTitle?: string;
  standardNumber?: string;
}

// ---------------------------------------------------------------------------
// Citation inputs (inline reference marker)
// ---------------------------------------------------------------------------

export interface CitationListInput {
  limit?: number;
  offset?: number;
}

export interface CitationGetInput {
  target: CitationAddress;
}

export interface CitationRemoveInput {
  target: CitationAddress;
}

export interface CitationInsertInput {
  at: TextTarget;
  sourceIds: string[];
}

export interface CitationUpdateInput {
  target: CitationAddress;
  patch: {
    sourceIds?: string[];
  };
}

// ---------------------------------------------------------------------------
// Citation info / domain
// ---------------------------------------------------------------------------

export interface CitationInfo {
  address: CitationAddress;
  sourceIds: string[];
  displayText: string;
  instruction: string;
}

export interface CitationDomain {
  address: CitationAddress;
  sourceIds: string[];
  displayText: string;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Citation source inputs
// ---------------------------------------------------------------------------

export interface CitationSourceListInput {
  type?: CitationSourceType;
  limit?: number;
  offset?: number;
}

export interface CitationSourceGetInput {
  target: CitationSourceAddress;
}

export interface CitationSourceRemoveInput {
  target: CitationSourceAddress;
}

export interface CitationSourceInsertInput {
  type: CitationSourceType;
  fields: CitationSourceFields;
}

export interface CitationSourceUpdateInput {
  target: CitationSourceAddress;
  patch: Partial<CitationSourceFields>;
}

// ---------------------------------------------------------------------------
// Citation source info / domain
// ---------------------------------------------------------------------------

export interface CitationSourceInfo {
  address: CitationSourceAddress;
  sourceId: string;
  tag: string;
  type: CitationSourceType;
  fields: CitationSourceFields;
}

export interface CitationSourceDomain {
  address: CitationSourceAddress;
  sourceId: string;
  tag: string;
  type: CitationSourceType;
  fields: CitationSourceFields;
}

// ---------------------------------------------------------------------------
// Bibliography inputs
// ---------------------------------------------------------------------------

export interface BibliographyInsertInput {
  at: TocCreateLocation;
}

export interface BibliographyRebuildInput {
  target: BibliographyAddress;
}

export interface BibliographyConfigureInput {
  style: string;
}

export interface BibliographyRemoveInput {
  target: BibliographyAddress;
}

export interface BibliographyGetInput {
  target: BibliographyAddress;
}

// ---------------------------------------------------------------------------
// Bibliography info
// ---------------------------------------------------------------------------

export interface BibliographyInfo {
  address: BibliographyAddress;
  style: string;
  sourceCount: number;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface CitationMutationSuccess {
  success: true;
  citation: CitationAddress;
}

export interface CitationMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type CitationMutationResult = CitationMutationSuccess | CitationMutationFailure;

export interface CitationSourceMutationSuccess {
  success: true;
  source: CitationSourceAddress;
}

export interface CitationSourceMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type CitationSourceMutationResult = CitationSourceMutationSuccess | CitationSourceMutationFailure;

export interface BibliographyMutationSuccess {
  success: true;
  bibliography: BibliographyAddress;
}

export interface BibliographyMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type BibliographyMutationResult = BibliographyMutationSuccess | BibliographyMutationFailure;

// ---------------------------------------------------------------------------
// List results
// ---------------------------------------------------------------------------

export type CitationsListResult = DiscoveryOutput<CitationDomain>;
export type CitationSourcesListResult = DiscoveryOutput<CitationSourceDomain>;
