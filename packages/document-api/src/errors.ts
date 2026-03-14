/**
 * Structured validation error thrown by document-api execute* functions.
 *
 * Consumers should prefer checking `error.code` over `instanceof` for resilience
 * across package boundaries and bundling scenarios.
 */

import type { SDError, SDErrorCode } from './types/sd-contract.js';

export class DocumentApiValidationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DocumentApiValidationError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, DocumentApiValidationError.prototype);
  }
}

// ---------------------------------------------------------------------------
// SDErrorCode crosswalk — maps legacy codes to SDM/1 error vocabulary
// ---------------------------------------------------------------------------

const LEGACY_TO_SD_CODE: Record<string, SDErrorCode> = {
  INVALID_FRAGMENT: 'INVALID_PAYLOAD',
  EMPTY_FRAGMENT: 'INVALID_PAYLOAD',
  INVALID_INPUT: 'INVALID_PAYLOAD',
  INVALID_TARGET: 'INVALID_TARGET',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNSUPPORTED',
  INVALID_NESTING: 'INVALID_NESTING',
  INVALID_PLACEMENT: 'INVALID_PLACEMENT',
  REVISION_MISMATCH: 'REVISION_MISMATCH',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

/**
 * Converts a {@link DocumentApiValidationError} to an {@link SDError}.
 *
 * Maps legacy error codes to the normative SDErrorCode vocabulary.
 * Unknown codes fall through as `INTERNAL_ERROR`.
 */
export function toSDError(error: DocumentApiValidationError): SDError {
  const sdCode = LEGACY_TO_SD_CODE[error.code] ?? 'INTERNAL_ERROR';
  return {
    code: sdCode,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}
