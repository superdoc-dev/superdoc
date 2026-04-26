/**
 * Extract adapter - produces a flat, RAG-friendly extraction of the entire
 * document: blocks with full text, comments, and tracked changes.
 *
 * Tables are NOT returned as a single flattened block. Instead, the
 * paragraph-like descendants inside each cell are emitted in document order
 * with `tableContext` attached. Consumers group by `tableContext.tableOrdinal`
 * (whole table), `+ rowIndex` (row), or `+ columnIndex` (cell).
 *
 * Block SDTs (structured document tags / content controls) are transparent:
 * their children emit individually as if they were direct children of the
 * enclosing container. No wrapper `sdt` block is emitted. This prevents
 * SDT-wrapped tables from re-flattening through the wrapper's textContent.
 *
 * Follows the same read-only adapter pattern as info-adapter.ts.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';

import type { Editor } from '../core/Editor.js';
import type {
  ExtractInput,
  ExtractResult,
  ExtractBlock,
  ExtractTableContext,
  ExtractComment,
  ExtractTrackedChange,
  CommentsListQuery,
  BlockNodeType,
} from '@superdoc/document-api';
import { getHeadingLevel, mapBlockNodeType, resolveBlockNodeId } from './helpers/node-address-resolver.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { trackChangesListWrapper } from './plan-engine/track-changes-wrappers.js';

/**
 * Block types we emit individually (paragraph-granular).
 *
 * Keep in sync with the superset in `helpers/node-address-resolver.ts`
 * (`SUPPORTED_BLOCK_NODE_TYPES`). Deliberately excluded:
 *   - `table`, `tableRow`, `tableCell`: structural containers, handled by the
 *     table walk.
 *   - `sdt`: block SDTs are transparent (see module doc). Their children are
 *     walked as if they were direct children of the enclosing container.
 */
const EMITTABLE_BLOCK_TYPES: ReadonlySet<BlockNodeType> = new Set<BlockNodeType>([
  'paragraph',
  'heading',
  'listItem',
  'image',
  'tableOfContents',
]);

/** PM node type names that the walker treats as transparent block SDTs. */
const SDT_BLOCK_NODE_NAMES: ReadonlySet<string> = new Set(['structuredContentBlock', 'sdt']);

interface CellAnchor {
  cellNode: ProseMirrorNode;
  /** Position offset relative to the table content start (tablePos + 1). */
  cellOffset: number;
  /** 0-based physical row index within `tableNode.childCount`. */
  rowChildIndex: number;
  /** 0-based physical cell index within `row.childCount`. */
  cellChildIndexInRow: number;
  /** 0-based logical grid row from `TableMap`. */
  gridRowIndex: number;
  /**
   * 0-based logical grid column from `TableMap`. Can differ from
   * `cellChildIndexInRow` when earlier cells in the row carry `colspan > 1`
   * or when the row above spans down into this row's grid.
   */
  gridColumnIndex: number;
  rowspan: number;
  colspan: number;
}

/**
 * Walks a PM table and returns one entry per origin cell.
 *
 * Origin cells are the unique addressable cells:
 *   - Merged cells (rowspan/colspan > 1) appear once at their anchor, not
 *     once per grid slot they cover.
 *   - Vertical `vMerge="continue"` cells are folded into their origin during
 *     DOCX import (see super-converter/v3/handlers/w/tc/helpers), so they
 *     don't exist in the PM tree and don't need special handling here.
 *   - `gridBefore` / `gridAfter` placeholder cells (see
 *     super-converter/v3/handlers/w/tr/tr-helpers.js) are skipped via the
 *     `__placeholder` attr. They're synthetic layout artifacts with empty
 *     content and aren't user-addressable.
 *
 * Both physical child indexes and logical grid coordinates are returned:
 *   - Physical (`rowChildIndex`, `cellChildIndexInRow`) go into the traversal
 *     path so deterministic fallback IDs match `buildBlockIndex`.
 *   - Logical (`gridRowIndex`, `gridColumnIndex`) are exposed to consumers
 *     via `tableContext` so row/column grouping maps to the visible grid.
 */
