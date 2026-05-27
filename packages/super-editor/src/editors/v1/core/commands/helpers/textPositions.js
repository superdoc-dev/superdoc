const ZERO_WIDTH_MARKER_NODE_NAMES = new Set([
  'bookmarkStart',
  'bookmarkEnd',
  'commentRangeStart',
  'commentRangeEnd',
  'commentReference',
  'permStart',
  'permEnd',
  'permStartBlock',
  'permEndBlock',
  'tableOfContentsEntry',
  'indexEntry',
  'authorityEntry',
  'passthroughInline',
  'passthroughBlock',
]);

function isZeroWidthMarker(node) {
  if (node.type.name === 'fieldAnnotation' && node.attrs?.hidden === true) return true;
  return ZERO_WIDTH_MARKER_NODE_NAMES.has(node.type.name);
}

/**
 * Finds the first text cursor position inside a node.
 * @param {import('prosemirror-model').Node} node
 * @param {number} nodePos
 * @returns {number | null}
 */
export function findFirstTextPosInNode(node, nodePos) {
  if (node.isText) return nodePos;

  for (let index = 0, offset = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const childPos = nodePos + 1 + offset;
    const found = findFirstTextPosInNode(child, childPos);
    if (found != null) return found;
    offset += child.nodeSize;
  }

  return null;
}

/**
 * Finds the first cursor position for visible content inside a node.
 * @param {import('prosemirror-model').Node} node
 * @param {number} nodePos
 * @returns {number | null}
 */
export function findFirstContentCursorPosInNode(node, nodePos) {
  if (isZeroWidthMarker(node)) return null;
  if (node.isText || node.isAtom) return nodePos;
  if (node.isTextblock && node.childCount === 0) return nodePos + 1;

  for (let index = 0, offset = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    const childPos = nodePos + 1 + offset;
    const found = findFirstContentCursorPosInNode(child, childPos);
    if (found != null) return found;
    offset += child.nodeSize;
  }

  if (node.isTextblock) return nodePos + 1;

  return null;
}

/**
 * Finds the last text cursor position inside a node.
 * @param {import('prosemirror-model').Node} node
 * @param {number} nodePos
 * @returns {number | null}
 */
export function findLastTextPosInNode(node, nodePos) {
  if (node.isText) return nodePos + (node.text?.length ?? 0);

  for (let index = node.childCount - 1, offset = node.content.size; index >= 0; index -= 1) {
    const child = node.child(index);
    offset -= child.nodeSize;
    const childPos = nodePos + 1 + offset;
    const found = findLastTextPosInNode(child, childPos);
    if (found != null) return found;
  }

  return null;
}

/**
 * Finds the last cursor position for visible content inside a node.
 * @param {import('prosemirror-model').Node} node
 * @param {number} nodePos
 * @returns {number | null}
 */
export function findLastContentCursorPosInNode(node, nodePos) {
  if (isZeroWidthMarker(node)) return null;
  if (node.isText) return nodePos + (node.text?.length ?? 0);
  if (node.isAtom) return nodePos + node.nodeSize;
  if (node.isTextblock && node.childCount === 0) return nodePos + 1;

  for (let index = node.childCount - 1, offset = node.content.size; index >= 0; index -= 1) {
    const child = node.child(index);
    offset -= child.nodeSize;
    const childPos = nodePos + 1 + offset;
    const found = findLastContentCursorPosInNode(child, childPos);
    if (found != null) return found;
  }

  if (node.isTextblock) return nodePos + 1;

  return null;
}
