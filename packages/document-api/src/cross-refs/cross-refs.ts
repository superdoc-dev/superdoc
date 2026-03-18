import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  CrossRefAddress,
  CrossRefGetInput,
  CrossRefInfo,
  CrossRefInsertInput,
  CrossRefRebuildInput,
  CrossRefRemoveInput,
  CrossRefMutationResult,
  CrossRefListInput,
  CrossRefsListResult,
} from './cross-refs.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface CrossRefsApi {
  list(query?: CrossRefListInput): CrossRefsListResult;
  get(input: CrossRefGetInput): CrossRefInfo;
  insert(input: CrossRefInsertInput, options?: MutationOptions): CrossRefMutationResult;
  rebuild(input: CrossRefRebuildInput, options?: MutationOptions): CrossRefMutationResult;
  remove(input: CrossRefRemoveInput, options?: MutationOptions): CrossRefMutationResult;
}

export type CrossRefsAdapter = CrossRefsApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateCrossRefTarget(target: unknown, operationName: string): asserts target is CrossRefAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'inline' || t.nodeType !== 'crossRef') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a CrossRefAddress with kind 'inline' and nodeType 'crossRef'.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeCrossRefsList(adapter: CrossRefsAdapter, query?: CrossRefListInput): CrossRefsListResult {
  return adapter.list(query);
}

export function executeCrossRefsGet(adapter: CrossRefsAdapter, input: CrossRefGetInput): CrossRefInfo {
  validateCrossRefTarget(input.target, 'crossRefs.get');
  return adapter.get(input);
}

export function executeCrossRefsInsert(
  adapter: CrossRefsAdapter,
  input: CrossRefInsertInput,
  options?: MutationOptions,
): CrossRefMutationResult {
  if (!input.target || typeof (input.target as Record<string, unknown>).kind !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'crossRefs.insert requires a valid target.');
  }
  if (!input.display) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'crossRefs.insert requires a display value.');
  }
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeCrossRefsRebuild(
  adapter: CrossRefsAdapter,
  input: CrossRefRebuildInput,
  options?: MutationOptions,
): CrossRefMutationResult {
  validateCrossRefTarget(input.target, 'crossRefs.rebuild');
  return adapter.rebuild(input, normalizeMutationOptions(options));
}

export function executeCrossRefsRemove(
  adapter: CrossRefsAdapter,
  input: CrossRefRemoveInput,
  options?: MutationOptions,
): CrossRefMutationResult {
  validateCrossRefTarget(input.target, 'crossRefs.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}
