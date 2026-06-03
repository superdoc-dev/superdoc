// https://discuss.prosemirror.net/t/expanding-the-selection-to-the-active-mark/

/**
 * Expand from `pos` to the full range covered by the mark named
 * `markName` on the containing parent. Walks left/right while adjacent
 * siblings share an equivalent mark.
 *
 * @param {import('./types.js').PmNode} doc - Document root to resolve against.
 * @param {number} pos - Cursor position to expand from.
 * @param {string} markName - Mark type name (e.g. `'link'`, `'bold'`).
 * @returns {{ from: number; to: number; attrs: import('./types.js').Attrs } | null}
 *   `{ from, to, attrs }` of the contiguous mark range, or `null` if no
 *   `markName` mark is at `pos`.
 */
export const findMarkPosition = (doc, pos, markName) => {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const start = parent.childAfter($pos.parentOffset);

  if (!start.node) {
    return null;
  }

  const actualMark = start.node.marks.find((mark) => mark.type.name === markName);
  if (!actualMark) {
    return null;
  }

  let startIndex = $pos.index();
  let startPos = $pos.start() + start.offset;

  while (startIndex > 0 && actualMark.isInSet(parent.child(startIndex - 1).marks)) {
    startPos -= parent.child(--startIndex).nodeSize;
  }

  let endIndex = $pos.index() + 1;
  let endPos = $pos.start() + start.offset + start.node.nodeSize;

  while (endIndex < parent.childCount && actualMark.isInSet(parent.child(endIndex).marks)) {
    endPos += parent.child(endIndex++).nodeSize;
  }

  return {
    from: startPos,
    to: endPos,
    attrs: actualMark.attrs,
  };
};

/**
 * Flatten a document tree into a list of `{ node, pos }` entries.
 *
 * @param {import('./types.js').PmNode} node - Root to flatten.
 * @param {boolean} [descend=true] - Recurse into matching children.
 *   When `false`, only the top-level descendants are returned.
 * @returns {import('./types.js').NodePosEntry[]} Every descendant
 *   paired with its document position.
 * @throws {Error} If `node` is missing.
 */
export const flatten = (node, descend = true) => {
  if (!node) {
    throw new Error('Invalid "node" parameter');
  }
  /** @type {import('./types.js').NodePosEntry[]} */
  const result = [];
  node.descendants((child, pos) => {
    result.push({ node: child, pos });
    if (!descend) {
      return false;
    }
  });
  return result;
};

/**
 * Track-changes variant of `findChildren` with optional descend control.
 * Distinct from `@core/helpers/findChildren` (the 2-arg version without
 * `descend`); prefer the core helper for the common case.
 *
 * @param {import('./types.js').PmNode} node - Root to search.
 * @param {(child: import('./types.js').PmNode) => boolean} predicate -
 *   Called per descendant; return `true` to keep the entry.
 * @param {boolean} [descend] - Recurse into matching children. Forwarded
 *   to `flatten`.
 * @returns {import('./types.js').NodePosEntry[]} Matching `{ node, pos }`
 *   entries.
 * @throws {Error} If `node` or `predicate` is missing.
 */
export const findChildren = (node, predicate, descend) => {
  if (!node) {
    throw new Error('Invalid "node" parameter');
  } else if (!predicate) {
    throw new Error('Invalid "predicate" parameter');
  }
  return flatten(node, descend).filter((child) => predicate(child.node));
};

/**
 * Return every inline-typed descendant of `node` as `{ node, pos }`.
 *
 * @param {import('./types.js').PmNode} node - Root to search.
 * @param {boolean} [descend] - Recurse into matching children.
 * @returns {import('./types.js').NodePosEntry[]} Inline descendants.
 */
export const findInlineNodes = (node, descend) => {
  return findChildren(node, (child) => child.isInline, descend);
};
