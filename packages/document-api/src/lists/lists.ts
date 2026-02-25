import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  ListInsertInput,
  ListSetTypeInput,
  ListsExitResult,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  ListItemInfo,
} from './lists.types.js';
export type {
  ListInsertInput,
  ListSetTypeInput,
  ListsExitResult,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  ListItemInfo,
} from './lists.types.js';

/**
 * Validates that a list operation input has exactly one target locator mode:
 * either `target` (canonical ListItemAddress) or `nodeId` (shorthand).
 */
function validateListTarget(input: { target?: unknown; nodeId?: unknown }, operationName: string): void {
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

export interface ListsAdapter {
  /** List items matching the given query. */
  list(query?: ListsListQuery): ListsListResult;
  /** Retrieve full information for a single list item. */
  get(input: ListsGetInput): ListItemInfo;
  /** Insert a new list item relative to the target. */
  insert(input: ListInsertInput, options?: MutationOptions): ListsInsertResult;
  /** Change the list kind (ordered/bullet) for the target item. */
  setType(input: ListSetTypeInput, options?: MutationOptions): ListsMutateItemResult;
  /** Increase the nesting level of the target item. */
  indent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult;
  /** Decrease the nesting level of the target item. */
  outdent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult;
  /** Restart numbering at the target item. */
  restart(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult;
  /** Exit the list, converting the target item to a plain paragraph. */
  exit(input: ListTargetInput, options?: MutationOptions): ListsExitResult;
}

export type ListsApi = ListsAdapter;

export function executeListsList(adapter: ListsAdapter, query?: ListsListQuery): ListsListResult {
  return adapter.list(query);
}

export function executeListsGet(adapter: ListsAdapter, input: ListsGetInput): ListItemInfo {
  return adapter.get(input);
}

export function executeListsInsert(
  adapter: ListsAdapter,
  input: ListInsertInput,
  options?: MutationOptions,
): ListsInsertResult {
  validateListTarget(input, 'lists.insert');
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeListsSetType(
  adapter: ListsAdapter,
  input: ListSetTypeInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setType');
  return adapter.setType(input, normalizeMutationOptions(options));
}

export function executeListsIndent(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.indent');
  return adapter.indent(input, normalizeMutationOptions(options));
}

export function executeListsOutdent(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.outdent');
  return adapter.outdent(input, normalizeMutationOptions(options));
}

export function executeListsRestart(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.restart');
  return adapter.restart(input, normalizeMutationOptions(options));
}

export function executeListsExit(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsExitResult {
  validateListTarget(input, 'lists.exit');
  return adapter.exit(input, normalizeMutationOptions(options));
}
