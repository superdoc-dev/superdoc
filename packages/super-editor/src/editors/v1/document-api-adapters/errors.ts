import type { SDError, SDErrorCode } from '@superdoc/document-api';

/** Error codes used by {@link DocumentApiAdapterError} to classify adapter failures. */
export type DocumentApiAdapterErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'INVALID_TARGET'
  | 'AMBIGUOUS_TARGET'
  | 'CAPABILITY_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'INVALID_NESTING'
  | 'INVALID_PLACEMENT'
  | 'INTERNAL_ERROR'
  | 'PRECONDITION_FAILED'
  | 'CAPABILITY_UNSUPPORTED'
  | 'STORY_NOT_FOUND'
  | 'MATERIALIZATION_FAILED'
  // SDM/1 structural codes
  | 'ADDRESS_STALE'
  | 'DUPLICATE_ID'
  | 'INVALID_CONTEXT'
  | 'RAW_MODE_REQUIRED'
  | 'PRESERVE_ONLY_VIOLATION'
  // SD-2070 content controls codes
  | 'LOCK_VIOLATION'
  | 'TYPE_MISMATCH';

/**
 * Structured error thrown by document-api adapter functions.
 *
 * @param code - Machine-readable error classification.
 * @param message - Human-readable description.
 * @param details - Optional payload with additional context.
 */
export class DocumentApiAdapterError extends Error {
  readonly code: DocumentApiAdapterErrorCode;
  readonly details?: unknown;

  constructor(code: DocumentApiAdapterErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DocumentApiAdapterError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, DocumentApiAdapterError.prototype);
  }
}

/**
 * Type guard that narrows an unknown value to {@link DocumentApiAdapterError}.
 *
 * @param error - The value to test.
 * @returns `true` if the value is a `DocumentApiAdapterError` instance.
 */
export function isDocumentApiAdapterError(error: unknown): error is DocumentApiAdapterError {
  return error instanceof DocumentApiAdapterError;
}

// ---------------------------------------------------------------------------
// SDErrorCode crosswalk — maps adapter codes to SDM/1 error vocabulary
// ---------------------------------------------------------------------------

const ADAPTER_TO_SD_CODE: Record<string, SDErrorCode> = {
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  INVALID_TARGET: 'INVALID_TARGET',
  AMBIGUOUS_TARGET: 'INVALID_TARGET',
  CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNSUPPORTED',
  INVALID_INPUT: 'INVALID_PAYLOAD',
  INVALID_NESTING: 'INVALID_NESTING',
  INVALID_PLACEMENT: 'INVALID_PLACEMENT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  PRECONDITION_FAILED: 'INVALID_PAYLOAD',
  CAPABILITY_UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
  STORY_NOT_FOUND: 'TARGET_NOT_FOUND',
  ADDRESS_STALE: 'ADDRESS_STALE',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  RAW_MODE_REQUIRED: 'RAW_MODE_REQUIRED',
  PRESERVE_ONLY_VIOLATION: 'PRESERVE_ONLY_VIOLATION',
  LOCK_VIOLATION: 'INVALID_CONTEXT',
  TYPE_MISMATCH: 'INVALID_PAYLOAD',
};

/**
 * Converts a {@link DocumentApiAdapterError} to an {@link SDError}.
 *
 * Maps adapter error codes to the normative SDErrorCode vocabulary.
 * Unknown codes fall through as `INTERNAL_ERROR`.
 */
export function adapterErrorToSDError(error: DocumentApiAdapterError): SDError {
  const sdCode = ADAPTER_TO_SD_CODE[error.code] ?? 'INTERNAL_ERROR';
  return {
    code: sdCode,
    message: error.message,
    ...(error.details != null ? { details: error.details as Record<string, unknown> } : {}),
  };
}
