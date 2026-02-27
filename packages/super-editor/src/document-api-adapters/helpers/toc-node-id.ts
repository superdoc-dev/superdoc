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
 * Deterministic fallback TOC id for nodes that do not carry sdBlockId.
 *
 * @param node - The tableOfContents ProseMirror node.
 * @param pos - The node's absolute position in the document.
 * @returns A deterministic string id prefixed with `toc-auto-`.
 */
export function buildFallbackTocNodeId(node: ProseMirrorNode, pos: number): string {
  const instruction = typeof node.attrs?.instruction === 'string' ? node.attrs.instruction : '';
  return `toc-auto-${stableHash(`${pos}:${instruction}`)}`;
}

/**
 * Public TOC id used across discovery and block targeting.
 *
 * Prefers sdBlockId when present (stable within session and command-compatible),
 * otherwise falls back to a deterministic id derived from position and instruction.
 *
 * @param node - The tableOfContents ProseMirror node.
 * @param pos - The node's absolute position in the document.
 * @returns The sdBlockId if present, otherwise a deterministic fallback id.
 */
export function resolvePublicTocNodeId(node: ProseMirrorNode, pos: number): string {
  const sdBlockId = node.attrs?.sdBlockId;
  if (typeof sdBlockId === 'string' && sdBlockId.length > 0) return sdBlockId;
  return buildFallbackTocNodeId(node, pos);
}
