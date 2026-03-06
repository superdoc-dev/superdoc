import type { InlineAnchor } from '../types/base.js';
import type { TextTarget } from '../types/address.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Link address
// ---------------------------------------------------------------------------

export interface LinkAddress {
  kind: 'inline';
  nodeType: 'hyperlink';
  anchor: InlineAnchor;
}

// ---------------------------------------------------------------------------
// Destination
// ---------------------------------------------------------------------------

export type LinkDestination =
  | { kind: 'external'; href: string; tooltip?: string }
  | { kind: 'internal'; bookmarkName: string; tooltip?: string };

export interface LinkPatch {
  destination?: LinkDestination;
  tooltip?: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface LinkListInput {
  limit?: number;
  offset?: number;
}

export interface LinkGetInput {
  target: LinkAddress;
}

export interface LinkInsertInput {
  at: TextTarget;
  destination: LinkDestination;
}

export interface LinkUpdateInput {
  target: LinkAddress;
  patch: LinkPatch;
}

export interface LinkRemoveInput {
  target: LinkAddress;
}

// ---------------------------------------------------------------------------
// Info / domain
// ---------------------------------------------------------------------------

export interface LinkInfo {
  address: LinkAddress;
  destination: LinkDestination;
  tooltip?: string;
  text: string;
}

export interface LinkDomain {
  address: LinkAddress;
  destination: LinkDestination;
  tooltip?: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface LinkMutationSuccess {
  success: true;
  link: LinkAddress;
}

export interface LinkMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type LinkMutationResult = LinkMutationSuccess | LinkMutationFailure;

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export type LinksListResult = DiscoveryOutput<LinkDomain>;
