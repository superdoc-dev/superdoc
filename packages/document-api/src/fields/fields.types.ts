import type { TextTarget } from '../types/address.js';
import type { AdapterMutationFailure } from '../types/adapter-result.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { SDRunProps } from '../types/sd-props.js';

// ---------------------------------------------------------------------------
// Address (composite identity)
// ---------------------------------------------------------------------------

export interface FieldAddress {
  kind: 'field';
  blockId: string;
  occurrenceIndex: number;
  nestingDepth: number;
  /**
   * Optional session-stable story id for v2 callers. When present together
   * with `fieldId`, the v2 runtime resolves the field by its stable identity
   * first and only falls back to the legacy `blockId + occurrenceIndex +
   * nestingDepth` lookup when no stable handle is bound.
   */
  storyId?: string;
  /**
   * Optional session-stable field id for v2 callers. The field is not part of
   * the persisted OOXML id model.
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
 * - `rebuild` (default): inserts an empty cached result for later rebuild.
 * - `preserveCached`: writes the supplied `cachedResultText` as the visible
 *   result without implying a rebuild.
 */
export type FieldUpdatePolicy = 'rebuild' | 'preserveCached';

export type FieldSerialization = 'simple' | 'complex';

export interface FieldComplexFormatting {
  /** Run properties for `fldChar begin/separate/end` marker runs. */
  markerRunProps?: SDRunProps;
  /** Run properties for the `instrText` run. */
  instructionRunProps?: SDRunProps;
  /** Run properties for the visible result run. */
  resultRunProps?: SDRunProps;
}

export interface FieldInsertInput {
  at: TextTarget;
  instruction: string;
  mode: 'raw'; // Required gating flag
  /**
   * Exact cached/visible result text. Required when `updatePolicy` is
   * `'preserveCached'`.
   */
  cachedResultText?: string;
  /**
   * Optional. Defaults to current `'rebuild'` behavior. Set to
   * `'preserveCached'` to freeze imported cached result text.
   */
  updatePolicy?: FieldUpdatePolicy;
  /**
   * Optional. Defaults to `'simple'`. Set to `'complex'` to emit begin /
   * instruction / separate / result / end runs instead of a `fldSimple`.
   */
  serialization?: FieldSerialization;
  /** Run-property payload for complex field serialization. */
  complexFormatting?: FieldComplexFormatting;
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
