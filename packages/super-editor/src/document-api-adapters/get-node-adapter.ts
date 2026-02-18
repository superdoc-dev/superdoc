import type { Editor } from '../core/Editor.js';
import type { BlockNodeType, GetNodeByIdInput, NodeAddress, NodeInfo } from '@superdoc/document-api';
import type { BlockCandidate, BlockIndex } from './helpers/node-address-resolver.js';
import { getBlockIndex, getInlineIndex } from './helpers/index-cache.js';
import { findInlineByAnchor } from './helpers/inline-address-resolver.js';
import { mapNodeInfo } from './helpers/node-info-mapper.js';
import { DocumentApiAdapterError } from './errors.js';

function findBlocksByTypeAndId(blockIndex: BlockIndex, nodeType: BlockNodeType, nodeId: string): BlockCandidate[] {
  return blockIndex.candidates.filter((candidate) => candidate.nodeType === nodeType && candidate.nodeId === nodeId);
}

/**
 * Resolves a {@link NodeAddress} to full {@link NodeInfo} by looking up the
 * node in the editor's current document state.
 *
 * @param editor - The editor instance to query.
 * @param address - The node address to resolve.
 * @returns Detailed node information with typed properties.
 * @throws {DocumentApiAdapterError} If no node is found for the given address.
 */
export function getNodeAdapter(editor: Editor, address: NodeAddress): NodeInfo {
  const blockIndex = getBlockIndex(editor);

  if (address.kind === 'block') {
    const matches = findBlocksByTypeAndId(blockIndex, address.nodeType, address.nodeId);
    if (matches.length === 0) {
      throw new DocumentApiAdapterError(
        'TARGET_NOT_FOUND',
        `Node "${address.nodeType}" not found for id "${address.nodeId}".`,
      );
    }
    if (matches.length > 1) {
      throw new DocumentApiAdapterError(
        'TARGET_NOT_FOUND',
        `Multiple nodes share ${address.nodeType} id "${address.nodeId}".`,
      );
    }

    return mapNodeInfo(matches[0]!, address.nodeType);
  }

  const inlineIndex = getInlineIndex(editor);
  const candidate = findInlineByAnchor(inlineIndex, address);
  if (!candidate) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Inline node "${address.nodeType}" not found for the provided anchor.`,
    );
  }

  return mapNodeInfo(candidate, address.nodeType);
}

function resolveBlockById(
  editor: Editor,
  nodeId: string,
  nodeType?: BlockNodeType,
): { candidate: BlockCandidate; resolvedType: BlockNodeType } {
  const blockIndex = getBlockIndex(editor);
  if (nodeType) {
    const matches = findBlocksByTypeAndId(blockIndex, nodeType, nodeId);
    if (matches.length === 0) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Node "${nodeType}" not found for id "${nodeId}".`);
    }
    if (matches.length > 1) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Multiple nodes share ${nodeType} id "${nodeId}".`);
    }
    return { candidate: matches[0]!, resolvedType: nodeType };
  }

  const matches = blockIndex.candidates.filter((candidate) => candidate.nodeId === nodeId);
  if (matches.length === 0) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Node not found for id "${nodeId}".`);
  }
  if (matches.length > 1) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Multiple nodes share id "${nodeId}". Provide nodeType to disambiguate.`,
    );
  }

  return { candidate: matches[0]!, resolvedType: matches[0]!.nodeType };
}

/**
 * Resolves a block node by its ID (and optional type) to full {@link NodeInfo}.
 *
 * @param editor - The editor instance to query.
 * @param input - The block node id input payload.
 * @returns Detailed node information with typed properties.
 * @throws {DocumentApiAdapterError} If no node matches or multiple nodes match without a type disambiguator.
 */
export function getNodeByIdAdapter(editor: Editor, input: GetNodeByIdInput): NodeInfo {
  const { nodeId, nodeType } = input;
  const { candidate, resolvedType } = resolveBlockById(editor, nodeId, nodeType);
  const displayType = nodeType ?? resolvedType;
  return mapNodeInfo(candidate, displayType);
}
