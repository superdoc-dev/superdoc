import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';

// ---------------------------------------------------------------------------
// Locator validation
// ---------------------------------------------------------------------------

type RowLocatorInput = { target?: unknown; nodeId?: unknown; rowIndex?: unknown };

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates that a table locator has exactly one of `target` or `nodeId`.
 *
 * This is the single validation function for all table operations.
 * Every table operation uses the same `target`/`nodeId` locator vocabulary.
 */
function validateTableLocator(input: { target?: unknown; nodeId?: unknown }, operationName: string): void {
  const hasTarget = input.target !== undefined;
  const hasNodeId = input.nodeId !== undefined;

  if (hasTarget && hasNodeId) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `Cannot combine target with nodeId on ${operationName} request. Use exactly one locator mode.`,
      { fields: ['target', 'nodeId'] },
    );
  }

  if (!hasTarget && !hasNodeId) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} requires a target. Provide either target or nodeId.`,
    );
  }

  if (hasNodeId && typeof input.nodeId !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `nodeId must be a string, got ${typeof input.nodeId}.`, {
      field: 'nodeId',
      value: input.nodeId,
    });
  }
}

function validateRowLocator(input: RowLocatorInput, operationName: string): void {
  validateTableLocator(input, operationName);

  if (input.nodeId != null) {
    if (input.rowIndex == null) {
      throw new DocumentApiValidationError(
        'INVALID_TARGET',
        `${operationName}: rowIndex is required when using nodeId for row operations. ` +
          `Use target to address a row directly, or pass nodeId + rowIndex to address a row within a table.`,
      );
    }
    return;
  }

  if (!isObjectRecord(input.target) || input.target.kind !== 'block') return;

  if (input.target.nodeType === 'table' && input.rowIndex == null) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName}: rowIndex is required when target is a table.`,
    );
  }

  if (input.target.nodeType === 'tableRow' && input.rowIndex != null) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName}: rowIndex must not be provided when target is a row node. ` +
        `Either pass a table target with rowIndex, or pass a row target without rowIndex.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Typed execute helpers
// ---------------------------------------------------------------------------

/**
 * Execute a table operation that uses the standard locator (target/nodeId).
 * Validates the locator and normalizes MutationOptions.
 */
export function executeTableLocatorOp<TInput extends { target?: unknown; nodeId?: unknown }, TResult>(
  operationName: string,
  adapter: (input: TInput, options?: MutationOptions) => TResult,
  input: TInput,
  options?: MutationOptions,
): TResult {
  validateTableLocator(input, operationName);
  return adapter(input, normalizeMutationOptions(options));
}

export function executeRowLocatorOp<TInput extends RowLocatorInput, TResult>(
  operationName: string,
  adapter: (input: TInput, options?: MutationOptions) => TResult,
  input: TInput,
  options?: MutationOptions,
): TResult {
  validateRowLocator(input, operationName);
  return adapter(input, normalizeMutationOptions(options));
}

/**
 * Execute a document-level table mutation (no locator validation needed).
 * Only normalizes MutationOptions.
 */
export function executeDocumentLevelTableOp<TInput, TResult>(
  adapter: (input: TInput, options?: MutationOptions) => TResult,
  input: TInput,
  options?: MutationOptions,
): TResult {
  return adapter(input, normalizeMutationOptions(options));
}
