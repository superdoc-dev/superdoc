/**
 * Error mapping layer — translates invoke() errors to CLI error codes.
 *
 * The generic dispatch path calls mapInvokeError() after every invoke() failure.
 * It translates adapter-level error codes into stable CLI error codes that
 * consumers (tests, host protocol, LLM agents) depend on.
 *
 * Also handles failed-receipt mapping for mutations that return { success: false }
 * without throwing.
 */

import type { CliExposedOperationId } from '../cli/operation-set.js';
import { OPERATION_FAMILY, type OperationFamily } from '../cli/operation-hints.js';
import { CliError, type AdapterLikeError } from './errors.js';

// ---------------------------------------------------------------------------
// Error code extraction
// ---------------------------------------------------------------------------

function extractErrorCode(error: unknown): string | undefined {
  const maybe = error as AdapterLikeError;
  if (typeof maybe?.code === 'string') return maybe.code;
  return undefined;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function extractErrorDetails(error: unknown): unknown {
  const maybe = error as AdapterLikeError;
  return maybe?.details;
}

// ---------------------------------------------------------------------------
// Per-family error mappers (thrown errors)
// ---------------------------------------------------------------------------

function mapTrackChangesError(operationId: CliExposedOperationId, error: unknown, code: string | undefined): CliError {
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  if (code === 'TARGET_NOT_FOUND' || (typeof message === 'string' && message.includes('was not found'))) {
    return new CliError('TRACK_CHANGE_NOT_FOUND', message, { operationId, details });
  }

  if (code === 'COMMAND_UNAVAILABLE' || code === 'TRACK_CHANGE_COMMAND_UNAVAILABLE') {
    return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', message, { operationId, details });
  }

  if (error instanceof CliError) return error;
  return new CliError('COMMAND_FAILED', message, { operationId, details });
}

function mapCommentsError(operationId: CliExposedOperationId, error: unknown, code: string | undefined): CliError {
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  if (code === 'TARGET_NOT_FOUND' || (typeof message === 'string' && message.includes('could not be resolved'))) {
    return new CliError('TARGET_NOT_FOUND', message, { operationId, details });
  }

  if (code === 'INVALID_TARGET') {
    return new CliError('INVALID_ARGUMENT', message, { operationId, details });
  }

  if (code === 'COMMAND_UNAVAILABLE') {
    return new CliError('COMMAND_FAILED', message, { operationId, details });
  }

  if (error instanceof CliError) return error;
  return new CliError('COMMAND_FAILED', message, { operationId, details });
}

function mapListsError(operationId: CliExposedOperationId, error: unknown, code: string | undefined): CliError {
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  if (code === 'TARGET_NOT_FOUND') {
    return new CliError('TARGET_NOT_FOUND', message, { operationId, details });
  }

  if (code === 'INVALID_TARGET') {
    return new CliError('INVALID_ARGUMENT', message, { operationId, details });
  }

  if (code === 'TRACK_CHANGE_COMMAND_UNAVAILABLE' || code === 'CAPABILITY_UNAVAILABLE') {
    return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', message, { operationId, details });
  }

  if (code === 'COMMAND_UNAVAILABLE') {
    return new CliError('COMMAND_FAILED', message, { operationId, details });
  }

  if (error instanceof CliError) return error;
  return new CliError('COMMAND_FAILED', message, { operationId, details });
}

function mapTextMutationError(operationId: CliExposedOperationId, error: unknown, code: string | undefined): CliError {
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  if (code === 'TARGET_NOT_FOUND') {
    return new CliError('TARGET_NOT_FOUND', message, { operationId, details });
  }

  if (code === 'TRACK_CHANGE_COMMAND_UNAVAILABLE' || code === 'CAPABILITY_UNAVAILABLE') {
    return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', message, { operationId, details });
  }

  if (code === 'INVALID_TARGET') {
    return new CliError('INVALID_ARGUMENT', message, { operationId, details });
  }

  if (code === 'COMMAND_UNAVAILABLE') {
    return new CliError('COMMAND_FAILED', message, { operationId, details });
  }

  if (error instanceof CliError) return error;
  return new CliError('COMMAND_FAILED', message, { operationId, details });
}

function mapCreateError(operationId: CliExposedOperationId, error: unknown, code: string | undefined): CliError {
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  if (code === 'TARGET_NOT_FOUND') {
    return new CliError('TARGET_NOT_FOUND', message, { operationId, details });
  }

  if (code === 'TRACK_CHANGE_COMMAND_UNAVAILABLE') {
    return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', message, { operationId, details });
  }

  if (code === 'COMMAND_UNAVAILABLE') {
    return new CliError('COMMAND_FAILED', message, { operationId, details });
  }

  if (error instanceof CliError) return error;
  return new CliError('COMMAND_FAILED', message, { operationId, details });
}

function mapQueryError(operationId: CliExposedOperationId, error: unknown, code: string | undefined): CliError {
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  if (code === 'TARGET_NOT_FOUND' || (typeof message === 'string' && /not found/i.test(message))) {
    return new CliError('TARGET_NOT_FOUND', message, { operationId, details });
  }

  if (error instanceof CliError) return error;
  return new CliError('COMMAND_FAILED', message, { operationId, details });
}

// ---------------------------------------------------------------------------
// Per-family error mappers (dispatch by family)
// ---------------------------------------------------------------------------

const FAMILY_MAPPERS: Record<
  OperationFamily,
  (operationId: CliExposedOperationId, error: unknown, code: string | undefined) => CliError
> = {
  trackChanges: mapTrackChangesError,
  comments: mapCommentsError,
  lists: mapListsError,
  textMutation: mapTextMutationError,
  create: mapCreateError,
  query: mapQueryError,
  general: (operationId, error) => {
    if (error instanceof CliError) return error;
    return new CliError('COMMAND_FAILED', extractErrorMessage(error), { operationId });
  },
};

/**
 * Maps an invoke() exception to a CLI error with the appropriate error code.
 * Called by the generic dispatch path after every invoke() failure.
 */
export function mapInvokeError(operationId: CliExposedOperationId, error: unknown): CliError {
  if (error instanceof CliError) return error;
  const code = extractErrorCode(error);
  const family = OPERATION_FAMILY[operationId];
  return FAMILY_MAPPERS[family](operationId, error, code);
}

// ---------------------------------------------------------------------------
// Failed receipt mapping (non-throwing failure path)
// ---------------------------------------------------------------------------

type ReceiptLike = {
  success: boolean;
  failure?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

function isReceiptLike(value: unknown): value is ReceiptLike {
  if (typeof value !== 'object' || value == null) return false;
  return 'success' in value && typeof (value as ReceiptLike).success === 'boolean';
}

/**
 * Checks a mutation result for { success: false } and maps it to a CliError.
 * Many mutation operations return failed receipts without throwing — this
 * handles that non-throwing failure path.
 *
 * Returns null if the result is not a failed receipt (either successful or
 * not receipt-shaped at all).
 */
export function mapFailedReceipt(operationId: CliExposedOperationId, result: unknown): CliError | null {
  if (!isReceiptLike(result)) return null;
  if (result.success) return null;

  const failure = result.failure;
  const family = OPERATION_FAMILY[operationId];

  if (!failure) {
    return new CliError('COMMAND_FAILED', `${operationId}: operation failed.`, { operationId });
  }

  const failureCode = failure.code;
  const failureMessage = failure.message ?? `${operationId}: operation failed.`;

  // Track-changes family
  if (family === 'trackChanges') {
    if (failureCode === 'TRACK_CHANGE_COMMAND_UNAVAILABLE') {
      return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', failureMessage, { operationId, failure });
    }
    if (failureCode === 'INVALID_TARGET') {
      return new CliError('TRACK_CHANGE_NOT_FOUND', failureMessage, { operationId, failure });
    }
    return new CliError('COMMAND_FAILED', failureMessage, { operationId, failure });
  }

  // Comments family
  if (family === 'comments') {
    if (failureCode === 'TARGET_NOT_FOUND') {
      return new CliError('TARGET_NOT_FOUND', failureMessage, { operationId, failure });
    }
    if (failureCode === 'INVALID_TARGET') {
      return new CliError('INVALID_ARGUMENT', failureMessage, { operationId, failure });
    }
    return new CliError('COMMAND_FAILED', failureMessage, { operationId, failure });
  }

  // Lists family
  if (family === 'lists') {
    if (failureCode === 'INVALID_TARGET') {
      return new CliError('INVALID_ARGUMENT', failureMessage, { operationId, failure });
    }
    if (failureCode === 'CAPABILITY_UNAVAILABLE') {
      return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', failureMessage, { operationId, failure });
    }
    return new CliError('COMMAND_FAILED', failureMessage, { operationId, failure });
  }

  // Text mutation family
  if (family === 'textMutation') {
    if (failureCode === 'TRACK_CHANGE_COMMAND_UNAVAILABLE' || failureCode === 'CAPABILITY_UNAVAILABLE') {
      return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', failureMessage, { operationId, failure });
    }
    if (failureCode === 'INVALID_TARGET') {
      return new CliError('INVALID_ARGUMENT', failureMessage, { operationId, failure });
    }
    return new CliError('COMMAND_FAILED', failureMessage, { operationId, failure });
  }

  // Create family
  if (family === 'create') {
    if (failureCode === 'TRACK_CHANGE_COMMAND_UNAVAILABLE') {
      return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', failureMessage, { operationId, failure });
    }
    if (failureCode === 'INVALID_TARGET') {
      return new CliError('INVALID_ARGUMENT', failureMessage, { operationId, failure });
    }
    return new CliError('COMMAND_FAILED', failureMessage, { operationId, failure });
  }

  // Default
  return new CliError('COMMAND_FAILED', failureMessage, { operationId, failure });
}
