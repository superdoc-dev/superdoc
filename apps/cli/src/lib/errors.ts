export type CliErrorCode =
  | 'INVALID_ARGUMENT'
  | 'SESSION_ID_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'UNKNOWN_COMMAND'
  | 'VALIDATION_ERROR'
  | 'MISSING_REQUIRED'
  | 'JSON_PARSE_ERROR'
  | 'FILE_READ_ERROR'
  | 'DOCUMENT_OPEN_FAILED'
  | 'DOCUMENT_EXPORT_FAILED'
  | 'FILE_WRITE_ERROR'
  | 'OUTPUT_EXISTS'
  | 'TARGET_NOT_FOUND'
  | 'NO_ACTIVE_DOCUMENT'
  | 'DIRTY_CLOSE_REQUIRES_DECISION'
  | 'REVISION_MISMATCH'
  | 'CONTEXT_LOCK_TIMEOUT'
  | 'PROJECT_CONTEXT_MISMATCH'
  | 'DIRTY_SESSION_EXISTS'
  | 'SOURCE_DRIFT_DETECTED'
  | 'COLLABORATION_SYNC_TIMEOUT'
  | 'TRACK_CHANGE_NOT_FOUND'
  | 'TRACK_CHANGE_MODE_UNSUPPORTED'
  | 'TRACK_CHANGE_COMMAND_UNAVAILABLE'
  | 'TRACK_CHANGE_CONFLICT'
  | 'COMMAND_FAILED'
  | 'TIMEOUT';

/**
 * Intersection type for errors thrown by document-api adapter operations.
 * These may carry a `code` string (e.g. `'TARGET_NOT_FOUND'`) and optional `details`.
 */
export type AdapterLikeError = Error & {
  code?: unknown;
  details?: unknown;
};

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly details?: unknown;
  readonly exitCode: number;

  constructor(code: CliErrorCode, message: string, details?: unknown, exitCode = 1) {
    super(message);
    Object.setPrototypeOf(this, CliError.prototype);
    this.name = 'CliError';
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;

  if (error instanceof Error) {
    return new CliError('COMMAND_FAILED', error.message, {
      name: error.name,
    });
  }

  return new CliError('COMMAND_FAILED', 'Unknown error', {
    error,
  });
}
