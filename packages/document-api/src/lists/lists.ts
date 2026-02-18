import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
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
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeListsSetType(
  adapter: ListsAdapter,
  input: ListSetTypeInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return adapter.setType(input, normalizeMutationOptions(options));
}

export function executeListsIndent(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return adapter.indent(input, normalizeMutationOptions(options));
}

export function executeListsOutdent(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return adapter.outdent(input, normalizeMutationOptions(options));
}

export function executeListsRestart(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return adapter.restart(input, normalizeMutationOptions(options));
}

export function executeListsExit(
  adapter: ListsAdapter,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsExitResult {
  return adapter.exit(input, normalizeMutationOptions(options));
}
