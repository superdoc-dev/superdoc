/**
 * Blocks convenience wrappers — bridge blocks.list, blocks.delete, and
 * blocks.deleteRange to the plan engine's execution path.
 *
 * Follows the same domain-command wrapper pattern as create-wrappers.ts
 * and lists-wrappers.ts.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import {
  DELETABLE_BLOCK_NODE_TYPES,
  type BlockNodeAddress,
  type BlocksDeleteInput,
  type BlocksDeleteResult,
  type BlocksListInput,
  type BlocksListResult,
  type BlocksDeleteRangeInput,
  type BlocksDeleteRangeResult,
  type BlockListEntry,
  type DeletedBlockSummary,
  type MutationOptions,
} from '@superdoc/document-api';
import { clearIndexCache, getBlockIndex } from '../helpers/index-cache.js';
import {
  findBlockByIdStrict,
  mapBlockNodeType,
  resolveBlockNodeId,
  type BlockCandidate,
  type BlockIndex,
} from '../helpers/node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { getRevision } from './revision-tracker.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type DeleteBlockNodeByIdCommand = (id: string) => boolean;

const SUPPORTED_DELETE_NODE_TYPES = new Set<string>(DELETABLE_BLOCK_NODE_TYPES);
const REJECTED_DELETE_NODE_TYPES = new Set(['tableRow', 'tableCell']);
const TEXT_PREVIEW_MAX_LENGTH = 80;

/**
 * PM node types that `mapBlockNodeType` does not recognize but are safe to
 * include in range deletions. Passthrough nodes preserve opaque OOXML XML
 * and don't contain user-addressable content.
 */
const RANGE_DELETE_SAFE_NODE_TYPES = new Set(['passthroughBlock', 'passthroughInline']);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function extractTextPreview(node: ProseMirrorNode): string | null {
  if (!node.isTextblock) return null;
  const text = node.textContent;
  if (text.length <= TEXT_PREVIEW_MAX_LENGTH) return text;
  return text.slice(0, TEXT_PREVIEW_MAX_LENGTH);
}

function toBlockSummary(candidate: BlockCandidate, ordinal: number): DeletedBlockSummary {
  return {
    ordinal,
    nodeId: candidate.nodeId,
    nodeType: candidate.nodeType,
    textPreview: extractTextPreview(candidate.node),
  };
}

function resolveSdBlockId(candidate: BlockCandidate): string {
  const sdBlockId = (candidate.node.attrs as Record<string, unknown>)?.sdBlockId;
  if (typeof sdBlockId === 'string' && sdBlockId.length > 0) return sdBlockId;

  throw new DocumentApiAdapterError(
    'INTERNAL_ERROR',
    'Resolved block candidate is missing sdBlockId attribute. This indicates a schema/extension invariant violation.',
    { attrs: candidate.node.attrs },
  );
}

function validateDeleteTargetNodeType(nodeType: string): void {
  if (REJECTED_DELETE_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `blocks.delete does not support "${nodeType}" targets. Table row/column operations are out of scope.`,
      { nodeType },
    );
  }

  if (!SUPPORTED_DELETE_NODE_TYPES.has(nodeType)) {
    throw new DocumentApiAdapterError('INVALID_TARGET', `blocks.delete does not support "${nodeType}" targets.`, {
      nodeType,
    });
  }
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
// blocks.list — ordered block inspection
// ---------------------------------------------------------------------------

function collectTopLevelBlocks(editor: Editor): BlockCandidate[] {
  const doc = editor.state.doc;
  const results: BlockCandidate[] = [];

  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const nodeType = mapBlockNodeType(child);
    const pos = offset; // doc is root — no opening token in the PM position model

    if (nodeType) {
      // Delegate to the canonical ID resolver so IDs match the block index.
      // This ensures blocks.list output is directly usable in blocks.delete
      // and blocks.deleteRange without ID mismatches.
      const nodeId = resolveBlockNodeId(child, pos, nodeType);

      if (nodeId) {
        results.push({ node: child, pos, end: pos + child.nodeSize, nodeType, nodeId });
      }
    }
    offset += child.nodeSize;
  }
  return results;
}

export function blocksListWrapper(editor: Editor, input?: BlocksListInput): BlocksListResult {
  const topLevel = collectTopLevelBlocks(editor);

  // Apply nodeTypes filter
  const filtered = input?.nodeTypes ? topLevel.filter((b) => input.nodeTypes!.includes(b.nodeType)) : topLevel;

  const total = filtered.length;
  const offset = input?.offset ?? 0;
  const limit = input?.limit ?? total;
  const paged = filtered.slice(offset, offset + limit);

  const blocks: BlockListEntry[] = paged.map((candidate, i) => ({
    ordinal: offset + i,
    nodeId: candidate.nodeId,
    nodeType: candidate.nodeType,
    textPreview: extractTextPreview(candidate.node),
    isEmpty: candidate.node.textContent.length === 0,
  }));

  return { total, blocks, revision: getRevision(editor) };
}

