import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import type {
  PermissionRangesListInput,
  PermissionRangesListResult,
  PermissionRangesGetInput,
  PermissionRangeInfo,
  PermissionRangesCreateInput,
  PermissionRangesRemoveInput,
  PermissionRangesUpdatePrincipalInput,
  PermissionRangeMutationResult,
  PermissionRangeRemoveResult,
  PermissionRangePrincipal,
} from './permission-ranges.types.js';

// ---------------------------------------------------------------------------
// API / Adapter interfaces
// ---------------------------------------------------------------------------

export interface PermissionRangesApi {
  list(input?: PermissionRangesListInput): PermissionRangesListResult;
  get(input: PermissionRangesGetInput): PermissionRangeInfo;
  create(input: PermissionRangesCreateInput, options?: MutationOptions): PermissionRangeMutationResult;
  remove(input: PermissionRangesRemoveInput, options?: MutationOptions): PermissionRangeRemoveResult;
  updatePrincipal(
    input: PermissionRangesUpdatePrincipalInput,
    options?: MutationOptions,
  ): PermissionRangeMutationResult;
}

export type PermissionRangesAdapter = PermissionRangesApi;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validatePrincipal(principal: unknown, operationName: string): asserts principal is PermissionRangePrincipal {
  if (!principal || typeof principal !== 'object') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${operationName} requires a principal object with a 'kind' property.`,
    );
  }

  const p = principal as Record<string, unknown>;
  if (p.kind === 'everyone') return;

  if (p.kind === 'editor') {
    if (typeof p.id !== 'string' || p.id.length === 0) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `${operationName} editor principal requires a non-empty id string.`,
      );
    }
    return;
  }

  throw new DocumentApiValidationError(
    'INVALID_INPUT',
    `${operationName} principal kind must be 'everyone' or 'editor'. Received: '${String(p.kind)}'.`,
  );
}

function requireNonEmptyId(id: unknown, operationName: string): asserts id is string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operationName} requires a non-empty id string.`);
  }
}

// ---------------------------------------------------------------------------
// Execute wrappers
// ---------------------------------------------------------------------------

export function executePermissionRangesList(
  adapter: PermissionRangesAdapter,
  input?: PermissionRangesListInput,
): PermissionRangesListResult {
  return adapter.list(input);
}

export function executePermissionRangesGet(
  adapter: PermissionRangesAdapter,
  input: PermissionRangesGetInput,
): PermissionRangeInfo {
  requireNonEmptyId(input?.id, 'permissionRanges.get');
  return adapter.get(input);
}

export function executePermissionRangesCreate(
  adapter: PermissionRangesAdapter,
  input: PermissionRangesCreateInput,
  options?: MutationOptions,
): PermissionRangeMutationResult {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'permissionRanges.create requires an input object.');
  }

  const { target, principal } = input;
  if (!target || typeof target !== 'object') {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'permissionRanges.create target must be a SelectionTarget object.',
    );
  }
  if (target.kind !== 'selection' || !target.start || !target.end) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      "permissionRanges.create target must have kind 'selection' with start and end points.",
    );
  }

  validatePrincipal(principal, 'permissionRanges.create');

  if (input.id !== undefined) {
    requireNonEmptyId(input.id, 'permissionRanges.create');
  }

  return adapter.create(input, normalizeMutationOptions(options));
}

export function executePermissionRangesRemove(
  adapter: PermissionRangesAdapter,
  input: PermissionRangesRemoveInput,
  options?: MutationOptions,
): PermissionRangeRemoveResult {
  requireNonEmptyId(input?.id, 'permissionRanges.remove');
  return adapter.remove(input, normalizeMutationOptions(options));
}

export function executePermissionRangesUpdatePrincipal(
  adapter: PermissionRangesAdapter,
  input: PermissionRangesUpdatePrincipalInput,
  options?: MutationOptions,
): PermissionRangeMutationResult {
  requireNonEmptyId(input?.id, 'permissionRanges.updatePrincipal');
  validatePrincipal(input?.principal, 'permissionRanges.updatePrincipal');
  return adapter.updatePrincipal(input, normalizeMutationOptions(options));
}
