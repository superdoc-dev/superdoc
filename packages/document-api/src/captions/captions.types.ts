import type { BlockNodeAddress } from '../types/base.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Address (caption is a paragraph with a SEQ field)
// ---------------------------------------------------------------------------

export interface CaptionAddress {
  kind: 'block';
  nodeType: 'paragraph';
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CaptionListInput {
  label?: string;
  limit?: number;
  offset?: number;
}

export interface CaptionGetInput {
  target: CaptionAddress;
}

export interface CaptionInsertInput {
  adjacentTo: BlockNodeAddress;
  position: 'above' | 'below';
  label: string;
  text?: string;
}

export interface CaptionUpdateInput {
  target: CaptionAddress;
  patch: { text?: string };
}

export interface CaptionRemoveInput {
  target: CaptionAddress;
}

export interface CaptionConfigureInput {
  label: string;
  format?: 'decimal' | 'lowerRoman' | 'upperRoman' | 'lowerLetter' | 'upperLetter';
  includeChapter?: boolean;
  chapterStyle?: string;
}

// ---------------------------------------------------------------------------
// Info / Domain
// ---------------------------------------------------------------------------

export interface CaptionInfo {
  address: CaptionAddress;
  label: string;
  number: number;
  text: string;
  instruction: string;
}

export interface CaptionDomain {
  address: CaptionAddress;
  label: string;
  number: number;
  text: string;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface CaptionMutationSuccess {
  success: true;
  caption: CaptionAddress;
}

export interface CaptionMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type CaptionMutationResult = CaptionMutationSuccess | CaptionMutationFailure;

export interface CaptionConfigSuccess {
  success: true;
}

export interface CaptionConfigFailure {
  success: false;
  failure: ReceiptFailure;
}

export type CaptionConfigResult = CaptionConfigSuccess | CaptionConfigFailure;

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export type CaptionsListResult = DiscoveryOutput<CaptionDomain>;
