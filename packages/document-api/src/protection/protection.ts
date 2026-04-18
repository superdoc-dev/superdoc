import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  DocumentProtectionState,
  ProtectionGetInput,
  SetEditingRestrictionInput,
  ClearEditingRestrictionInput,
  ProtectionMutationResult,
} from './protection.types.js';

// ---------------------------------------------------------------------------
// API / Adapter interfaces
// ---------------------------------------------------------------------------

export interface ProtectionApi {
  get(input?: ProtectionGetInput): DocumentProtectionState;
  setEditingRestriction(input: SetEditingRestrictionInput, options?: MutationOptions): ProtectionMutationResult;
  clearEditingRestriction(input?: ClearEditingRestrictionInput, options?: MutationOptions): ProtectionMutationResult;
}

export type ProtectionAdapter = ProtectionApi;

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const VALID_SET_MODES = new Set(['readOnly'] as const);

function validateSetEditingRestrictionInput(input: unknown): asserts input is SetEditingRestrictionInput {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'protection.setEditingRestriction requires an object with a mode property.',
    );
  }

  const { mode } = input as Record<string, unknown>;
  if (!VALID_SET_MODES.has(mode as 'readOnly')) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `protection.setEditingRestriction mode must be 'readOnly'. Received: '${String(mode)}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executeProtectionGet(adapter: ProtectionAdapter, _input?: ProtectionGetInput): DocumentProtectionState {
  return adapter.get();
}

export function executeSetEditingRestriction(
  adapter: ProtectionAdapter,
  input: SetEditingRestrictionInput,
  options?: MutationOptions,
): ProtectionMutationResult {
  validateSetEditingRestrictionInput(input);
  return adapter.setEditingRestriction(input, normalizeMutationOptions(options));
}

export function executeClearEditingRestriction(
  adapter: ProtectionAdapter,
  _input?: ClearEditingRestrictionInput,
  options?: MutationOptions,
): ProtectionMutationResult {
  return adapter.clearEditingRestriction(undefined, normalizeMutationOptions(options));
}
