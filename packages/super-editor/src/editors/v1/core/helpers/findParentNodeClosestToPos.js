// @ts-check

/**
 * @typedef {Object} ParentNodeInfo
 * @property {number} pos - The position of the parent node.
 * @property {number} start - The start position of the parent node.
 * @property {number} depth - The depth of the parent node.
 * @property {import("prosemirror-model").Node} node - The parent node.
 */

/**
 * Finds the closest parent node to a resolved position that matches a predicate.
 * @param {import("prosemirror-model").ResolvedPos} $pos - The resolved position.
 * @param {function(import("prosemirror-model").Node): boolean} predicate - Predicate to match.
 * @returns {ParentNodeInfo|null} Closest parent node to the resolved position that matches the predicate.
 *
 * https://github.com/atlassian/prosemirror-utils/blob/master/src/selection.ts#L57
 */
export const findParentNodeClosestToPos = ($pos, predicate) => {
  for (let i = $pos.depth; i > 0; i--) {
    const node = $pos.node(i);
    if (predicate(node)) {
      return {
        pos: i > 0 ? $pos.before(i) : 0,
        start: $pos.start(i),
        depth: i,
        node,
      };
    }
  }
};
