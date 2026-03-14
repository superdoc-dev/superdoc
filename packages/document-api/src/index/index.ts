import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  IndexAddress,
  IndexEntryAddress,
  IndexListInput,
  IndexListResult,
  IndexGetInput,
  IndexInfo,
  IndexInsertInput,
  IndexConfigureInput,
  IndexRebuildInput,
  IndexRemoveInput,
  IndexMutationResult,
  IndexEntryListInput,
  IndexEntryListResult,
  IndexEntryGetInput,
  IndexEntryInfo,
  IndexEntryInsertInput,
  IndexEntryUpdateInput,
  IndexEntryRemoveInput,
  IndexEntryMutationResult,
} from './index.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface IndexApi {
  list(input?: IndexListInput): IndexListResult;
  get(input: IndexGetInput): IndexInfo;
  insert(input: IndexInsertInput, options?: MutationOptions): IndexMutationResult;
  configure(input: IndexConfigureInput, options?: MutationOptions): IndexMutationResult;
  rebuild(input: IndexRebuildInput, options?: MutationOptions): IndexMutationResult;
  remove(input: IndexRemoveInput, options?: MutationOptions): IndexMutationResult;
  entries: {
    list(input?: IndexEntryListInput): IndexEntryListResult;
    get(input: IndexEntryGetInput): IndexEntryInfo;
    insert(input: IndexEntryInsertInput, options?: MutationOptions): IndexEntryMutationResult;
    update(input: IndexEntryUpdateInput, options?: MutationOptions): IndexEntryMutationResult;
    remove(input: IndexEntryRemoveInput, options?: MutationOptions): IndexEntryMutationResult;
  };
}

export type IndexAdapter = IndexApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateIndexTarget(target: unknown, operationName: string): asserts target is IndexAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'block' || t.nodeType !== 'index' || typeof t.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be an IndexAddress with kind 'block', nodeType 'index', and a string nodeId.`,
      { target },
    );
  }
}

function validateIndexEntryTarget(target: unknown, operationName: string): asserts target is IndexEntryAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'inline' || t.nodeType !== 'indexEntry') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be an IndexEntryAddress with kind 'inline', nodeType 'indexEntry', and an anchor with start/end.`,
      { target },
    );
  }

  const anchor = t.anchor as Record<string, unknown> | undefined;
  if (!anchor || typeof anchor.start !== 'object' || typeof anchor.end !== 'object') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target.anchor must have start and end positions.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers — INDEX lifecycle
// ---------------------------------------------------------------------------

export function executeIndexList(adapter: IndexAdapter, input?: IndexListInput): IndexListResult {
  return adapter.list(input);
}

export function executeIndexGet(adapter: IndexAdapter, input: IndexGetInput): IndexInfo {
  validateIndexTarget(input.target, 'index.get');
  return adapter.get(input);
}

export function executeIndexInsert(
  adapter: IndexAdapter,
  input: IndexInsertInput,
  options?: MutationOptions,
): IndexMutationResult {
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeIndexConfigure(
  adapter: IndexAdapter,
  input: IndexConfigureInput,
  options?: MutationOptions,
): IndexMutationResult {
  validateIndexTarget(input.target, 'index.configure');
  return adapter.configure(input, normalizeMutationOptions(options));
}

export function executeIndexRebuild(
  adapter: IndexAdapter,
  input: IndexRebuildInput,
  options?: MutationOptions,
): IndexMutationResult {
  validateIndexTarget(input.target, 'index.rebuild');
  return adapter.rebuild(input, normalizeMutationOptions(options));
}

export function executeIndexRemove(
  adapter: IndexAdapter,
  input: IndexRemoveInput,
  options?: MutationOptions,
): IndexMutationResult {
  validateIndexTarget(input.target, 'index.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — XE entry operations
// ---------------------------------------------------------------------------

export function executeIndexEntryList(adapter: IndexAdapter, input?: IndexEntryListInput): IndexEntryListResult {
  return adapter.entries.list(input);
}

export function executeIndexEntryGet(adapter: IndexAdapter, input: IndexEntryGetInput): IndexEntryInfo {
  validateIndexEntryTarget(input.target, 'index.entries.get');
  return adapter.entries.get(input);
}

export function executeIndexEntryInsert(
  adapter: IndexAdapter,
  input: IndexEntryInsertInput,
  options?: MutationOptions,
): IndexEntryMutationResult {
  if (!input.entry || typeof input.entry.text !== 'string' || !input.entry.text) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'index.entries.insert requires a non-empty entry.text string.',
    );
  }
  return adapter.entries.insert(input, normalizeMutationOptions(options));
}

export function executeIndexEntryUpdate(
  adapter: IndexAdapter,
  input: IndexEntryUpdateInput,
  options?: MutationOptions,
): IndexEntryMutationResult {
  validateIndexEntryTarget(input.target, 'index.entries.update');
  return adapter.entries.update(input, normalizeMutationOptions(options));
}

export function executeIndexEntryRemove(
  adapter: IndexAdapter,
  input: IndexEntryRemoveInput,
  options?: MutationOptions,
): IndexEntryMutationResult {
  validateIndexEntryTarget(input.target, 'index.entries.remove');
  return adapter.entries.remove(input, normalizeMutationOptions(options));
}
