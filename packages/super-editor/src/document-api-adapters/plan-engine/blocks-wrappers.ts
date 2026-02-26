/**
 * Blocks convenience wrappers — bridge blocks.delete to the plan engine's
 * execution path via the deleteBlockNodeById editor command.
 *
 * Follows the same domain-command wrapper pattern as create-wrappers.ts
 * and lists-wrappers.ts.
 */

import type { Editor } from '../../core/Editor.js';
import {
  DELETABLE_BLOCK_NODE_TYPES,
  type BlocksDeleteInput,
  type BlocksDeleteResult,
  type MutationOptions,
} from '@superdoc/document-api';
import { clearIndexCache, getBlockIndex } from '../helpers/index-cache.js';
import { findBlockByIdStrict } from '../helpers/node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';

// ---------------------------------------------------------------------------
// Command types (internal to the wrapper)
// ---------------------------------------------------------------------------

type DeleteBlockNodeByIdCommand = (id: string) => boolean;

// ---------------------------------------------------------------------------
// Supported block types for deletion
// ---------------------------------------------------------------------------

const SUPPORTED_NODE_TYPES = new Set<string>(DELETABLE_BLOCK_NODE_TYPES);

const REJECTED_NODE_TYPES = new Set(['tableRow', 'tableCell']);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateTargetNodeType(nodeType: string): void {
  if (REJECTED_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `blocks.delete does not support "${nodeType}" targets. Table row/column operations are out of scope.`,
      { nodeType },
    );
  }

  if (!SUPPORTED_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiAdapterError('INVALID_TARGET', `blocks.delete does not support "${nodeType}" targets.`, {
      nodeType,
    });
  }
}

function resolveSdBlockId(candidate: { node: { attrs?: Record<string, unknown> } }): string {
  const sdBlockId = candidate.node.attrs?.sdBlockId;
  if (typeof sdBlockId === 'string' && sdBlockId.length > 0) return sdBlockId;

  throw new DocumentApiAdapterError(
    'INTERNAL_ERROR',
    'Resolved block candidate is missing sdBlockId attribute. This indicates a schema/extension invariant violation.',
    { attrs: candidate.node.attrs },
  );
}

function validateCommandLayerUniqueness(editor: Editor, sdBlockId: string): void {
  const getBlockNodeById = editor.helpers?.blockNode?.getBlockNodeById;
  if (typeof getBlockNodeById !== 'function') {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'blocks.delete requires the blockNode helper to be registered.',
      { reason: 'missing_helper' },
    );
  }

  const matches = getBlockNodeById(sdBlockId);
  if (!matches || (Array.isArray(matches) && matches.length === 0)) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Block with sdBlockId "${sdBlockId}" was not found at the command layer.`,
      { sdBlockId },
    );
  }
  if (Array.isArray(matches) && matches.length > 1) {
    throw new DocumentApiAdapterError(
      'AMBIGUOUS_TARGET',
      `Multiple blocks share sdBlockId "${sdBlockId}" at the command layer.`,
      { sdBlockId, count: matches.length },
    );
  }
}

// ---------------------------------------------------------------------------
// blocks.delete wrapper
// ---------------------------------------------------------------------------

export function blocksDeleteWrapper(
  editor: Editor,
  input: BlocksDeleteInput,
  options?: MutationOptions,
): BlocksDeleteResult {
  // 1. Reject tracked mode (unsupported for this operation)
  rejectTrackedMode('blocks.delete', options);

  // 2. Resolve and validate the target block from the block index
  const index = getBlockIndex(editor);
  const candidate = findBlockByIdStrict(index, input.target);
  validateTargetNodeType(candidate.nodeType);

  // 3. Resolve the command-facing sdBlockId
  const sdBlockId = resolveSdBlockId(candidate as { node: { attrs?: Record<string, unknown> } });

  // 4. Acquire the editor command
  const deleteBlockNodeById = requireEditorCommand(
    editor.commands?.deleteBlockNodeById,
    'blocks.delete',
  ) as DeleteBlockNodeByIdCommand;

  // 5. Preflight command-layer uniqueness check
  validateCommandLayerUniqueness(editor, sdBlockId);

  // 6. Dry run — full validation without mutation
  if (options?.dryRun) {
    return { success: true, deleted: input.target };
  }

  // 7. Execute through plan engine
  const receipt = executeDomainCommand(
    editor,
    () => {
      const didApply = deleteBlockNodeById(sdBlockId);
      if (didApply) {
        clearIndexCache(editor);
      }
      return didApply;
    },
    { expectedRevision: options?.expectedRevision },
  );

  // 8. Assert success — all pre-checks passed, so false is an internal bug
  if (receipt.steps[0]?.effect !== 'changed') {
    throw new DocumentApiAdapterError(
      'INTERNAL_ERROR',
      'blocks.delete command returned false despite passing all pre-apply checks. This is an internal invariant violation.',
      { sdBlockId, target: input.target },
    );
  }

  return { success: true, deleted: input.target };
}
