import type { TextTarget } from '../types/address.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Address (composite identity)
// ---------------------------------------------------------------------------

export interface FieldAddress {
  kind: 'field';
  blockId: string;
  occurrenceIndex: number;
  nestingDepth: number;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface FieldListInput {
  type?: string;
  limit?: number;
  offset?: number;
}

export interface FieldGetInput {
  target: FieldAddress;
}

export interface FieldInsertInput {
  at: TextTarget;
  instruction: string;
  mode: 'raw'; // Required gating flag
}

export interface FieldRebuildInput {
  target: FieldAddress;
}

export interface FieldRemoveInput {
  target: FieldAddress;
  mode: 'raw'; // Required gating flag
}

// ---------------------------------------------------------------------------
// Info / Domain
// ---------------------------------------------------------------------------

export interface FieldInfo {
  address: FieldAddress;
  instruction: string;
  fieldType: string;
  resolvedText: string;
  nested: boolean;
  parentAddress?: FieldAddress;
}

export interface FieldDomain {
  address: FieldAddress;
  instruction: string;
  fieldType: string;
  resolvedText: string;
  nested: boolean;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface FieldMutationSuccess {
  success: true;
  field: FieldAddress;
}

export interface FieldMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

export type FieldMutationResult = FieldMutationSuccess | FieldMutationFailure;

export type FieldsListResult = DiscoveryOutput<FieldDomain>;
