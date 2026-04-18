/**
 * Shared leaf types for operation metadata.
 *
 * This file is the bottom of the contract import DAG — it imports only
 * from `../types/receipt.js` and has no contract-internal dependencies.
 */

import type { ReceiptFailureCode } from '../types/receipt.js';

export const OPERATION_IDEMPOTENCY_VALUES = ['idempotent', 'conditional', 'non-idempotent'] as const;
export type OperationIdempotency = (typeof OPERATION_IDEMPOTENCY_VALUES)[number];

export const PRE_APPLY_THROW_CODES = [
  'TARGET_NOT_FOUND',
  'CAPABILITY_UNAVAILABLE',
  'INVALID_TARGET',
  'AMBIGUOUS_TARGET',
  'REVISION_MISMATCH',
  'MATCH_NOT_FOUND',
  'AMBIGUOUS_MATCH',
  'STYLE_CONFLICT',
  'PRECONDITION_FAILED',
  'INVALID_INPUT',
  'CROSS_BLOCK_MATCH',
  'SPAN_FRAGMENTED',
  'TARGET_MOVED',
  'PLAN_CONFLICT_OVERLAP',
  'INVALID_STEP_COMBINATION',
  'REVISION_CHANGED_SINCE_COMPILE',
  'INVALID_INSERTION_CONTEXT',
  'DOCUMENT_IDENTITY_CONFLICT',
  'INTERNAL_ERROR',
  // SDM/1 structural throw codes
  'ADDRESS_STALE',
  'DUPLICATE_ID',
  'INVALID_CONTEXT',
  'RAW_MODE_REQUIRED',
  'PRESERVE_ONLY_VIOLATION',
  'CAPABILITY_UNSUPPORTED',
  // SD-2070 content controls throw codes
  'LOCK_VIOLATION',
  'TYPE_MISMATCH',
  // Story-scoped throw codes
  'STORY_NOT_FOUND',
  'STORY_MISMATCH',
  'STORY_NOT_SUPPORTED',
  'CROSS_STORY_PLAN',
  'MATERIALIZATION_FAILED',
] as const;

export type PreApplyThrowCode = (typeof PRE_APPLY_THROW_CODES)[number];

export interface CommandThrowPolicy {
  preApply: readonly PreApplyThrowCode[];
  postApplyForbidden: true;
}

export interface CommandStaticMetadata {
  mutates: boolean;
  idempotency: OperationIdempotency;
  supportsDryRun: boolean;
  supportsTrackedMode: boolean;
  possibleFailureCodes: readonly ReceiptFailureCode[];
  throws: CommandThrowPolicy;
  deterministicTargetResolution: boolean;
  remediationHints?: readonly string[];
  /** When true, this operation bypasses PM transaction history (out-of-band XML mutation). */
  historyUnsafe?: boolean;
}
