import type { AdapterMutationFailure } from '../types/adapter-result.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { TextTarget } from '../types/address.js';
import type { SDFragment } from '../types/fragment.js';

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

/**
 * Insert a footnote/endnote.
 *
 * Two mutually exclusive content forms:
 * - legacy `content: string` for plain-text note content
 * - structured `body: SDFragment` for SDM/1 content
 */
export type FootnoteInsertInput =
  | {
      at: TextTarget;
      type: 'footnote' | 'endnote';
      content: string;
      body?: never;
    }
  | {
      at: TextTarget;
      type: 'footnote' | 'endnote';
      body: SDFragment;
      content?: never;
    };

export type FootnoteUpdatePatch =
  | { content: string; body?: never }
  | { body: SDFragment; content?: never }
  | { content?: undefined; body?: undefined };

export interface FootnoteUpdateInput {
  target: FootnoteAddress;
  patch: FootnoteUpdatePatch;
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

export type FootnoteMutationResult = FootnoteMutationSuccess | AdapterMutationFailure;

// ---------------------------------------------------------------------------
// Config result
// ---------------------------------------------------------------------------

export interface FootnoteConfigSuccess {
  success: true;
}

export type FootnoteConfigResult = FootnoteConfigSuccess | AdapterMutationFailure;

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export type FootnotesListResult = DiscoveryOutput<FootnoteDomain>;
