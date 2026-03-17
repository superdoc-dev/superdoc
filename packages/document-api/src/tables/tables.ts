import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';

// ---------------------------------------------------------------------------
// Locator validation
// ---------------------------------------------------------------------------

/**
 * Validates that a table locator has exactly one of `target` or `nodeId`.
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

/**
 * Validates a table-scoped locator has exactly one of `tableTarget` or `tableNodeId`.
 */
function validateTableScopedLocator(
  input: { tableTarget?: unknown; tableNodeId?: unknown },
  operationName: string,
): void {
  const hasTarget = input.tableTarget !== undefined;
  const hasNodeId = input.tableNodeId !== undefined;

  if (hasTarget && hasNodeId) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `Cannot combine tableTarget with tableNodeId on ${operationName} request. Use exactly one locator mode.`,
      { fields: ['tableTarget', 'tableNodeId'] },
    );
  }

  if (!hasTarget && !hasNodeId) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} requires a table target. Provide either tableTarget or tableNodeId.`,
    );
  }

  if (hasNodeId && typeof input.tableNodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `tableNodeId must be a string, got ${typeof input.tableNodeId}.`,
      { field: 'tableNodeId', value: input.tableNodeId },
    );
  }
}

/**
 * Validates a mixed row locator: exactly one of direct (target/nodeId) OR
 * table-scoped (tableTarget/tableNodeId + rowIndex) modes.
 */
function validateRowLocator(
  input: { target?: unknown; nodeId?: unknown; tableTarget?: unknown; tableNodeId?: unknown; rowIndex?: unknown },
  operationName: string,
): void {
  const hasDirect = input.target !== undefined || input.nodeId !== undefined;
  const hasTableScoped = input.tableTarget !== undefined || input.tableNodeId !== undefined;

  if (hasDirect && hasTableScoped) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `Cannot combine direct row locator (target/nodeId) with table-scoped locator (tableTarget/tableNodeId) on ${operationName} request.`,
    );
  }

  if (hasDirect) {
    validateTableLocator(input, operationName);
  } else if (hasTableScoped) {
    validateTableScopedLocator(input, operationName);
  } else {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} requires a row target. Provide target, nodeId, or tableTarget/tableNodeId + rowIndex.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Typed execute helpers — one per locator category
// ---------------------------------------------------------------------------

/**
 * Execute a table operation that uses the simple table locator (target/nodeId).
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

/**
 * Execute a table operation that uses the mixed row locator
 * (direct target/nodeId OR table-scoped tableTarget/tableNodeId + rowIndex).
 * Validates the locator and normalizes MutationOptions.
 */
export function executeRowLocatorOp<
  TInput extends {
    target?: unknown;
    nodeId?: unknown;
    tableTarget?: unknown;
    tableNodeId?: unknown;
    rowIndex?: unknown;
  },
  TResult,
>(
  operationName: string,
  adapter: (input: TInput, options?: MutationOptions) => TResult,
  input: TInput,
  options?: MutationOptions,
): TResult {
  validateRowLocator(input, operationName);
  return adapter(input, normalizeMutationOptions(options));
}

/**
 * Execute a table operation that uses a table-scoped column locator
 * (tableTarget/tableNodeId). Validates the locator and normalizes MutationOptions.
 */
export function executeColumnLocatorOp<TInput extends { tableTarget?: unknown; tableNodeId?: unknown }, TResult>(
  operationName: string,
  adapter: (input: TInput, options?: MutationOptions) => TResult,
  input: TInput,
  options?: MutationOptions,
): TResult {
  validateTableScopedLocator(input, operationName);
  return adapter(input, normalizeMutationOptions(options));
}

/**
 * Execute a table operation that uses a merge-range locator
 * (tableTarget/tableNodeId). Validates the locator and normalizes MutationOptions.
 */
export function executeMergeRangeLocatorOp<TInput extends { tableTarget?: unknown; tableNodeId?: unknown }, TResult>(
  operationName: string,
  adapter: (input: TInput, options?: MutationOptions) => TResult,
  input: TInput,
  options?: MutationOptions,
): TResult {
  validateTableScopedLocator(input, operationName);
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
