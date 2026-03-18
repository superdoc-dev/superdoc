// @ts-check
import { Plugin, PluginKey, Selection, TextSelection } from 'prosemirror-state';
import { TableMap } from 'prosemirror-tables';

const TABLE_CELL_ROLES = new Set(['cell', 'header_cell']);

/**
 * Finds the closest ancestor depth that matches the predicate.
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {(node: import('prosemirror-model').Node) => boolean} predicate
 * @returns {number}
 */
function findAncestorDepth($pos, predicate) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (predicate($pos.node(depth))) return depth;
  }
  return -1;
}

/**
 * Finds the nearest run ancestor within a paragraph.
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {number} paragraphDepth
 * @returns {number}
 */
function findRunDepthWithinParagraph($pos, paragraphDepth) {
  for (let depth = $pos.depth; depth > paragraphDepth; depth -= 1) {
    if ($pos.node(depth).type.name === 'run') return depth;
  }
  return -1;
}

/**
 * Returns true when the caret should be treated as being at the effective end
 * of the paragraph for horizontal navigation purposes.
 *
 * This is run-aware: the end of the final run in the paragraph counts as the
 * end of the text block even when the selection has not advanced to the raw
 * paragraph boundary position yet.
 *
 * @param {import('prosemirror-model').ResolvedPos} $head
 * @returns {boolean}
 */
export function isAtEffectiveParagraphEnd($head) {
  const paragraphDepth = findAncestorDepth($head, (node) => node.type.name === 'paragraph');
  if (paragraphDepth < 0) return false;

  const paragraph = $head.node(paragraphDepth);
  if (paragraph.content.size === 0) return true;

  if ($head.pos === $head.end(paragraphDepth)) return true;

  const runDepth = findRunDepthWithinParagraph($head, paragraphDepth);
  if (runDepth < 0) return false;
  if ($head.pos !== $head.end(runDepth)) return false;

  return $head.index(paragraphDepth) === paragraph.childCount - 1;
}

/**
 * Returns true when the caret should be treated as being at the effective start
 * of the paragraph for horizontal navigation purposes.
 *
 * @param {import('prosemirror-model').ResolvedPos} $head
 * @returns {boolean}
 */
export function isAtEffectiveParagraphStart($head) {
  const paragraphDepth = findAncestorDepth($head, (node) => node.type.name === 'paragraph');
  if (paragraphDepth < 0) return false;

  const paragraph = $head.node(paragraphDepth);
  if (paragraph.content.size === 0) return true;

  if ($head.pos === $head.start(paragraphDepth)) return true;

  const runDepth = findRunDepthWithinParagraph($head, paragraphDepth);
  if (runDepth < 0) return false;
  if ($head.pos !== $head.start(runDepth)) return false;

  return $head.index(paragraphDepth) === 0;
}

/**
 * Returns true when the current paragraph is the last paragraph inside the cell.
 * @param {import('prosemirror-model').ResolvedPos} $head
 * @param {number} cellDepth
 * @returns {boolean}
 */
function isInLastParagraphOfCell($head, cellDepth) {
  return $head.index(cellDepth) === $head.node(cellDepth).childCount - 1;
}

/**
 * Returns true when the current paragraph is the first paragraph inside the cell.
 * @param {import('prosemirror-model').ResolvedPos} $head
 * @param {number} cellDepth
 * @returns {boolean}
 */
function isInFirstParagraphOfCell($head, cellDepth) {
  return $head.index(cellDepth) === 0;
}

/**
 * Returns the table/cell context for a resolved position, or null when the
 * position is outside a table cell.
 * @param {import('prosemirror-model').ResolvedPos} $head
 * @returns {{ cellDepth: number, cellStart: number, tableDepth: number, tableStart: number, tablePos: number, table: import('prosemirror-model').Node } | null}
 */
function getTableContext($head) {
  const cellDepth = findAncestorDepth($head, (node) => TABLE_CELL_ROLES.has(node.type.spec.tableRole));
  if (cellDepth < 0) return null;

  const tableDepth = findAncestorDepth($head, (node) => node.type.spec.tableRole === 'table');
  if (tableDepth < 0) return null;

  const table = $head.node(tableDepth);
  return {
    cellDepth,
    cellStart: $head.before(cellDepth),
    tableDepth,
    tableStart: $head.start(tableDepth),
    tablePos: $head.before(tableDepth),
    table,
  };
}

/**
 * Returns true when the current cell touches the bottom-right edge of the table.
 * @param {ReturnType<typeof getTableContext>} context
 * @returns {boolean}
 */
function isLastCellInTable(context) {
  if (!context) return false;
  const map = TableMap.get(context.table);
  const rect = map.findCell(context.cellStart - context.tableStart);
  return rect.right === map.width && rect.bottom === map.height;
}

/**
 * Returns true when the current cell touches the top-left edge of the table.
 * @param {ReturnType<typeof getTableContext>} context
 * @returns {boolean}
 */
function isFirstCellInTable(context) {
  if (!context) return false;
  const map = TableMap.get(context.table);
  const rect = map.findCell(context.cellStart - context.tableStart);
  return rect.left === 0 && rect.top === 0;
}

/**
 * Finds the first text position inside a node.
 * @param {import('prosemirror-model').Node} node
 * @param {number} nodePos
 * @returns {number | null}
 */
