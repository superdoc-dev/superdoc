import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';
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
// Shared input guard
// ---------------------------------------------------------------------------

function validateTocInput(input: unknown, operationName: string): asserts input is Record<string, unknown> {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} input must be a non-null object.`);
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers — TOC lifecycle
// ---------------------------------------------------------------------------

export function executeTocList(adapter: TocAdapter, query?: TocListQuery): TocListResult {
  return adapter.list(query);
}

export function executeTocGet(adapter: TocAdapter, input: TocGetInput): TocInfo {
  validateTocInput(input, 'toc.get');
  validateTocTarget(input.target, 'toc.get');
  return adapter.get(input);
}

export function executeTocConfigure(
  adapter: TocAdapter,
  input: TocConfigureInput,
  options?: MutationOptions,
): TocMutationResult {
  validateTocInput(input, 'toc.configure');
  validateTocTarget(input.target, 'toc.configure');
  return adapter.configure(input, normalizeMutationOptions(options));
}

const VALID_TOC_UPDATE_MODES: ReadonlySet<string> = new Set(['all', 'pageNumbers']);

export function executeTocUpdate(
  adapter: TocAdapter,
  input: TocUpdateInput,
  options?: MutationOptions,
): TocMutationResult {
  validateTocInput(input, 'toc.update');
  validateTocTarget(input.target, 'toc.update');
  if (input.mode !== undefined && !VALID_TOC_UPDATE_MODES.has(input.mode)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `toc.update mode must be "all" or "pageNumbers", got "${String(input.mode)}".`,
      { field: 'mode', value: input.mode },
    );
  }
  return adapter.update(input, normalizeMutationOptions(options));
}

export function executeTocRemove(
  adapter: TocAdapter,
  input: TocRemoveInput,
  options?: MutationOptions,
): TocMutationResult {
  validateTocInput(input, 'toc.remove');
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
  validateTocInput(input, 'toc.markEntry');
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
  validateTocInput(input, 'toc.unmarkEntry');
  validateTocEntryTarget(input.target, 'toc.unmarkEntry');
  return adapter.unmarkEntry(input, normalizeMutationOptions(options));
}

export function executeTocListEntries(adapter: TocAdapter, query?: TocListEntriesQuery): TocListEntriesResult {
  return adapter.listEntries(query);
}

export function executeTocGetEntry(adapter: TocAdapter, input: TocGetEntryInput): TocEntryInfo {
  validateTocInput(input, 'toc.getEntry');
  validateTocEntryTarget(input.target, 'toc.getEntry');
  return adapter.getEntry(input);
}

const EDIT_ENTRY_PATCH_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'text',
  'level',
  'tableIdentifier',
  'omitPageNumber',
]);

function validateTocEditEntryPatch(patch: unknown, operationName: string): void {
  if (!isRecord(patch)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} patch must be a non-null object.`, {
      field: 'patch',
      value: patch,
    });
  }
  for (const key of Object.keys(patch)) {
    if (!EDIT_ENTRY_PATCH_ALLOWED_KEYS.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown field "${key}" on ${operationName} patch. Allowed fields: ${[...EDIT_ENTRY_PATCH_ALLOWED_KEYS].join(', ')}.`,
        { field: `patch.${key}` },
      );
    }
  }
  if (patch.text !== undefined && typeof patch.text !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} patch.text must be a string.`, {
      field: 'patch.text',
      value: patch.text,
    });
  }
  if (patch.level !== undefined) {
    if (typeof patch.level !== 'number' || !Number.isInteger(patch.level) || (patch.level as number) < 1) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `${operationName} patch.level must be a positive integer.`,
        { field: 'patch.level', value: patch.level },
      );
    }
  }
  if (patch.tableIdentifier !== undefined && typeof patch.tableIdentifier !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} patch.tableIdentifier must be a string.`, {
      field: 'patch.tableIdentifier',
      value: patch.tableIdentifier,
    });
  }
  if (patch.omitPageNumber !== undefined && typeof patch.omitPageNumber !== 'boolean') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} patch.omitPageNumber must be a boolean.`, {
      field: 'patch.omitPageNumber',
      value: patch.omitPageNumber,
    });
  }
}

export function executeTocEditEntry(
  adapter: TocAdapter,
  input: TocEditEntryInput,
  options?: MutationOptions,
): TocEntryMutationResult {
  validateTocInput(input, 'toc.editEntry');
  validateTocEntryTarget(input.target, 'toc.editEntry');
  validateTocEditEntryPatch(input.patch, 'toc.editEntry');
  return adapter.editEntry(input, normalizeMutationOptions(options));
}
