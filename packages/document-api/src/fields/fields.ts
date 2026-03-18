import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  FieldAddress,
  FieldGetInput,
  FieldInfo,
  FieldInsertInput,
  FieldRebuildInput,
  FieldRemoveInput,
  FieldMutationResult,
  FieldListInput,
  FieldsListResult,
} from './fields.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface FieldsApi {
  list(query?: FieldListInput): FieldsListResult;
  get(input: FieldGetInput): FieldInfo;
  insert(input: FieldInsertInput, options?: MutationOptions): FieldMutationResult;
  rebuild(input: FieldRebuildInput, options?: MutationOptions): FieldMutationResult;
  remove(input: FieldRemoveInput, options?: MutationOptions): FieldMutationResult;
}

export type FieldsAdapter = FieldsApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateFieldTarget(target: unknown, operationName: string): asserts target is FieldAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'field' || typeof t.blockId !== 'string' || typeof t.occurrenceIndex !== 'number') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a FieldAddress with kind 'field', string blockId, and numeric occurrenceIndex.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeFieldsList(adapter: FieldsAdapter, query?: FieldListInput): FieldsListResult {
  return adapter.list(query);
}

export function executeFieldsGet(adapter: FieldsAdapter, input: FieldGetInput): FieldInfo {
  validateFieldTarget(input.target, 'fields.get');
  return adapter.get(input);
}

export function executeFieldsInsert(
  adapter: FieldsAdapter,
  input: FieldInsertInput,
  options?: MutationOptions,
): FieldMutationResult {
  if (input.mode !== 'raw') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      "fields.insert requires mode: 'raw'. Raw field manipulation can break document validity.",
    );
  }
  if (!input.instruction || typeof input.instruction !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'fields.insert requires a non-empty instruction string.');
  }
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeFieldsRebuild(
  adapter: FieldsAdapter,
  input: FieldRebuildInput,
  options?: MutationOptions,
): FieldMutationResult {
  validateFieldTarget(input.target, 'fields.rebuild');
  return adapter.rebuild(input, normalizeMutationOptions(options));
}

export function executeFieldsRemove(
  adapter: FieldsAdapter,
  input: FieldRemoveInput,
  options?: MutationOptions,
): FieldMutationResult {
  if (input.mode !== 'raw') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      "fields.remove requires mode: 'raw'. Raw field manipulation can break document validity.",
    );
  }
  validateFieldTarget(input.target, 'fields.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}
