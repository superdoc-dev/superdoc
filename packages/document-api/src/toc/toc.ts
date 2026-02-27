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
}

export type TocAdapter = TocApi;

// ---------------------------------------------------------------------------
// Target validation (target-only — no nodeId fallback)
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

// ---------------------------------------------------------------------------
// Execute wrappers
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
