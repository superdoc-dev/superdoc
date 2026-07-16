import type { TextTarget } from '../types/address.js';
import type { AdapterMutationFailure } from '../types/adapter-result.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Address (composite identity)
// ---------------------------------------------------------------------------

export interface FieldAddress {
  kind: 'field';
  blockId: string;
  occurrenceIndex: number;
  nestingDepth: number;
  /**
   * Optional session-stable story id. When present together with `fieldId`, the
   * adapter resolves the field by its stable identity first and only falls back
   * to the legacy `blockId + occurrenceIndex + nestingDepth` lookup when no
   * stable handle is bound.
   *
   * Stability is session-scoped: the handle survives common structural edits
   * that insert, rebuild, or remove other fields in the same story. True
   * removal of the addressed field still invalidates the handle. The field
   * is not part of the persisted OOXML id model.
   */
  storyId?: string;
  /**
   * Optional session-stable field id. See `storyId` for the stability contract.
   * The legacy fields remain required so v1 callers and the shared schema keep
   * their existing shape.
   */
  fieldId?: string;
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

/**
 * Controls how an inserted field's display result is produced.
 *
 * - `rebuild` (default): existing behavior. The field is inserted with an empty
 *   cached result and is expected to be recomputed via `fields.rebuild`.
 * - `preserveCached`: the field is inserted with its visible/cached result frozen
 *   to the supplied `cachedResultText`. No rebuild is performed or implied. This
 *   is intended for exact reproduction of imported documents where the original
 *   Word-cached result must survive round-trips.
 */
export type FieldUpdatePolicy = 'rebuild' | 'preserveCached';

export interface FieldInsertInput {
  at: TextTarget;
  instruction: string;
  mode: 'raw'; // Required gating flag
  /**
   * Optional. When `updatePolicy` is `'preserveCached'`, this exact string is
   * written as the field's cached/visible result. Required (must be a string)
   * for `preserveCached`; ignored otherwise.
   */
  cachedResultText?: string;
  /**
   * Optional. Defaults to current `'rebuild'` behavior. Set to `'preserveCached'`
   * to freeze the imported cached result text instead of recomputing it.
   */
  updatePolicy?: FieldUpdatePolicy;
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

export type FieldMutationResult = FieldMutationSuccess | AdapterMutationFailure;

export type FieldsListResult = DiscoveryOutput<FieldDomain>;
