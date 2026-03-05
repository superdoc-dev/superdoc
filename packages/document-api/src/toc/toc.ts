import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  TocAddress,
  TocGetInput,
  TocInfo,
  TocConfigureInput,
  TocUpdateInput,
  TocRemoveInput,
  TocMutationResult,
  TocListQuery,
  TocListResult,
  TocEntryAddress,
  TocMarkEntryInput,
  TocUnmarkEntryInput,
  TocListEntriesQuery,
  TocListEntriesResult,
  TocGetEntryInput,
  TocEntryInfo,
  TocEditEntryInput,
  TocEntryMutationResult,
} from './toc.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface TocApi {
  list(query?: TocListQuery): TocListResult;
  get(input: TocGetInput): TocInfo;
  configure(input: TocConfigureInput, options?: MutationOptions): TocMutationResult;
  update(input: TocUpdateInput, options?: MutationOptions): TocMutationResult;
  remove(input: TocRemoveInput, options?: MutationOptions): TocMutationResult;
  markEntry(input: TocMarkEntryInput, options?: MutationOptions): TocEntryMutationResult;
  unmarkEntry(input: TocUnmarkEntryInput, options?: MutationOptions): TocEntryMutationResult;
  listEntries(query?: TocListEntriesQuery): TocListEntriesResult;
  getEntry(input: TocGetEntryInput): TocEntryInfo;
  editEntry(input: TocEditEntryInput, options?: MutationOptions): TocEntryMutationResult;
}

export type TocAdapter = TocApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateTocTarget(target: unknown, operationName: string): asserts target is TocAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'block' || t.nodeType !== 'tableOfContents' || typeof t.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a TocAddress with kind 'block', nodeType 'tableOfContents', and a string nodeId.`,
      { target },
    );
  }
}

function validateTocEntryTarget(target: unknown, operationName: string): asserts target is TocEntryAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'inline' || t.nodeType !== 'tableOfContentsEntry' || typeof t.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a TocEntryAddress with kind 'inline', nodeType 'tableOfContentsEntry', and a string nodeId.`,
      { target },
    );
  }
}

function validateInsertionTarget(target: unknown, operationName: string): void {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'inline-insert') {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} target must have kind 'inline-insert'.`, {
      target,
    });
  }

  const anchor = t.anchor as Record<string, unknown> | undefined;
  if (!anchor || anchor.nodeType !== 'paragraph' || typeof anchor.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target.anchor must have nodeType 'paragraph' and a string nodeId.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers — TOC lifecycle
// ---------------------------------------------------------------------------

export function executeTocList(adapter: TocAdapter, query?: TocListQuery): TocListResult {
  return adapter.list(query);
}

export function executeTocGet(adapter: TocAdapter, input: TocGetInput): TocInfo {
  validateTocTarget(input.target, 'toc.get');
  return adapter.get(input);
}

export function executeTocConfigure(
  adapter: TocAdapter,
  input: TocConfigureInput,
  options?: MutationOptions,
): TocMutationResult {
  validateTocTarget(input.target, 'toc.configure');
  return adapter.configure(input, normalizeMutationOptions(options));
}

export function executeTocUpdate(
  adapter: TocAdapter,
  input: TocUpdateInput,
  options?: MutationOptions,
): TocMutationResult {
  validateTocTarget(input.target, 'toc.update');
  return adapter.update(input, normalizeMutationOptions(options));
}

export function executeTocRemove(
  adapter: TocAdapter,
  input: TocRemoveInput,
  options?: MutationOptions,
): TocMutationResult {
  validateTocTarget(input.target, 'toc.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Execute wrappers — TC entry operations
// ---------------------------------------------------------------------------

export function executeTocMarkEntry(
  adapter: TocAdapter,
  input: TocMarkEntryInput,
  options?: MutationOptions,
): TocEntryMutationResult {
  validateInsertionTarget(input.target, 'toc.markEntry');
  if (!input.text || typeof input.text !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'toc.markEntry requires a non-empty text string.');
  }
  return adapter.markEntry(input, normalizeMutationOptions(options));
}

export function executeTocUnmarkEntry(
  adapter: TocAdapter,
  input: TocUnmarkEntryInput,
  options?: MutationOptions,
): TocEntryMutationResult {
  validateTocEntryTarget(input.target, 'toc.unmarkEntry');
  return adapter.unmarkEntry(input, normalizeMutationOptions(options));
}

export function executeTocListEntries(adapter: TocAdapter, query?: TocListEntriesQuery): TocListEntriesResult {
  return adapter.listEntries(query);
}

export function executeTocGetEntry(adapter: TocAdapter, input: TocGetEntryInput): TocEntryInfo {
  validateTocEntryTarget(input.target, 'toc.getEntry');
  return adapter.getEntry(input);
}

export function executeTocEditEntry(
  adapter: TocAdapter,
  input: TocEditEntryInput,
  options?: MutationOptions,
): TocEntryMutationResult {
  validateTocEntryTarget(input.target, 'toc.editEntry');
  return adapter.editEntry(input, normalizeMutationOptions(options));
}
