/**
 * Bridge utilities for converting internal receipt types to SDMutationReceipt.
 *
 * Two paths produce SDMutationReceipts:
 *   1. Text pipeline: TextMutationReceipt → SDMutationReceipt (via {@link textReceiptToSDReceipt})
 *   2. Structural pipeline: direct construction (via {@link buildStructuralReceipt})
 */

import type {
  TextMutationReceipt,
  TextMutationResolution,
  TextMutationRange,
  SDMutationReceipt,
  SDError,
  SelectionTarget,
  MutationResolutionTarget,
} from './types/index.js';

/**
 * Builds the public receipt resolution from a TextMutationResolution.
 * Passes through `target` (TextAddress) and optional `selectionTarget` directly.
 */
function buildResolution(resolution: TextMutationResolution): SDMutationReceipt['resolution'] {
  return {
    target: resolution.target,
    range: resolution.range,
    ...(resolution.selectionTarget ? { selectionTarget: resolution.selectionTarget } : {}),
  };
}

/**
 * Wraps a TextMutationReceipt into an SDMutationReceipt at the public API boundary.
 *
 * - Success/failure semantics are preserved.
 * - Resolution is passed through directly (both use TextAddress).
 * - Failure codes from the text pipeline are mapped to SDErrorCode.
 */
export function textReceiptToSDReceipt(receipt: TextMutationReceipt): SDMutationReceipt {
  if (receipt.success) {
    return {
      success: true,
      resolution: receipt.resolution ? buildResolution(receipt.resolution) : undefined,
    };
  }

  // Failure path
  const failure: SDError = {
    code: 'INTERNAL_ERROR',
    message: receipt.failure.message,
    ...(receipt.failure.details != null ? { details: receipt.failure.details as Record<string, unknown> } : {}),
  };

  // Map known receipt failure codes to SDErrorCode
  const CODE_MAP: Record<string, SDError['code']> = {
    INVALID_TARGET: 'INVALID_TARGET',
    TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
    NO_OP: 'NO_OP',
    UNSUPPORTED_ENVIRONMENT: 'UNSUPPORTED_ENVIRONMENT',
    INVALID_NESTING: 'INVALID_NESTING',
    INVALID_PLACEMENT: 'INVALID_PLACEMENT',
    INVALID_PAYLOAD: 'INVALID_PAYLOAD',
    CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNSUPPORTED',
    CAPABILITY_UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
    REVISION_MISMATCH: 'REVISION_MISMATCH',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  };
  failure.code = CODE_MAP[receipt.failure.code] ?? 'INTERNAL_ERROR';

  return {
    success: false,
    failure,
    resolution: receipt.resolution ? buildResolution(receipt.resolution) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Structural receipt builder
// ---------------------------------------------------------------------------

/** Parameters for building a structural mutation receipt. */
export interface StructuralReceiptParams {
  target: MutationResolutionTarget;
  range: TextMutationRange;
  selectionTarget?: SelectionTarget;
}

/**
 * Builds an SDMutationReceipt for structural (block-level) mutations.
 *
 * Unlike {@link textReceiptToSDReceipt} which converts from the internal
 * text pipeline, this constructs a receipt directly — preserving the
 * original `BlockNodeAddress` target instead of normalizing it to a
 * synthetic `TextAddress`.
 */
export function buildStructuralReceipt(success: true, params: StructuralReceiptParams): SDMutationReceipt;
export function buildStructuralReceipt(
  success: false,
  params: StructuralReceiptParams,
  failure: { code: string; message: string },
): SDMutationReceipt;
export function buildStructuralReceipt(
  success: boolean,
  params: StructuralReceiptParams,
  failure?: { code: string; message: string },
): SDMutationReceipt {
  const resolution: SDMutationReceipt['resolution'] = {
    target: params.target,
    range: params.range,
    ...(params.selectionTarget ? { selectionTarget: params.selectionTarget } : {}),
  };

  if (success) {
    return { success: true, resolution };
  }

  return {
    success: false,
    failure: { code: (failure?.code ?? 'INTERNAL_ERROR') as SDError['code'], message: failure?.message ?? '' },
    resolution,
  };
}
