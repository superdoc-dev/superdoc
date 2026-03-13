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
// Locator category helpers — determine which validation to apply per operation
// ---------------------------------------------------------------------------

type TableLocatorInput = { target?: unknown; nodeId?: unknown };
type TableScopedInput = { tableTarget?: unknown; tableNodeId?: unknown };
type RowLocatorInput = TableLocatorInput & TableScopedInput & { rowIndex?: unknown };

/**
 * Operations using the simple table locator (target/nodeId).
 */
const TABLE_LOCATOR_OPS = new Set([
  'tables.delete',
  'tables.clearContents',
  'tables.move',
  'tables.split',
  'tables.convertFromText',
  'tables.convertToText',
  'tables.setLayout',
  'tables.distributeRows',
  'tables.distributeColumns',
  'tables.sort',
  'tables.setAltText',
  'tables.setStyle',
  'tables.clearStyle',
  'tables.setStyleOption',
  'tables.setBorder',
  'tables.clearBorder',
  'tables.applyBorderPreset',
  'tables.setShading',
  'tables.clearShading',
  'tables.setTablePadding',
  'tables.setCellPadding',
  'tables.setCellSpacing',
  'tables.clearCellSpacing',
  'tables.unmergeCells',
  'tables.insertCell',
  'tables.deleteCell',
  'tables.splitCell',
  'tables.setCellProperties',
  'tables.get',
  'tables.getCells',
  'tables.getProperties',
]);

/**
 * Operations using the mixed row locator (direct OR table-scoped).
 */
const ROW_LOCATOR_OPS = new Set([
  'tables.insertRow',
  'tables.deleteRow',
  'tables.setRowHeight',
  'tables.setRowOptions',
]);

/**
 * Operations using a table-scoped column locator (tableTarget/tableNodeId).
 */
const COLUMN_LOCATOR_OPS = new Set(['tables.insertColumn', 'tables.deleteColumn', 'tables.setColumnWidth']);

/**
 * Operations using a merge range locator (tableTarget/tableNodeId).
 */
const MERGE_RANGE_LOCATOR_OPS = new Set(['tables.mergeCells']);

// ---------------------------------------------------------------------------
// Generic execute wrapper
// ---------------------------------------------------------------------------

/**
 * Validates the input locator for a table operation and normalizes MutationOptions.
 *
 * @param operationName - The operation ID (e.g. 'tables.delete')
 * @param adapter - The adapter method to call
 * @param input - The raw input from the caller
 * @param options - Optional mutation options to normalize
 * @returns The adapter return value
 */
export function executeTableOperation<TInput, TResult>(
  operationName: string,
  adapter: (input: TInput, options?: MutationOptions) => TResult,
  input: TInput,
  options?: MutationOptions,
): TResult {
  // Validate locator based on operation category
  if (TABLE_LOCATOR_OPS.has(operationName)) {
    validateTableLocator(input as TableLocatorInput, operationName);
  } else if (ROW_LOCATOR_OPS.has(operationName)) {
    validateRowLocator(input as RowLocatorInput, operationName);
  } else if (COLUMN_LOCATOR_OPS.has(operationName)) {
    validateTableScopedLocator(input as TableScopedInput, operationName);
  } else if (MERGE_RANGE_LOCATOR_OPS.has(operationName)) {
    validateTableScopedLocator(input as TableScopedInput, operationName);
  }

  return adapter(input, normalizeMutationOptions(options));
}
