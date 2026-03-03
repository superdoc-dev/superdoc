/**
 * TC entry node ID generation — deterministic, revision-scoped IDs for tableOfContentsEntry nodes.
 *
 * Follows the same FNV-1a strategy as toc-node-id.ts but scoped to inline TC field nodes.
 * IDs are content-addressed: they change when the instruction or position changes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** FNV-1a 32-bit hash — fast, non-cryptographic, deterministic. */
function stableHash(input: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Produces a deterministic public ID for a tableOfContentsEntry inline node.
 *
 * The ID is derived from the node's position and instruction text, making it
 * stable within a document revision but not across edits that change position
 * or content (revision-scoped).
 *
 * @param node - The tableOfContentsEntry ProseMirror node.
 * @param pos - The node's absolute position in the document.
 * @returns A deterministic string id prefixed with `tc-entry-`.
 */
export function resolvePublicTcEntryNodeId(node: ProseMirrorNode, pos: number): string {
  const instruction = typeof node.attrs?.instruction === 'string' ? node.attrs.instruction : '';
  return `tc-entry-${stableHash(`${pos}:${instruction}`)}`;
}