function indexCellsForTable(tableNode: ProseMirrorNode): CellAnchor[] {
  const map = TableMap.get(tableNode);
  const anchors: CellAnchor[] = [];

  let rowOffset = 0;
  for (let rowChildIndex = 0; rowChildIndex < tableNode.childCount; rowChildIndex++) {
    const row = tableNode.child(rowChildIndex);
    let cellOffsetInRow = 0;

    for (let cellChildIndexInRow = 0; cellChildIndexInRow < row.childCount; cellChildIndexInRow++) {
      const cellNode = row.child(cellChildIndexInRow);
      // cellOffset is the offset from the table content start (tablePos + 1)
      // to this cell node. +1 skips the row's open token.
      const cellOffset = rowOffset + 1 + cellOffsetInRow;
      cellOffsetInRow += cellNode.nodeSize;

      const cellAttrs = cellNode.attrs as {
        rowspan?: number;
        colspan?: number;
        __placeholder?: string;
      };

      // Skip gridBefore/gridAfter placeholders - synthetic cells added at
      // import to preserve OOXML column layout. They contain an empty
      // paragraph but no user content.
      if (cellAttrs.__placeholder != null) continue;

      // Look up grid coordinates from TableMap. For a merged cell, indexOf
      // returns the first grid slot the cell occupies - its anchor position.
      const mapIndex = map.map.indexOf(cellOffset);
      if (mapIndex < 0) continue;

      anchors.push({
        cellNode,
        cellOffset,
        rowChildIndex,
        cellChildIndexInRow,
        gridRowIndex: Math.floor(mapIndex / map.width),
        gridColumnIndex: mapIndex % map.width,
        rowspan: cellAttrs.rowspan ?? 1,
        colspan: cellAttrs.colspan ?? 1,
      });
    }

    rowOffset += row.nodeSize;
  }

  return anchors;
}

/** Builds an `ExtractBlock` for a paragraph-like node. */
function buildBlock(
  node: ProseMirrorNode,
  pos: number,
  nodeType: BlockNodeType,
  path: readonly number[],
  tableContext?: ExtractTableContext,
): ExtractBlock | undefined {
  const nodeId = resolveBlockNodeId(node, pos, nodeType, path);
  if (!nodeId) return undefined;

  const pProps = (node.attrs as Record<string, unknown>).paragraphProperties as { styleId?: string } | undefined;
  const headingLevel = getHeadingLevel(pProps?.styleId);

  const block: ExtractBlock = {
    nodeId,
    type: nodeType,
    text: node.textContent,
  };
  if (headingLevel !== undefined) block.headingLevel = headingLevel;
  if (tableContext) block.tableContext = tableContext;
  return block;
}

interface OrdinalCounter {
  next: number;
}

interface NestedTableParent {
  tableOrdinal: number;
  rowIndex: number;
  columnIndex: number;
}

/**
 * Walks the immediate children of a block container (doc root, table cell,
 * or block SDT) and emits extract blocks for paragraph-like descendants.
 *
 * Three special cases:
 *   - A child `table` recurses into `collectTableExtractBlocks` with the
 *     current `nestedParent` attached.
 *   - A child block SDT is transparent: we recurse into its children with
 *     the same `tableContext` and `nestedParent`. No wrapper block emits.
 *   - Paragraph-like children emit a block and inherit `tableContext`.
 */
function collectContainerBlocks(
  container: ProseMirrorNode,
  contentStart: number,
  containerPath: readonly number[],
  ordinals: OrdinalCounter,
  tableContext?: ExtractTableContext,
  nestedParent?: NestedTableParent,
): ExtractBlock[] {
  const blocks: ExtractBlock[] = [];
  let childOffset = 0;

  for (let i = 0; i < container.childCount; i++) {
    const child = container.child(i);
    const childPos = contentStart + childOffset;
    childOffset += child.nodeSize;
    const childPath = [...containerPath, i];

    if (child.type.name === 'table') {
      blocks.push(...collectTableExtractBlocks(child, childPos, childPath, ordinals, nestedParent));
      continue;
    }

    if (SDT_BLOCK_NODE_NAMES.has(child.type.name)) {
      // Transparent descent: +1 skips the SDT's opening token so `contentStart`
      // points at the SDT's first child.
      blocks.push(...collectContainerBlocks(child, childPos + 1, childPath, ordinals, tableContext, nestedParent));
      continue;
    }

    const childType = mapBlockNodeType(child);
    if (childType && EMITTABLE_BLOCK_TYPES.has(childType)) {
      const block = buildBlock(child, childPos, childType, childPath, tableContext);
      if (block) blocks.push(block);
      continue;
    }

    // Unrecognized block wrapper with block-level children (e.g.
    // `documentSection`, `documentPartObject`, `shapeContainer`). Recurse
    // transparently so paragraphs inside these wrappers still surface in
    // extract output. Without this, content inside them would be silently
    // dropped: the pre-SD-2672 `textContent` walk included that text, and
    // the new walker must not regress coverage.
    if (!child.isLeaf && child.firstChild?.isBlock === true) {
      blocks.push(...collectContainerBlocks(child, childPos + 1, childPath, ordinals, tableContext, nestedParent));
    }
  }

  return blocks;
}

