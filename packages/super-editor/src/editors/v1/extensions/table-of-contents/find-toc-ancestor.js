/**
 * Find the enclosing `tableOfContents` node for a given document position.
 *
 * Used by the context menu and the F9 shortcut to detect when the cursor /
 * right-click landed inside a TOC, so we can route the action through
 * `editor.doc.toc.update`.
 *
 * @param {import('prosemirror-model').Node} doc - The PM document.
 * @param {number} pos - A document position.
 * @returns {{ node: import('prosemirror-model').Node, pos: number, sdBlockId: string | null } | null}
 *   The TOC node, its document position, and its `sdBlockId` (when available),
 *   or `null` when `pos` is not inside a TOC.
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
    if (node?.type?.name === 'tableOfContents') {
      const sdBlockId = typeof node.attrs?.sdBlockId === 'string' ? node.attrs.sdBlockId : null;
      const nodePos = depth === 0 ? 0 : resolved.before(depth);
      return { node, pos: nodePos, sdBlockId };
    }
  }
  return null;
}
