import { findParentNodeClosestToPos } from '@core/helpers/findParentNodeClosestToPos.js';

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
  const found = findParentNodeClosestToPos(resolved, (n) => n.type.name === 'tableOfContents');
  if (!found) return null;
  const sdBlockId = typeof found.node.attrs?.sdBlockId === 'string' ? found.node.attrs.sdBlockId : null;
  return { node: found.node, pos: found.pos, sdBlockId };
}
