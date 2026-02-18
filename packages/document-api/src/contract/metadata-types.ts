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
  'COMMAND_UNAVAILABLE',
  'TRACK_CHANGE_COMMAND_UNAVAILABLE',
  'CAPABILITY_UNAVAILABLE',
  'INVALID_TARGET',
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
}
