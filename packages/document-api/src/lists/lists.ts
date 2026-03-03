import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  ListInsertInput,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  ListItemInfo,
  ListsCreateInput,
  ListsCreateResult,
  ListsAttachInput,
  ListsDetachInput,
  ListsDetachResult,
  ListsJoinInput,
  ListsJoinResult,
  ListsCanJoinInput,
  ListsCanJoinResult,
  ListsSeparateInput,
  ListsSeparateResult,
  ListsSetLevelInput,
  ListsSetValueInput,
  ListsContinuePreviousInput,
  ListsCanContinuePreviousInput,
  ListsCanContinuePreviousResult,
  ListsSetLevelRestartInput,
  ListsConvertToTextInput,
  ListsConvertToTextResult,
} from './lists.types.js';

export type {
  ListInsertInput,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  ListItemInfo,
  ListsCreateInput,
  ListsCreateResult,
  ListsAttachInput,
  ListsDetachInput,
  ListsDetachResult,
  ListsJoinInput,
  ListsJoinResult,
  ListsCanJoinInput,
  ListsCanJoinResult,
  ListsSeparateInput,
  ListsSeparateResult,
  ListsSetLevelInput,
  ListsSetValueInput,
  ListsContinuePreviousInput,
  ListsCanContinuePreviousInput,
  ListsCanContinuePreviousResult,
  ListsSetLevelRestartInput,
  ListsConvertToTextInput,
  ListsConvertToTextResult,
} from './lists.types.js';

/**
 * Validates that a list operation input has a target locator.
 */
function validateListTarget(input: { target?: unknown }, operationName: string): void {
  if (input.target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ListsAdapter {
  // Discovery
  list(query?: ListsListQuery): ListsListResult;
  get(input: ListsGetInput): ListItemInfo;

  // Kept operations
  insert(input: ListInsertInput, options?: MutationOptions): ListsInsertResult;
  indent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult;
  outdent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult;

  // SD-1272 new operations
  create(input: ListsCreateInput, options?: MutationOptions): ListsCreateResult;
  attach(input: ListsAttachInput, options?: MutationOptions): ListsMutateItemResult;
  detach(input: ListsDetachInput, options?: MutationOptions): ListsDetachResult;
  join(input: ListsJoinInput, options?: MutationOptions): ListsJoinResult;
  canJoin(input: ListsCanJoinInput): ListsCanJoinResult;
  separate(input: ListsSeparateInput, options?: MutationOptions): ListsSeparateResult;
  setLevel(input: ListsSetLevelInput, options?: MutationOptions): ListsMutateItemResult;
  setValue(input: ListsSetValueInput, options?: MutationOptions): ListsMutateItemResult;
  continuePrevious(input: ListsContinuePreviousInput, options?: MutationOptions): ListsMutateItemResult;
  canContinuePrevious(input: ListsCanContinuePreviousInput): ListsCanContinuePreviousResult;
  setLevelRestart(input: ListsSetLevelRestartInput, options?: MutationOptions): ListsMutateItemResult;
  convertToText(input: ListsConvertToTextInput, options?: MutationOptions): ListsConvertToTextResult;
}

export type ListsApi = ListsAdapter;

// ---------------------------------------------------------------------------
// Execute wrappers — discovery
// ---------------------------------------------------------------------------

export function executeListsList(adapter: ListsAdapter, query?: ListsListQuery): ListsListResult {
  return adapter.list(query);
}

export function executeListsGet(adapter: ListsAdapter, input: ListsGetInput): ListItemInfo {
  return adapter.get(input);
}

// ---------------------------------------------------------------------------
// Execute wrappers — kept operations
// ---------------------------------------------------------------------------

export function executeListsInsert(
  adapter: ListsAdapter,
  input: ListInsertInput,
  options?: MutationOptions,
): ListsInsertResult {
  validateListTarget(input, 'lists.insert');
  return adapter.insert(input, normalizeMutationOptions(options));
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

// ---------------------------------------------------------------------------
// Execute wrappers — SD-1272 new operations
// ---------------------------------------------------------------------------

export function executeListsCreate(
  adapter: ListsAdapter,
  input: ListsCreateInput,
  options?: MutationOptions,
): ListsCreateResult {
  return adapter.create(input, normalizeMutationOptions(options));
}

export function executeListsAttach(
  adapter: ListsAdapter,
  input: ListsAttachInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.attach');
  return adapter.attach(input, normalizeMutationOptions(options));
}

export function executeListsDetach(
  adapter: ListsAdapter,
  input: ListsDetachInput,
  options?: MutationOptions,
): ListsDetachResult {
  validateListTarget(input, 'lists.detach');
  return adapter.detach(input, normalizeMutationOptions(options));
}

export function executeListsJoin(
  adapter: ListsAdapter,
  input: ListsJoinInput,
  options?: MutationOptions,
): ListsJoinResult {
  validateListTarget(input, 'lists.join');
  return adapter.join(input, normalizeMutationOptions(options));
}

export function executeListsCanJoin(adapter: ListsAdapter, input: ListsCanJoinInput): ListsCanJoinResult {
  validateListTarget(input, 'lists.canJoin');
  return adapter.canJoin(input);
}

export function executeListsSeparate(
  adapter: ListsAdapter,
  input: ListsSeparateInput,
  options?: MutationOptions,
): ListsSeparateResult {
  validateListTarget(input, 'lists.separate');
  return adapter.separate(input, normalizeMutationOptions(options));
}

export function executeListsSetLevel(
  adapter: ListsAdapter,
  input: ListsSetLevelInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevel');
  return adapter.setLevel(input, normalizeMutationOptions(options));
}

export function executeListsSetValue(
  adapter: ListsAdapter,
  input: ListsSetValueInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setValue');
  return adapter.setValue(input, normalizeMutationOptions(options));
}

export function executeListsContinuePrevious(
  adapter: ListsAdapter,
  input: ListsContinuePreviousInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.continuePrevious');
  return adapter.continuePrevious(input, normalizeMutationOptions(options));
}

export function executeListsCanContinuePrevious(
  adapter: ListsAdapter,
  input: ListsCanContinuePreviousInput,
): ListsCanContinuePreviousResult {
  validateListTarget(input, 'lists.canContinuePrevious');
  return adapter.canContinuePrevious(input);
}

export function executeListsSetLevelRestart(
  adapter: ListsAdapter,
  input: ListsSetLevelRestartInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  validateListTarget(input, 'lists.setLevelRestart');
  return adapter.setLevelRestart(input, normalizeMutationOptions(options));
}

export function executeListsConvertToText(
  adapter: ListsAdapter,
  input: ListsConvertToTextInput,
  options?: MutationOptions,
): ListsConvertToTextResult {
  validateListTarget(input, 'lists.convertToText');
  return adapter.convertToText(input, normalizeMutationOptions(options));
}
