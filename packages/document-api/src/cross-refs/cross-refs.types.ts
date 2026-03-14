import type { InlineAnchor } from '../types/base.js';
import type { TextTarget } from '../types/address.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

export interface CrossRefAddress {
  kind: 'inline';
  nodeType: 'crossRef';
  anchor: InlineAnchor;
}

// ---------------------------------------------------------------------------
// Target types (deterministic — all fields required)
// Amendments 4 & 5: includes numberedItem and styledParagraph
// ---------------------------------------------------------------------------

export type CrossRefTarget =
  | { kind: 'bookmark'; name: string }
  | { kind: 'heading'; nodeId: string }
  | { kind: 'note'; noteId: string }
  | { kind: 'caption'; nodeId: string }
  | { kind: 'numberedItem'; nodeId: string }
  | { kind: 'styledParagraph'; styleName: string; direction?: 'before' | 'after' };

// ---------------------------------------------------------------------------
// Display options (expanded per Amendments 4 & 5)
// ---------------------------------------------------------------------------

export type CrossRefDisplay =
  | 'content'
  | 'pageNumber'
  | 'noteNumber'
  | 'labelAndNumber'
  | 'aboveBelow'
  | 'numberOnly' // Amendment 4: just the number "3" or "a"
  | 'numberFullContext' // Amendment 4: full context "2.1.a"
  | 'styledContent' // Amendment 5: text content of styled paragraph
  | 'styledPageNumber'; // Amendment 5: page number of styled paragraph

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CrossRefListInput {
  limit?: number;
  offset?: number;
}

export interface CrossRefGetInput {
  target: CrossRefAddress;
}

export interface CrossRefRemoveInput {
  target: CrossRefAddress;
}

export interface CrossRefRebuildInput {
  target: CrossRefAddress;
}

export interface CrossRefInsertInput {
  at: TextTarget;
  target: CrossRefTarget;
  display: CrossRefDisplay;
}

// ---------------------------------------------------------------------------
// Info / Domain
// ---------------------------------------------------------------------------

export interface CrossRefInfo {
  address: CrossRefAddress;
  target: CrossRefTarget;
  display: CrossRefDisplay;
  resolvedText: string;
  instruction: string;
}

export interface CrossRefDomain {
  address: CrossRefAddress;
  target: CrossRefTarget;
  display: CrossRefDisplay;
  resolvedText: string;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface CrossRefMutationSuccess {
  success: true;
  crossRef: CrossRefAddress;
}

export interface CrossRefMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type CrossRefMutationResult = CrossRefMutationSuccess | CrossRefMutationFailure;

export type CrossRefsListResult = DiscoveryOutput<CrossRefDomain>;
