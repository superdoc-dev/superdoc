import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import type {
  BlocksDeleteInput,
  BlocksDeleteResult,
  BlocksListInput,
  BlocksListResult,
  BlocksDeleteRangeInput,
  BlocksDeleteRangeResult,
} from '../types/blocks.types.js';
import { BLOCK_NODE_TYPES, DELETABLE_BLOCK_NODE_TYPES } from '../types/base.js';
import { DocumentApiValidationError } from '../errors.js';

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export interface BlocksApi {
  list(input?: BlocksListInput): BlocksListResult;
  delete(input: BlocksDeleteInput, options?: MutationOptions): BlocksDeleteResult;
  deleteRange(input: BlocksDeleteRangeInput, options?: MutationOptions): BlocksDeleteRangeResult;
}

export interface BlocksAdapter {
  list(input?: BlocksListInput): BlocksListResult;
  delete(input: BlocksDeleteInput, options?: MutationOptions): BlocksDeleteResult;
  deleteRange(input: BlocksDeleteRangeInput, options?: MutationOptions): BlocksDeleteRangeResult;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const SUPPORTED_DELETE_NODE_TYPES = new Set<string>(DELETABLE_BLOCK_NODE_TYPES);
const REJECTED_DELETE_NODE_TYPES = new Set(['tableRow', 'tableCell']);
const VALID_BLOCK_NODE_TYPES = new Set<string>(BLOCK_NODE_TYPES);

// ---------------------------------------------------------------------------
// blocks.list validation
// ---------------------------------------------------------------------------

function validateBlocksListInput(input?: BlocksListInput): void {
  if (!input) return;

  if (input.offset != null && (typeof input.offset !== 'number' || input.offset < 0)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.list offset must be a non-negative number.', {
      fields: ['offset'],
    });
  }

  if (input.limit != null && (typeof input.limit !== 'number' || input.limit < 1)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.list limit must be a positive number.', {
      fields: ['limit'],
    });
  }

  if (input.nodeTypes != null) {
    if (!Array.isArray(input.nodeTypes) || input.nodeTypes.length === 0) {
      throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.list nodeTypes must be a non-empty array.', {
        fields: ['nodeTypes'],
      });
    }
    for (const nt of input.nodeTypes) {
      if (!VALID_BLOCK_NODE_TYPES.has(nt)) {
        throw new DocumentApiValidationError('INVALID_INPUT', `blocks.list nodeTypes contains unknown type "${nt}".`, {
          fields: ['nodeTypes'],
          nodeType: nt,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// blocks.delete validation
// ---------------------------------------------------------------------------

function validateBlocksDeleteInput(input: BlocksDeleteInput): void {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete requires an input object.', {
      fields: ['input'],
    });
  }

  if (!input.target) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete requires a target.', {
      fields: ['target'],
    });
  }

  if (input.target.kind !== 'block') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete target must have kind "block".', {
      fields: ['target.kind'],
    });
  }

  if (!input.target.nodeId || typeof input.target.nodeId !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.delete target requires a nodeId string.', {
      fields: ['target.nodeId'],
    });
  }

  const { nodeType } = input.target;

  if (REJECTED_DELETE_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `blocks.delete does not support "${nodeType}" targets. Table row/column operations are out of scope.`,
      { fields: ['target.nodeType'], nodeType },
    );
  }

  if (!SUPPORTED_DELETE_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiValidationError('INVALID_TARGET', `blocks.delete does not support "${nodeType}" targets.`, {
      fields: ['target.nodeType'],
      nodeType,
    });
  }
}

// ---------------------------------------------------------------------------
// blocks.deleteRange validation
// ---------------------------------------------------------------------------

function validateBlockNodeAddress(address: unknown, label: string): void {
  if (!address || typeof address !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange requires a ${label} address.`, {
      fields: [label],
    });
  }

  const addr = address as Record<string, unknown>;

  if (addr.kind !== 'block') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange ${label} must have kind "block".`, {
      fields: [`${label}.kind`],
    });
  }

  if (!addr.nodeId || typeof addr.nodeId !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange ${label} requires a nodeId string.`, {
      fields: [`${label}.nodeId`],
    });
  }

  if (!addr.nodeType || typeof addr.nodeType !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', `blocks.deleteRange ${label} requires a nodeType string.`, {
      fields: [`${label}.nodeType`],
    });
  }
}

function validateBlocksDeleteRangeInput(input: BlocksDeleteRangeInput): void {
  if (!input || typeof input !== 'object') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'blocks.deleteRange requires an input object.', {
      fields: ['input'],
    });
  }

  validateBlockNodeAddress(input.start, 'start');
  validateBlockNodeAddress(input.end, 'end');
}

// ---------------------------------------------------------------------------
// Execute functions
// ---------------------------------------------------------------------------

export function executeBlocksList(adapter: BlocksAdapter, input?: BlocksListInput): BlocksListResult {
  validateBlocksListInput(input);
  return adapter.list(input);
}

export function executeBlocksDelete(
  adapter: BlocksAdapter,
  input: BlocksDeleteInput,
  options?: MutationOptions,
): BlocksDeleteResult {
  validateBlocksDeleteInput(input);
  return adapter.delete(input, normalizeMutationOptions(options));
}

export function executeBlocksDeleteRange(
  adapter: BlocksAdapter,
  input: BlocksDeleteRangeInput,
  options?: MutationOptions,
): BlocksDeleteRangeResult {
  validateBlocksDeleteRangeInput(input);
  return adapter.deleteRange(input, normalizeMutationOptions(options));
}