/**
 * Walks one table and emits an `ExtractBlock` for every paragraph-like
 * descendant of every origin cell, in document order. Recurses into nested
 * tables with a fresh `tableOrdinal` and a `parent*` reference.
 */
function collectTableExtractBlocks(
  tableNode: ProseMirrorNode,
  tablePos: number,
  tablePath: readonly number[],
  ordinals: OrdinalCounter,
  parent?: NestedTableParent,
): ExtractBlock[] {
  const tableOrdinal = ordinals.next++;
  const anchors = indexCellsForTable(tableNode);
  const blocks: ExtractBlock[] = [];

  for (const anchor of anchors) {
    // Cell content starts at tablePos + 1 (table open) + cellOffset (offset
    // to the cell node) + 1 (cell open).
    const cellContentStart = tablePos + 1 + anchor.cellOffset + 1;
    // Path uses physical indexes so deterministic fallback IDs match the
    // walk in buildBlockIndex (which uses the `index` arg of doc.descendants).
    const cellPath: readonly number[] = [...tablePath, anchor.rowChildIndex, anchor.cellChildIndexInRow];

    const tableContext: ExtractTableContext = {
      tableOrdinal,
      rowIndex: anchor.gridRowIndex,
      columnIndex: anchor.gridColumnIndex,
      rowspan: anchor.rowspan,
      colspan: anchor.colspan,
    };
    if (parent) {
      tableContext.parentTableOrdinal = parent.tableOrdinal;
      tableContext.parentRowIndex = parent.rowIndex;
      tableContext.parentColumnIndex = parent.columnIndex;
    }

    blocks.push(
      ...collectContainerBlocks(anchor.cellNode, cellContentStart, cellPath, ordinals, tableContext, {
        tableOrdinal,
        rowIndex: anchor.gridRowIndex,
        columnIndex: anchor.gridColumnIndex,
      }),
    );
  }

  return blocks;
}

function collectBlocks(editor: Editor): ExtractBlock[] {
  // doc is root - no opening token in the PM position model, content starts at 0.
  const ordinals: OrdinalCounter = { next: 0 };
  return collectContainerBlocks(editor.state.doc, 0, [], ordinals);
}

function collectComments(editor: Editor): ExtractComment[] {
  const commentsAdapter = createCommentsWrapper(editor);
  const result = commentsAdapter.list({ includeResolved: true } as CommentsListQuery);

  return result.items.map((item) => {
    const comment: ExtractComment = {
      entityId: item.address.entityId,
      status: item.status,
    };
    if (item.text) comment.text = item.text;
    if (item.anchoredText) comment.anchoredText = item.anchoredText;
    if (item.target?.segments?.[0]?.blockId) comment.blockId = item.target.segments[0].blockId;
    if (item.creatorName) comment.author = item.creatorName;
    return comment;
  });
}

function collectTrackedChanges(editor: Editor): ExtractTrackedChange[] {
  const result = trackChangesListWrapper(editor);

  return result.items.map((item) => {
    const tc: ExtractTrackedChange = {
      entityId: item.address.entityId,
      type: item.type,
    };
    if (item.excerpt) tc.excerpt = item.excerpt;
    if (item.author) tc.author = item.author;
    if (item.date) tc.date = item.date;
    return tc;
  });
}

export function extractAdapter(editor: Editor, _input: ExtractInput): ExtractResult {
  return {
    blocks: collectBlocks(editor),
    comments: collectComments(editor),
    trackedChanges: collectTrackedChanges(editor),
    revision: getRevision(editor),
  };
}