// ---------------------------------------------------------------------------
// blocks.delete — single block deletion with scoped receipt
// ---------------------------------------------------------------------------

export function blocksDeleteWrapper(
  editor: Editor,
  input: BlocksDeleteInput,
  options?: MutationOptions,
): BlocksDeleteResult {
  rejectTrackedMode('blocks.delete', options);

  const index = getBlockIndex(editor);
  const candidate = findBlockByIdStrict(index, input.target);
  validateDeleteTargetNodeType(candidate.nodeType);

  // Compute ordinal in top-level order, consistent with blocks.list output.
  // index.candidates includes nested blocks (tableRow, tableCell via descendants()),
  // so using indexOf on it would produce ordinals that don't match blocks.list.
  const topLevel = collectTopLevelBlocks(editor);
  const candidateOrdinal = topLevel.findIndex(
    (b) => b.nodeId === candidate.nodeId && b.nodeType === candidate.nodeType,
  );
  const deletedBlock = toBlockSummary(candidate, candidateOrdinal);

  const sdBlockId = resolveSdBlockId(candidate);

  const deleteBlockNodeById = requireEditorCommand(
    editor.commands?.deleteBlockNodeById,
    'blocks.delete',
  ) as DeleteBlockNodeByIdCommand;

  validateCommandLayerUniqueness(editor, sdBlockId);

  if (options?.dryRun) {
    return { success: true, deleted: input.target, deletedBlock };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const didApply = deleteBlockNodeById(sdBlockId);
      if (didApply) clearIndexCache(editor);
      return didApply;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    throw new DocumentApiAdapterError(
      'INTERNAL_ERROR',
      'blocks.delete command returned false despite passing all pre-apply checks. This is an internal invariant violation.',
      { sdBlockId, target: input.target },
    );
  }

  return { success: true, deleted: input.target, deletedBlock };
}

// ---------------------------------------------------------------------------
// blocks.deleteRange — contiguous range deletion
// ---------------------------------------------------------------------------

/**
 * Returns true if the given block's paragraph properties contain a section
 * break (`sectPr`). Section-break paragraphs mark OOXML section boundaries
 * and must not be deleted via range operations.
 */
function hasSectionBreak(candidate: BlockCandidate): boolean {
  const attrs = candidate.node.attrs as Record<string, unknown> | undefined;
  const pPr = attrs?.paragraphProperties as Record<string, unknown> | undefined;
  return pPr?.sectPr != null && typeof pPr.sectPr === 'object';
}

function resolveTopLevelOrdinal(topLevel: BlockCandidate[], candidate: BlockCandidate, label: string): number {
  // Match by nodeId since the top-level list and the full block index may hold
  // different BlockCandidate object references for the same node.
  const idx = topLevel.findIndex((b) => b.nodeId === candidate.nodeId && b.nodeType === candidate.nodeType);
  if (idx !== -1) return idx;

  // Candidate was found in the full index but is not a direct doc child
  throw new DocumentApiAdapterError(
    'INVALID_TARGET',
    `blocks.deleteRange ${label} resolved to a nested block (not a direct document child). Only top-level blocks are supported.`,
    { nodeId: candidate.nodeId, nodeType: candidate.nodeType },
  );
}

/**
 * Resolves a deleteRange endpoint using the composite `(nodeType, nodeId)` key.
 *
 * Using the composite key avoids false AMBIGUOUS_TARGET errors that occur with
 * nodeId-only lookup when different node types share the same nodeId (e.g., a
 * paragraph and a listItem both having paraId "abc123").
 *
 * When the exact key isn't found, checks whether the nodeId exists under a
 * different nodeType and throws a specific INVALID_TARGET diagnostic.
 */
