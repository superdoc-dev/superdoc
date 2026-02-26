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
import { CliError, type AdapterLikeError, type CliErrorCode } from './errors.js';

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

  // Plan-engine errors pass through with original code and structured details
  const planEngineError = tryMapPlanEngineError(operationId, error, code);
  if (planEngineError) return planEngineError;

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

  // Plan-engine errors pass through with original code and structured details
  const planEngineError = tryMapPlanEngineError(operationId, error, code);
  if (planEngineError) return planEngineError;

  if (code === 'TARGET_NOT_FOUND') {
    return new CliError('TARGET_NOT_FOUND', message, { operationId, details });
  }

  if (code === 'AMBIGUOUS_TARGET' || code === 'INVALID_TARGET') {
    return new CliError('INVALID_ARGUMENT', message, { operationId, details });
  }

  if (code === 'TRACK_CHANGE_COMMAND_UNAVAILABLE') {
    return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', message, { operationId, details });
  }

  if (code === 'CAPABILITY_UNAVAILABLE') {
    const reason = (details as { reason?: string } | undefined)?.reason;
    if (reason === 'tracked_mode_unsupported') {
      return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', message, { operationId, details });
    }
    return new CliError('COMMAND_FAILED', message, { operationId, details });
  }

  if (code === 'COMMAND_UNAVAILABLE') {
    return new CliError('COMMAND_FAILED', message, { operationId, details });
  }

  if (error instanceof CliError) return error;
  return new CliError('COMMAND_FAILED', message, { operationId, details });
}

function mapBlocksError(operationId: CliExposedOperationId, error: unknown, code: string | undefined): CliError {
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  if (code === 'TARGET_NOT_FOUND') {
    return new CliError('TARGET_NOT_FOUND', message, { operationId, details });
  }

  if (code === 'AMBIGUOUS_TARGET' || code === 'INVALID_TARGET' || code === 'INVALID_INPUT') {
    return new CliError('INVALID_ARGUMENT', message, { operationId, details });
  }

  if (code === 'CAPABILITY_UNAVAILABLE') {
    const reason = (details as { reason?: string } | undefined)?.reason;
    if (reason === 'tracked_mode_unsupported') {
      return new CliError('TRACK_CHANGE_COMMAND_UNAVAILABLE', message, { operationId, details });
    }
    return new CliError('COMMAND_FAILED', message, { operationId, details });
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
// Plan-engine error codes — pass through with original code and details
// ---------------------------------------------------------------------------

/**
 * Plan-engine error codes that must be preserved verbatim in CLI output.
 * These carry structured details (refRevision, matrixVerdict, remediation, etc.)
 * that consumers depend on for programmatic triage.
 */
const PLAN_ENGINE_PASSTHROUGH_CODES: ReadonlySet<CliErrorCode> = new Set<CliErrorCode>([
  'REVISION_MISMATCH',
  'REVISION_CHANGED_SINCE_COMPILE',
  'PLAN_CONFLICT_OVERLAP',
  'DOCUMENT_IDENTITY_CONFLICT',
  'INVALID_INSERTION_CONTEXT',
  'INVALID_INPUT',
  'INVALID_STEP_COMBINATION',
  'MATCH_NOT_FOUND',
  'PRECONDITION_FAILED',
  'CROSS_BLOCK_MATCH',
  'SPAN_FRAGMENTED',
]);

/**
 * If the error code is a known plan-engine code, pass it through with
 * original code and all structured details preserved.
 * Returns null if the code is not a plan-engine passthrough code.
 */
function tryMapPlanEngineError(
  operationId: CliExposedOperationId,
  error: unknown,
  code: string | undefined,
): CliError | null {
  if (!code || !(PLAN_ENGINE_PASSTHROUGH_CODES as ReadonlySet<string>).has(code)) return null;
  return new CliError(code as CliErrorCode, extractErrorMessage(error), {
    operationId,
    details: extractErrorDetails(error),
  });
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
  blocks: mapBlocksError,
  query: mapQueryError,
  general: (operationId, error, code) => {
    // Plan-engine errors pass through with original code and structured details
    const planEngineError = tryMapPlanEngineError(operationId, error, code);
    if (planEngineError) return planEngineError;

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

  // Plan-engine codes pass through with original code and structured details
  if (failureCode && (PLAN_ENGINE_PASSTHROUGH_CODES as ReadonlySet<string>).has(failureCode)) {
    return new CliError(failureCode as CliErrorCode, failureMessage, { operationId, failure });
  }

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

  // Blocks family
  if (family === 'blocks') {
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
