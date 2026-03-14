import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  CaptionAddress,
  CaptionListInput,
  CaptionsListResult,
  CaptionGetInput,
  CaptionInfo,
  CaptionInsertInput,
  CaptionUpdateInput,
  CaptionRemoveInput,
  CaptionMutationResult,
  CaptionConfigureInput,
  CaptionConfigResult,
} from './captions.types.js';

// ---------------------------------------------------------------------------
// Adapter / API interfaces
// ---------------------------------------------------------------------------

export interface CaptionsApi {
  list(input?: CaptionListInput): CaptionsListResult;
  get(input: CaptionGetInput): CaptionInfo;
  insert(input: CaptionInsertInput, options?: MutationOptions): CaptionMutationResult;
  update(input: CaptionUpdateInput, options?: MutationOptions): CaptionMutationResult;
  remove(input: CaptionRemoveInput, options?: MutationOptions): CaptionMutationResult;
  configure(input: CaptionConfigureInput, options?: MutationOptions): CaptionConfigResult;
}

export type CaptionsAdapter = CaptionsApi;

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

function validateCaptionTarget(target: unknown, operationName: string): asserts target is CaptionAddress {
  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operationName} requires a target.`);
  }

  const t = target as Record<string, unknown>;
  if (t.kind !== 'block' || t.nodeType !== 'paragraph' || typeof t.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} target must be a CaptionAddress with kind 'block', nodeType 'paragraph', and a string nodeId.`,
      { target },
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeCaptionsList(adapter: CaptionsAdapter, input?: CaptionListInput): CaptionsListResult {
  return adapter.list(input);
}

export function executeCaptionsGet(adapter: CaptionsAdapter, input: CaptionGetInput): CaptionInfo {
  validateCaptionTarget(input.target, 'captions.get');
  return adapter.get(input);
}

export function executeCaptionsInsert(
  adapter: CaptionsAdapter,
  input: CaptionInsertInput,
  options?: MutationOptions,
): CaptionMutationResult {
  if (!input.label || typeof input.label !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'captions.insert requires a non-empty label string.');
  }
  return adapter.insert(input, normalizeMutationOptions(options));
}

export function executeCaptionsUpdate(
  adapter: CaptionsAdapter,
  input: CaptionUpdateInput,
  options?: MutationOptions,
): CaptionMutationResult {
  validateCaptionTarget(input.target, 'captions.update');
  return adapter.update(input, normalizeMutationOptions(options));
}

export function executeCaptionsRemove(
  adapter: CaptionsAdapter,
  input: CaptionRemoveInput,
  options?: MutationOptions,
): CaptionMutationResult {
  validateCaptionTarget(input.target, 'captions.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}

export function executeCaptionsConfigure(
  adapter: CaptionsAdapter,
  input: CaptionConfigureInput,
  options?: MutationOptions,
): CaptionConfigResult {
  if (!input.label || typeof input.label !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'captions.configure requires a non-empty label string.');
  }
  return adapter.configure(input, normalizeMutationOptions(options));
}
