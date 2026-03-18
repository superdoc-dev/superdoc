import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { TextTarget } from '../types/address.js';

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

export interface FootnoteAddress {
  kind: 'entity';
  entityType: 'footnote';
  noteId: string;
}

// ---------------------------------------------------------------------------
// Configuration types (Amendment 6: separate configs with position)
// ---------------------------------------------------------------------------

export interface FootnoteNumberingConfig {
  format?: 'decimal' | 'lowerRoman' | 'upperRoman' | 'lowerLetter' | 'upperLetter' | 'symbol';
  start?: number;
  restartPolicy?: 'continuous' | 'eachSection' | 'eachPage';
  /** Footnote position. Maps to w:pos in w:footnotePr. */
  position?: 'pageBottom' | 'beneathText';
}

export interface EndnoteNumberingConfig {
  format?: 'decimal' | 'lowerRoman' | 'upperRoman' | 'lowerLetter' | 'upperLetter' | 'symbol';
  start?: number;
  restartPolicy?: 'continuous' | 'eachSection';
  /** Endnote position. Maps to w:pos in w:endnotePr. */
  position?: 'sectionEnd' | 'documentEnd';
}

export type FootnoteConfigScope = { kind: 'document' } | { kind: 'section'; sectionId: string };

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface FootnoteListInput {
  type?: 'footnote' | 'endnote';
  limit?: number;
  offset?: number;
}

export interface FootnoteGetInput {
  target: FootnoteAddress;
}

export interface FootnoteInsertInput {
  at: TextTarget;
  type: 'footnote' | 'endnote';
  content: string;
}

export interface FootnoteUpdateInput {
  target: FootnoteAddress;
  patch: { content?: string };
}

export interface FootnoteRemoveInput {
  target: FootnoteAddress;
}

export interface FootnoteConfigureInput {
  type: 'footnote' | 'endnote';
  scope: FootnoteConfigScope;
  numbering?: FootnoteNumberingConfig | EndnoteNumberingConfig;
}

// ---------------------------------------------------------------------------
// Info / Domain
// ---------------------------------------------------------------------------

export interface FootnoteInfo {
  address: FootnoteAddress;
  type: 'footnote' | 'endnote';
  noteId: string;
  displayNumber: string;
  content: string;
}

export interface FootnoteDomain {
  address: FootnoteAddress;
  type: 'footnote' | 'endnote';
  noteId: string;
  displayNumber: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface FootnoteMutationSuccess {
  success: true;
  footnote: FootnoteAddress;
}

export interface FootnoteMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type FootnoteMutationResult = FootnoteMutationSuccess | FootnoteMutationFailure;

// ---------------------------------------------------------------------------
// Config result
// ---------------------------------------------------------------------------

export interface FootnoteConfigSuccess {
  success: true;
}

export interface FootnoteConfigFailure {
  success: false;
  failure: ReceiptFailure;
}

export type FootnoteConfigResult = FootnoteConfigSuccess | FootnoteConfigFailure;

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export type FootnotesListResult = DiscoveryOutput<FootnoteDomain>;