function resolveRangeEndpoint(index: BlockIndex, address: BlockNodeAddress, label: string): BlockCandidate {
  const key = `${address.nodeType}:${address.nodeId}`;

  if (index.ambiguous.has(key)) {
    throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', `Multiple blocks share key "${key}".`, {
      target: address,
    });
  }

  const candidate = index.byId.get(key);
  if (candidate) return candidate;

  // Exact key not found — check if the nodeId exists under a different nodeType
  const mismatch = index.candidates.find((c) => c.nodeId === address.nodeId);
  if (mismatch) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `blocks.deleteRange ${label} expected ${address.nodeType}:${address.nodeId} but resolved to ${mismatch.nodeType}.`,
      { expected: address.nodeType, actual: mismatch.nodeType, nodeId: address.nodeId },
    );
  }

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Block "${key}" was not found.`, {
    target: address,
  });
}

/**
 * Rejects deletion ranges that contain unrecognized top-level nodes.
 *
 * `tr.delete(from, to)` removes ALL nodes in the positional span, including
 * node types not recognized by `mapBlockNodeType()` (e.g., bibliography,
 * footnotes). Without this check, those nodes would be silently destroyed.
 */
function rejectUnmappedNodesInRange(doc: ProseMirrorNode, rangeBlocks: BlockCandidate[]): void {
  if (rangeBlocks.length === 0) return;

  const rangeFrom = rangeBlocks[0]!.pos;
  const rangeTo = rangeBlocks[rangeBlocks.length - 1]!.end;
  const recognizedPositions = new Set(rangeBlocks.map((b) => b.pos));

  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const childEnd = offset + child.nodeSize;

    // Only inspect children that overlap the deletion range
    if (childEnd > rangeFrom && offset < rangeTo && !recognizedPositions.has(offset)) {
      // Passthrough nodes (opaque OOXML preservation) are safe to delete —
      // they contain no user-addressable content.
      if (!RANGE_DELETE_SAFE_NODE_TYPES.has(child.type.name)) {
        throw new DocumentApiAdapterError(
          'INVALID_TARGET',
          `blocks.deleteRange cannot delete range: unrecognized node "${child.type.name}" at position ${offset} would be silently removed.`,
          { pmNodeType: child.type.name, pos: offset },
        );
      }
    }

    offset = childEnd;
  }
}

export function blocksDeleteRangeWrapper(
  editor: Editor,
  input: BlocksDeleteRangeInput,
  options?: MutationOptions,
): BlocksDeleteRangeResult {
  rejectTrackedMode('blocks.deleteRange', options);

  // 1. Collect top-level blocks (direct children of doc node)
  const topLevel = collectTopLevelBlocks(editor);

  // 2. Resolve start and end using composite (nodeType, nodeId) key.
  //    This avoids false AMBIGUOUS_TARGET errors when different node types
  //    share the same nodeId (e.g., a paragraph and a listItem with the same paraId).
  const index = getBlockIndex(editor);
  const startCandidate = resolveRangeEndpoint(index, input.start, 'start');
  const endCandidate = resolveRangeEndpoint(index, input.end, 'end');

  // 3. Confirm both are top-level
  const startOrdinal = resolveTopLevelOrdinal(topLevel, startCandidate, 'start');
  const endOrdinal = resolveTopLevelOrdinal(topLevel, endCandidate, 'end');

  // 4. Validate range direction
  if (startOrdinal > endOrdinal) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      `blocks.deleteRange start ordinal (${startOrdinal}) is after end ordinal (${endOrdinal}). The start must precede or equal the end.`,
      { startOrdinal, endOrdinal },
    );
  }

  // 5. Collect the range and build summaries
  const rangeBlocks = topLevel.slice(startOrdinal, endOrdinal + 1);

  // 5a. Reject ranges that contain unrecognized top-level nodes.
  //     tr.delete(from, to) removes ALL nodes in the positional span, including
  //     node types not recognized by mapBlockNodeType (e.g., bibliography).
  rejectUnmappedNodesInRange(editor.state.doc, rangeBlocks);

  // 5b. Reject ranges that include section breaks
  for (const block of rangeBlocks) {
    if (hasSectionBreak(block)) {
      throw new DocumentApiAdapterError(
        'INVALID_TARGET',
        `blocks.deleteRange cannot delete a range that includes a section break (block "${block.nodeId}" at ordinal ${topLevel.indexOf(block)}).`,
        { nodeId: block.nodeId, nodeType: block.nodeType },
      );
    }
  }

  const deletedBlocks: DeletedBlockSummary[] = rangeBlocks.map((c, i) => toBlockSummary(c, startOrdinal + i));

  const revisionBefore = getRevision(editor);

  // 6. Dry run — full validation, no mutation
  if (options?.dryRun) {
    return {
      success: true,
      deletedCount: rangeBlocks.length,
      deletedBlocks,
      revision: { before: revisionBefore, after: revisionBefore },
      dryRun: true,
    };
  }

  // 7. Delete the contiguous range in a single transaction.
  //    Because the blocks are contiguous top-level children, we can delete the
  //    entire span [first.pos, last.end) in one PM tr.delete — avoiding the
  //    mismatched-transaction errors that arise from multiple sequential command calls.
  const rangeFrom = rangeBlocks[0]!.pos;
  const rangeTo = rangeBlocks[rangeBlocks.length - 1]!.end;

  const receipt = executeDomainCommand(
    editor,
    () => {
      const tr = editor.state.tr;
      tr.delete(rangeFrom, rangeTo);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    throw new DocumentApiAdapterError(
      'INTERNAL_ERROR',
      'blocks.deleteRange command returned false despite passing all pre-apply checks.',
      { start: input.start, end: input.end },
    );
  }

  const revisionAfter = getRevision(editor);

  return {
    success: true,
    deletedCount: rangeBlocks.length,
    deletedBlocks,
    revision: { before: revisionBefore, after: revisionAfter },
    dryRun: false,
  };
}
