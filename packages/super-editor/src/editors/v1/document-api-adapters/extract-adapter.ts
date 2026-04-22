/**
 * Extract adapter — produces a flat, RAG-friendly extraction of the entire
 * document: blocks with full text, comments, and tracked changes.
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
  ExtractComment,
  ExtractTrackedChange,
  ExtractTableContext,
  CommentsListQuery,
} from '@superdoc/document-api';
import { getHeadingLevel, mapBlockNodeType, resolveBlockNodeId } from './helpers/node-address-resolver.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { collectTopLevelBlocks } from './plan-engine/blocks-wrappers.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { trackChangesListWrapper } from './plan-engine/track-changes-wrappers.js';

/**
 * Block-level node types that wrap other blocks without introducing their own
 * navigable content (structured document tags / content controls). Recurse
 * through these transparently so their inner paragraphs are emitted with the
 * enclosing cell's tableContext.
 */
const TRANSPARENT_WRAPPER_TYPES: ReadonlySet<string> = new Set(['sdt', 'structuredContentBlock']);

function buildBlock(
  node: ProseMirrorNode,
  nodeId: string,
  nodeType: string,
  tableContext?: ExtractTableContext,
): ExtractBlock {
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

/**
 * Emit every block-level child of `container` into `blocks`. Paragraph-like
 * children become their own ExtractBlock (tagged with `tableContext` when
 * passed). Nested tables re-enter `collectFromTable` with their own
 * coordinates. SDT/content-control wrappers are transparent and do not reset
 * `tableContext`.
 */
function emitFromContainer(
  container: ProseMirrorNode,
  containerPos: number,
  containerPath: readonly number[],
  tableContext: ExtractTableContext | undefined,
  blocks: ExtractBlock[],
): void {
  let childOffset = 0;
  container.forEach((childNode, _unusedOffset, childIndex) => {
    const childPos = containerPos + 1 + childOffset;
    const childPath = [...containerPath, childIndex];
    const childType = mapBlockNodeType(childNode);

    if (!childType) {
      childOffset += childNode.nodeSize;
      return;
    }

    if (childType === 'table') {
      const nestedNodeId = resolveBlockNodeId(childNode, childPos, 'table', childPath);
      if (nestedNodeId) {
        collectFromTable(childNode, childPos, childPath, nestedNodeId, blocks);
      }
      childOffset += childNode.nodeSize;
      return;
    }

    if (TRANSPARENT_WRAPPER_TYPES.has(childType)) {
      emitFromContainer(childNode, childPos, childPath, tableContext, blocks);
      childOffset += childNode.nodeSize;
      return;
    }

    const childId = resolveBlockNodeId(childNode, childPos, childType, childPath);
    if (childId) {
      blocks.push(buildBlock(childNode, childId, childType, tableContext));
    }
    childOffset += childNode.nodeSize;
  });
}

/**
 * Walk a table and emit each cell's block-level children as their own blocks,
 * tagged with `{ tableNodeId, rowIndex, colIndex }`. Table cells have no
 * spec-stable ID (w14:paraId is defined on w:p, not w:tc) but the paragraphs
 * inside every cell do, so we expose those.
 *
 * `colIndex` is the cell's logical column in the table grid — computed from
 * `TableMap` so that `gridSpan` / merged cells produce correct coordinates.
 */
function collectFromTable(
  tableNode: ProseMirrorNode,
  tablePos: number,
  tablePath: readonly number[],
  tableNodeId: string,
  blocks: ExtractBlock[],
): void {
  let tableMap: TableMap | undefined;
  try {
    tableMap = TableMap.get(tableNode);
  } catch {
    // Fall through to ordinal-based colIndex for malformed tables.
  }

  let rowOffset = 0;
  tableNode.forEach((rowNode, _unusedRowOffset, rowIndex) => {
    const rowPos = tablePos + 1 + rowOffset;
    const rowPath = [...tablePath, rowIndex];

    let cellOffset = 0;
    rowNode.forEach((cellNode, _unusedCellOffset, cellChildIndex) => {
      const cellPos = rowPos + 1 + cellOffset;
      const cellPath = [...rowPath, cellChildIndex];

      // Logical column from the table grid. TableMap.map is a flat
      // [cellPos0, cellPos1, ...] indexed by rowIndex * width + colIndex;
      // each merged cell appears at every covered slot. indexOf() finds the
      // first (origin) slot the cell occupies — i.e. its logical column.
      let colIndex = cellChildIndex;
      if (tableMap) {
        const cellPosRelativeToTableContent = cellPos - tablePos - 1;
        const flatIdx = tableMap.map.indexOf(cellPosRelativeToTableContent);
        if (flatIdx >= 0) colIndex = flatIdx % tableMap.width;
      }

      emitFromContainer(cellNode, cellPos, cellPath, { tableNodeId, rowIndex, colIndex }, blocks);

      cellOffset += cellNode.nodeSize;
    });
    rowOffset += rowNode.nodeSize;
  });
}

function collectBlocks(editor: Editor): ExtractBlock[] {
  const candidates = collectTopLevelBlocks(editor);
  const blocks: ExtractBlock[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.nodeType === 'table') {
      collectFromTable(candidate.node, candidate.pos, [i], candidate.nodeId, blocks);
      continue;
    }
    blocks.push(buildBlock(candidate.node, candidate.nodeId, candidate.nodeType));
  }

  return blocks;
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
