/** Error codes used by {@link DocumentApiAdapterError} to classify adapter failures. */
export type DocumentApiAdapterErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'INVALID_TARGET'
  | 'AMBIGUOUS_TARGET'
  | 'CAPABILITY_UNAVAILABLE';

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
