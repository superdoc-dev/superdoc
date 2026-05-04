/**
 * Find the enclosing `tableOfContents` node for a document position. Used by
 * the context menu to route "Update table of contents" through
 * `editor.doc.toc.update`.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} pos
 * @returns {{ node: import('prosemirror-model').Node, pos: number, sdBlockId: string | null } | null}
 */
export function findTocAncestor(doc, pos) {
  if (!doc || typeof pos !== 'number' || !Number.isFinite(pos)) return null;
  let resolved;
  try {
    resolved = doc.resolve(pos);
  } catch {
    return null;
  }
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node?.type?.name !== 'tableOfContents') continue;
    const sdBlockId = typeof node.attrs?.sdBlockId === 'string' ? node.attrs.sdBlockId : null;
    return { node, pos: depth === 0 ? 0 : resolved.before(depth), sdBlockId };
  }
  return null;
}
