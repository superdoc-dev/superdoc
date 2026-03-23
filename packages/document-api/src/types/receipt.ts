import type { EntityAddress, SelectionTarget, TextAddress, TrackedChangeAddress } from './address.js';

export type ReceiptInsert = TrackedChangeAddress;
export type ReceiptEntity = EntityAddress;

export type ReceiptFailureCode =
  | 'NO_OP'
  | 'INVALID_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'CAPABILITY_UNAVAILABLE'
  | 'REVISION_MISMATCH'
  | 'MATCH_NOT_FOUND'
  | 'AMBIGUOUS_MATCH'
  | 'STYLE_CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'INVALID_INPUT'
  | 'CROSS_BLOCK_MATCH'
  | 'SPAN_FRAGMENTED'
  | 'TARGET_MOVED'
  | 'PLAN_CONFLICT_OVERLAP'
  | 'INVALID_STEP_COMBINATION'
  | 'REVISION_CHANGED_SINCE_COMPILE'
  | 'INVALID_INSERTION_CONTEXT'
  | 'DOCUMENT_IDENTITY_CONFLICT'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'INTERNAL_ERROR'
  | 'PAGE_NUMBERS_NOT_MATERIALIZED'
  // Lists-specific failure codes (SD-1272)
  | 'INCOMPATIBLE_DEFINITIONS'
  | 'NO_COMPATIBLE_PREVIOUS'
  | 'ALREADY_CONTINUOUS'
  | 'NO_PREVIOUS_LIST'
  | 'NO_ADJACENT_SEQUENCE'
  | 'ALREADY_SAME_SEQUENCE'
  | 'LEVEL_OUT_OF_RANGE'
  // SD-1973 formatting failure codes
  | 'LEVEL_NOT_FOUND'
  // Structural content failure codes
  | 'INVALID_NESTING'
  | 'INVALID_PLACEMENT'
  | 'EMPTY_FRAGMENT'
  | 'INVALID_FRAGMENT'
  // SDM/1 structural failure codes
  | 'INVALID_PAYLOAD'
  | 'CAPABILITY_UNSUPPORTED'
  | 'ADDRESS_STALE'
  | 'DUPLICATE_ID'
  | 'INVALID_CONTEXT'
  | 'RAW_MODE_REQUIRED'
  | 'PRESERVE_ONLY_VIOLATION'
  // SD-2070 content controls failure codes
  | 'LOCK_VIOLATION'
  | 'TYPE_MISMATCH';

export type ReceiptFailure = {
  code: ReceiptFailureCode;
  message: string;
  details?: unknown;
};

export type ReceiptSuccess = {
  success: true;
  inserted?: ReceiptEntity[];
  updated?: ReceiptEntity[];
  removed?: ReceiptEntity[];
};

export type ReceiptFailureResult = {
  success: false;
  failure: ReceiptFailure;
};

export type Receipt = ReceiptSuccess | ReceiptFailureResult;

export type TextMutationRange = {
  from: number;
  to: number;
};

export type TextMutationResolution = {
  /**
   * Requested input target from the caller, when provided.
   * For insert-without-target calls this is omitted.
   */
  requestedTarget?: TextAddress;
  /**
   * Effective target used by the adapter after canonical resolution.
   * For cross-block selections this reflects the first block only —
   * use {@link selectionTarget} for the full resolved range.
   */
  target: TextAddress;
  /**
   * Engine-resolved absolute document range for the effective target.
   */
  range: TextMutationRange;
  /**
   * Snapshot of text currently covered by the resolved range.
   * Empty for collapsed insert targets.
   */
  text: string;
  /**
   * Full selection target for cross-block mutations.
   * Present when the resolved range spans more than one block.
   * Single-block mutations omit this field.
   */
  selectionTarget?: SelectionTarget;
};

export type TextMutationReceipt =
  | (ReceiptSuccess & { resolution: TextMutationResolution })
  | (ReceiptFailureResult & { resolution: TextMutationResolution });
