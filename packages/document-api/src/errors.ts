/**
 * Structured validation error thrown by document-api execute* functions.
 *
 * Consumers should prefer checking `error.code` over `instanceof` for resilience
 * across package boundaries and bundling scenarios.
 */
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
