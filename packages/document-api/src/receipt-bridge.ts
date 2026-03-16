/**
 * Bridge utilities for converting between TextMutationReceipt and SDMutationReceipt.
 *
 * The legacy text write pipeline returns TextMutationReceipt internally.
 * The public insert/replace API returns SDMutationReceipt for all branches.
 * This module handles the conversion at the API boundary.
 */

import type { TextMutationReceipt, SDMutationReceipt, SDError } from './types/index.js';
import type { SDAddress } from './types/sd-envelope.js';
import type { TextAddress } from './types/address.js';

/**
 * Converts a TextAddress into an SDAddress for receipt resolution.
 */
function textAddressToSDAddress(textAddr: TextAddress): SDAddress {
  return {
    kind: 'content',
    stability: 'stable',
    nodeId: textAddr.blockId,
    anchor: {
      start: { blockId: textAddr.blockId, offset: textAddr.range.start },
      end: { blockId: textAddr.blockId, offset: textAddr.range.end },
    },
  };
}

/**
 * Wraps a TextMutationReceipt into an SDMutationReceipt at the public API boundary.
 *
 * - Success/failure semantics are preserved.
 * - TextAddress resolution is converted to SDAddress resolution.
 * - Failure codes from the text pipeline are mapped through the receipt.
 */
/**
 * Builds the SDMutationReceipt resolution object from a TextMutationResolution.
 * Carries through selectionTarget for cross-block mutations.
 */
function buildSDResolution(
  resolution: import('./types/index.js').TextMutationResolution,
): SDMutationReceipt['resolution'] {
  return {
    ...(resolution.requestedTarget ? { requestedTarget: textAddressToSDAddress(resolution.requestedTarget) } : {}),
    target: textAddressToSDAddress(resolution.target),
    ...(resolution.selectionTarget ? { selectionTarget: resolution.selectionTarget } : undefined),
  };
}

export function textReceiptToSDReceipt(receipt: TextMutationReceipt): SDMutationReceipt {
  if (receipt.success) {
    return {
      success: true,
      resolution: receipt.resolution ? buildSDResolution(receipt.resolution) : undefined,
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
    resolution: receipt.resolution ? buildSDResolution(receipt.resolution) : undefined,
  };
}
