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
 * Must be stable across stateless re-opens of the same document so IDs returned
 * by `toc.list` can be reused by `toc.get/configure/update/remove`.
 *
 * Do not use sdBlockId here: it is runtime-generated and can change every time a
 * document is loaded.
 *
 * @param node - The tableOfContents ProseMirror node.
 * @param pos - The node's absolute position in the document.
 * @returns A deterministic id derived from position + instruction.
 */
export function resolvePublicTocNodeId(node: ProseMirrorNode, pos: number): string {
  return buildFallbackTocNodeId(node, pos);
}
