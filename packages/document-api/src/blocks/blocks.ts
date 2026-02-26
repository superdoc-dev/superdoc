import type { MutationOptions } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import type { BlocksDeleteInput, BlocksDeleteResult } from '../types/blocks.types.js';
import { DELETABLE_BLOCK_NODE_TYPES } from '../types/base.js';
import { DocumentApiValidationError } from '../errors.js';

export interface BlocksApi {
  delete(input: BlocksDeleteInput, options?: MutationOptions): BlocksDeleteResult;
}

export type BlocksAdapter = BlocksApi;

/** Block node types supported by blocks.delete — derived from the shared constant. */
const SUPPORTED_DELETE_NODE_TYPES = new Set<string>(DELETABLE_BLOCK_NODE_TYPES);

/** Block node types explicitly rejected (row/column semantics out of scope). */
const REJECTED_DELETE_NODE_TYPES = new Set(['tableRow', 'tableCell']);

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

export function executeBlocksDelete(
  adapter: BlocksAdapter,
  input: BlocksDeleteInput,
  options?: MutationOptions,
): BlocksDeleteResult {
  validateBlocksDeleteInput(input);
  return adapter.delete(input, normalizeMutationOptions(options));
}
