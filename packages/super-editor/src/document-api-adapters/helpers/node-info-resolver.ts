import type { Editor } from '../../core/Editor.js';
import type { NodeAddress, NodeInfo } from '@superdoc/document-api';
import { findInlineByAnchor, type InlineIndex } from './inline-address-resolver.js';
import { getInlineIndex } from './index-cache.js';
import { findBlockById, type BlockIndex } from './node-address-resolver.js';
import { mapNodeInfo } from './node-info-mapper.js';

/**
 * Resolves a single {@link NodeAddress} to its {@link NodeInfo} representation.
 *
 * @param editor - The editor instance.
 * @param index - Pre-built block index.
 * @param address - The address to resolve.
 * @param inlineIndex - Optional pre-built inline index (built lazily if omitted).
 * @returns The resolved node info, or `undefined` if the address cannot be found.
 */
export function resolveNodeInfoForAddress(
  editor: Editor,
  index: BlockIndex,
  address: NodeAddress,
  inlineIndex?: InlineIndex,
): NodeInfo | undefined {
  if (address.kind === 'block') {
    const candidate = findBlockById(index, address);
    if (!candidate) return undefined;
    return mapNodeInfo(candidate, address.nodeType);
  }

  const resolvedInlineIndex = inlineIndex ?? getInlineIndex(editor);
  const candidate = findInlineByAnchor(resolvedInlineIndex, address);
  if (!candidate) return undefined;
  return mapNodeInfo(candidate, address.nodeType);
}

/**
 * Batch-resolves an array of addresses to their {@link NodeInfo} representations.
 * Unresolvable addresses are silently skipped.
 *
 * @param editor - The editor instance.
 * @param index - Pre-built block index.
 * @param addresses - The addresses to resolve.
 * @returns Array of resolved node infos (may be shorter than input if some addresses are missing).
 */
export function resolveIncludedNodes(editor: Editor, index: BlockIndex, addresses: NodeAddress[]): NodeInfo[] {
  const included: NodeInfo[] = [];
  let inlineIndex: InlineIndex | undefined;

  for (const address of addresses) {
    if (address.kind === 'inline') {
      inlineIndex ??= getInlineIndex(editor);
      const info = resolveNodeInfoForAddress(editor, index, address, inlineIndex);
      if (info) included.push(info);
      continue;
    }

    const info = resolveNodeInfoForAddress(editor, index, address);
    if (info) included.push(info);
  }

  return included;
}
