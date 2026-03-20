import type { Editor } from '../core/Editor.js';
import type { BlockNodeType, GetNodeByIdInput, NodeAddress, SDNodeResult } from '@superdoc/document-api';
import type { BlockCandidate, BlockIndex } from './helpers/node-address-resolver.js';
import { findBlockByNodeIdOnly } from './helpers/node-address-resolver.js';
import { getBlockIndex, getInlineIndex } from './helpers/index-cache.js';
import { findInlineByAnchor } from './helpers/inline-address-resolver.js';
import { projectContentNode, projectInlineNode, projectMarkBasedInline } from './helpers/sd-projection.js';
import { DocumentApiAdapterError } from './errors.js';
import { resolveStoryRuntime } from './story-runtime/resolve-story-runtime.js';

function findBlocksByTypeAndId(blockIndex: BlockIndex, nodeType: BlockNodeType, nodeId: string): BlockCandidate[] {
  // Fast path: check the byId map which includes alias entries (e.g., sdBlockId
  // for paragraphs that also have paraId as their primary nodeId).
  const byIdMatch = blockIndex.byId.get(`${nodeType}:${nodeId}`);
  if (byIdMatch) return [byIdMatch];

  // Fallback: linear scan for candidates whose primary nodeId matches.
  return blockIndex.candidates.filter((candidate) => candidate.nodeType === nodeType && candidate.nodeId === nodeId);
}

/** Returns the input block address as-is (already a NodeAddress). */
function buildBlockAddress(address: NodeAddress & { kind: 'block' }): NodeAddress {
  return address;
}

/** Returns the input inline address as-is (already a NodeAddress). */
function buildInlineAddress(address: NodeAddress & { kind: 'inline' }): NodeAddress {
  return address;
}

/**
 * Resolves a {@link NodeAddress} to an {@link SDNodeResult} by looking up the
 * node in the editor's current document state and projecting it to SDM/1.
 *
 * When the address includes a `story` locator, the node is resolved in
 * the corresponding story editor rather than the host (body) editor.
 */
export function getNodeAdapter(editor: Editor, address: NodeAddress): SDNodeResult {
  const runtime = resolveStoryRuntime(editor, address.story);
  const storyEditor = runtime.editor;
  const blockIndex = getBlockIndex(storyEditor);

  if (address.kind === 'block') {
    const matches = findBlocksByTypeAndId(blockIndex, address.nodeType, address.nodeId);
    if (matches.length > 1) {
      throw new DocumentApiAdapterError(
        'TARGET_NOT_FOUND',
        `Multiple nodes share ${address.nodeType} id "${address.nodeId}".`,
      );
    }

    let candidate = matches[0];

    // Fallback: nodeId-only lookup handles stale subtypes after paragraph ↔
    // heading / listItem restyling (the PM node and its nodeId stay the same
    // but the indexed nodeType changes).
    if (!candidate) {
      try {
        candidate = findBlockByNodeIdOnly(blockIndex, address.nodeId);
      } catch {
        // AMBIGUOUS_TARGET / TARGET_NOT_FOUND — throw the original error below
      }
    }

    if (!candidate) {
      throw new DocumentApiAdapterError(
        'TARGET_NOT_FOUND',
        `Node "${address.nodeType}" not found for id "${address.nodeId}".`,
      );
    }

    return {
      node: projectContentNode(candidate.node),
      address: {
        kind: 'block',
        nodeType: candidate.nodeType,
        nodeId: candidate.nodeId,
        ...(address.story && { story: address.story }),
      } as NodeAddress,
    };
  }

  const inlineIndex = getInlineIndex(storyEditor);
  const candidate = findInlineByAnchor(inlineIndex, address);
  if (!candidate) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Inline node "${address.nodeType}" not found for the provided anchor.`,
    );
  }

  // Node-based inlines (image, tab, run, etc.) have a PM node reference.
  if (candidate.node) {
    return {
      node: projectInlineNode(candidate.node),
      address: buildInlineAddress(address),
    };
  }

  // Mark-based inlines (hyperlink, comment) have a mark but no node.
  // Project from the mark data and resolve text content from the document.
  const projected = projectMarkBasedInline(storyEditor, candidate);
  if (projected) {
    return { node: projected, address: buildInlineAddress(address) };
  }

  throw new DocumentApiAdapterError(
    'TARGET_NOT_FOUND',
    `Inline node "${address.nodeType}" could not be projected from the provided anchor.`,
  );
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
  if (matches.length === 1) {
    return { candidate: matches[0]!, resolvedType: matches[0]!.nodeType };
  }
  if (matches.length > 1) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Multiple nodes share id "${nodeId}". Provide nodeType to disambiguate.`,
    );
  }

  // No primary match — check alias entries (e.g., sdBlockId for paragraphs).
  for (const [key, candidate] of blockIndex.byId) {
    if (key.endsWith(`:${nodeId}`)) {
      return { candidate, resolvedType: candidate.nodeType };
    }
  }

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Node not found for id "${nodeId}".`);
}

/**
 * Resolves a block node by its ID (and optional type) to an {@link SDNodeResult}.
 */
export function getNodeByIdAdapter(editor: Editor, input: GetNodeByIdInput): SDNodeResult {
  const { nodeId, nodeType } = input;
  const { candidate, resolvedType } = resolveBlockById(editor, nodeId, nodeType);
  return {
    node: projectContentNode(candidate.node),
    // Use candidate.nodeId (the canonical ID) rather than the caller's input,
    // which may be an alias (e.g. sdBlockId). This ensures the emitted address
    // is resolvable by getNode(), which looks up by primary nodeId.
    address: { kind: 'block', nodeType: resolvedType, nodeId: candidate.nodeId } as NodeAddress,
  };
}
