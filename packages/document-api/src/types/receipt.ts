import type { EntityAddress, TextAddress, TrackedChangeAddress } from './address.js';

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
  | 'INTERNAL_ERROR';

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
};

export type TextMutationReceipt =
  | (ReceiptSuccess & { resolution: TextMutationResolution })
  | (ReceiptFailureResult & { resolution: TextMutationResolution });