function findFirstTextPosInNode(node, nodePos) {
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
 * Finds the last text position inside a node.
 * @param {import('prosemirror-model').Node} node
 * @param {number} nodePos
 * @returns {number | null}
 */
function findLastTextPosInNode(node, nodePos) {
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
 * Finds the first text position after a boundary, or null if no text node exists.
 * @param {import('prosemirror-state').EditorState} state
 * @param {number} boundaryPos
 * @returns {number | null}
 */
function findFirstTextPosAfterBoundary(state, boundaryPos) {
  const $boundary = state.doc.resolve(boundaryPos);
  const nextNode = $boundary.nodeAfter;
  if (!nextNode) return null;
  return findFirstTextPosInNode(nextNode, boundaryPos);
}

/**
 * Finds the last text position before a boundary, or null if no text node exists.
 * @param {import('prosemirror-state').EditorState} state
 * @param {number} boundaryPos
 * @returns {number | null}
 */
function findLastTextPosBeforeBoundary(state, boundaryPos) {
  const $boundary = state.doc.resolve(boundaryPos);
  const prevNode = $boundary.nodeBefore;
  if (!prevNode) return null;
  return findLastTextPosInNode(prevNode, boundaryPos - prevNode.nodeSize);
}

/**
 * Computes the selection to apply when a horizontal arrow key should exit a
 * table from the first or last cell. Returns null when no custom handling is
 * required and native/ProseMirror behavior should continue.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @param {-1 | 1} dir
 * @returns {import('prosemirror-state').Selection | null}
 */
export function getTableBoundaryExitSelection(state, dir) {
  const selection = state.selection;
  if (!selection.empty) return null;

  const context = getTableContext(selection.$head);
  if (!context) return null;

  if (dir > 0) {
    if (!isInLastParagraphOfCell(selection.$head, context.cellDepth)) return null;
    if (!isAtEffectiveParagraphEnd(selection.$head)) return null;
    if (!isLastCellInTable(context)) return null;

    const targetPos = findFirstTextPosAfterBoundary(state, context.tablePos + context.table.nodeSize);
    if (targetPos != null) {
      return TextSelection.create(state.doc, targetPos);
    }
    return (
      Selection.findFrom(state.doc.resolve(context.tablePos + context.table.nodeSize), 1, true) ??
      Selection.near(state.doc.resolve(context.tablePos + context.table.nodeSize), 1)
    );
  }

  if (!isInFirstParagraphOfCell(selection.$head, context.cellDepth)) return null;
  if (!isAtEffectiveParagraphStart(selection.$head)) return null;
  if (!isFirstCellInTable(context)) return null;

  const targetPos = findLastTextPosBeforeBoundary(state, context.tablePos);
  if (targetPos != null) {
    return TextSelection.create(state.doc, targetPos);
  }
  return (
    Selection.findFrom(state.doc.resolve(context.tablePos), -1, true) ??
    Selection.near(state.doc.resolve(context.tablePos), -1)
  );
}

/**
 * Computes the selection to apply when a horizontal arrow key should enter a
 * table from an adjacent paragraph. Returns null when no custom handling is
 * required and native/ProseMirror behavior should continue.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @param {-1 | 1} dir
 * @returns {import('prosemirror-state').Selection | null}
 */
export function getAdjacentTableEntrySelection(state, dir) {
  const selection = state.selection;
  if (!selection.empty) return null;

  const $head = selection.$head;
  const paragraphDepth = findAncestorDepth($head, (node) => node.type.name === 'paragraph');
  if (paragraphDepth < 0) return null;

  const boundaryPos = dir > 0 ? $head.end(paragraphDepth) + 1 : $head.start(paragraphDepth) - 1;
  const adjacentNode = dir > 0 ? state.doc.resolve(boundaryPos).nodeAfter : state.doc.resolve(boundaryPos).nodeBefore;

  if (!adjacentNode || adjacentNode.type.spec.tableRole !== 'table') return null;

  if (dir > 0) {
    if (!isAtEffectiveParagraphEnd($head)) return null;
    const targetPos = findFirstTextPosInNode(adjacentNode, boundaryPos);
    if (targetPos != null) {
      return TextSelection.create(state.doc, targetPos);
    }
    return (
      Selection.findFrom(state.doc.resolve(boundaryPos), 1, true) ?? Selection.near(state.doc.resolve(boundaryPos), 1)
    );
  }

  if (!isAtEffectiveParagraphStart($head)) return null;
  const tablePos = boundaryPos - adjacentNode.nodeSize;
  const targetPos = findLastTextPosInNode(adjacentNode, tablePos);
  if (targetPos != null) {
    return TextSelection.create(state.doc, targetPos);
  }
  return (
    Selection.findFrom(state.doc.resolve(tablePos + adjacentNode.nodeSize), -1, true) ??
    Selection.near(state.doc.resolve(tablePos + adjacentNode.nodeSize), -1)
  );
}

/**
 * Plugin key for horizontal table boundary navigation.
 */
export const TableBoundaryNavigationPluginKey = new PluginKey('tableBoundaryNavigation');

/**
 * Creates a plugin that exits the table when ArrowLeft/ArrowRight is pressed at
 * the effective start/end of the first/last cell.
 *
 * @returns {import('prosemirror-state').Plugin}
 */
export function createTableBoundaryNavigationPlugin() {
  return new Plugin({
    key: TableBoundaryNavigationPluginKey,
    props: {
      /**
       * @param {import('prosemirror-view').EditorView} view
       * @param {KeyboardEvent} event
       * @returns {boolean}
       */
      handleKeyDown(view, event) {
        if (event.defaultPrevented) return false;
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;

        const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return false;

        const nextSelection =
          getTableBoundaryExitSelection(view.state, /** @type {-1 | 1} */ (dir)) ??
          getAdjacentTableEntrySelection(view.state, /** @type {-1 | 1} */ (dir));
        if (!nextSelection) return false;

        view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView());
        event.preventDefault();
        return true;
      },
    },
  });
}
