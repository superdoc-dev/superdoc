import type { SectionAddress } from '../sections/sections.types.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export type HeaderFooterKind = 'header' | 'footer';
export type HeaderFooterVariant = 'default' | 'first' | 'even';

// ---------------------------------------------------------------------------
// Address types
// ---------------------------------------------------------------------------

/** Targets a specific (section, kind, variant) slot. */
export interface HeaderFooterSlotAddress {
  kind: 'headerFooterSlot';
  section: SectionAddress;
  headerFooterKind: HeaderFooterKind;
  variant: HeaderFooterVariant;
}

/** Targets a specific part by relationship ID. */
export interface HeaderFooterPartAddress {
  kind: 'headerFooterPart';
  refId: string;
}

// ---------------------------------------------------------------------------
// Read model types
// ---------------------------------------------------------------------------

/** One section-slot entry (returned by list/get). */
export interface HeaderFooterSlotEntry {
  section: SectionAddress;
  sectionIndex: number;
  kind: HeaderFooterKind;
  variant: HeaderFooterVariant;
  /** The explicit refId on this section slot, or null if inherited/absent. */
  refId: string | null;
  /** True when the slot has a direct reference in the section's sectPr. */
  isExplicit: boolean;
}

/** Resolution result (returned by resolve). */
export type HeaderFooterResolveResult =
  | {
      status: 'explicit';
      refId: string;
      section: SectionAddress;
    }
  | {
      status: 'inherited';
      refId: string;
      /** The section from which the ref was inherited. */
      resolvedFromSection: SectionAddress;
      /** The variant that actually matched (may differ from requested if fell back to 'default'). */
      resolvedVariant: HeaderFooterVariant;
    }
  | {
      status: 'none';
    };

/** One unique part record (returned by parts.list). */
export interface HeaderFooterPartEntry {
  refId: string;
  kind: HeaderFooterKind;
  /** The OOXML part path, e.g. 'word/header1.xml'. */
  partPath: string;
  /** Sections that explicitly reference this part. */
  referencedBySections: SectionAddress[];
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface HeaderFootersListQuery {
  /** Filter by kind. Omit to return both headers and footers. */
  kind?: HeaderFooterKind;
  /** Filter to a single section. Omit to return all sections. */
  section?: SectionAddress;
  /** Max items to return. Omit to return all. Must be > 0 if provided. */
  limit?: number;
  /** Zero-based offset into sorted results. Defaults to 0. Must be >= 0. */
  offset?: number;
}

export type HeaderFootersListResult = DiscoveryOutput<HeaderFooterSlotEntry>;

export interface HeaderFootersGetInput {
  target: HeaderFooterSlotAddress;
}

export interface HeaderFootersResolveInput {
  target: HeaderFooterSlotAddress;
}

export interface HeaderFootersRefsSetInput {
  target: HeaderFooterSlotAddress;
  refId: string;
}

export interface HeaderFootersRefsClearInput {
  target: HeaderFooterSlotAddress;
}

export interface HeaderFootersRefsSetLinkedToPreviousInput {
  target: HeaderFooterSlotAddress;
  linked: boolean;
}

export interface HeaderFootersPartsListQuery {
  kind?: HeaderFooterKind;
  /** Max items to return. Omit to return all. Must be > 0 if provided. */
  limit?: number;
  /** Zero-based offset into sorted results. Defaults to 0. Must be >= 0. */
  offset?: number;
}

export type HeaderFootersPartsListResult = DiscoveryOutput<HeaderFooterPartEntry>;

/** Creates an independent part. Slot assignment happens separately via refs.set. */
export interface HeaderFootersPartsCreateInput {
  kind: HeaderFooterKind;
  /** Clone content from an existing part. Omit to create empty. */
  sourceRefId?: string;
}

export interface HeaderFootersPartsDeleteInput {
  target: HeaderFooterPartAddress;
}

// ---------------------------------------------------------------------------
// Mutation result types
// ---------------------------------------------------------------------------

export interface HeaderFooterRefsMutationSuccessResult {
  success: true;
  section: SectionAddress;
}

export interface HeaderFooterRefsMutationFailureResult {
  success: false;
  failure: ReceiptFailure;
}

export type HeaderFooterRefsMutationResult =
  | HeaderFooterRefsMutationSuccessResult
  | HeaderFooterRefsMutationFailureResult;

export interface HeaderFooterPartsMutationSuccessResult {
  success: true;
  refId: string;
  partPath: string;
}

export interface HeaderFooterPartsMutationFailureResult {
  success: false;
  failure: ReceiptFailure;
}

export type HeaderFooterPartsMutationResult =
  | HeaderFooterPartsMutationSuccessResult
  | HeaderFooterPartsMutationFailureResult;
