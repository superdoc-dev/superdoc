/**
 * Extract adapter — produces a flat, RAG-friendly extraction of the entire
 * document: blocks with full text, comments, and tracked changes.
 *
 * Follows the same read-only adapter pattern as info-adapter.ts.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
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
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { trackChangesListWrapper } from './plan-engine/track-changes-wrappers.js';

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
 * Walk a table and emit each cell's block-level children as their own blocks,
 * tagged with `{ tableNodeId, rowIndex, colIndex }`. Table cells have no
 * spec-stable ID (w14:paraId is defined on w:p, not w:tc) but the paragraphs
 * inside every cell do, so we expose those.
 *
 * Nested tables recurse with their own coordinates — a nested table would
 * otherwise hit the same "cells concatenated into one string" bug the fix
 * targets, just one level deeper.
 */
function emitTable(
  tableNode: ProseMirrorNode,
  tablePos: number,
  tablePath: readonly number[],
  tableNodeId: string,
  blocks: ExtractBlock[],
): void {
  let rowOffset = 0;
  tableNode.forEach((rowNode, _unusedRowOffset, rowIndex) => {
    const rowPos = tablePos + 1 + rowOffset;
    rowOffset += rowNode.nodeSize;

    let cellOffset = 0;
    rowNode.forEach((cellNode, _unusedCellOffset, colIndex) => {
      const cellPos = rowPos + 1 + cellOffset;
      cellOffset += cellNode.nodeSize;

      const tableContext: ExtractTableContext = { tableNodeId, rowIndex, colIndex };

      let childOffset = 0;
      cellNode.forEach((childNode, _unusedChildOffset, childIndex) => {
        const childPos = cellPos + 1 + childOffset;
        childOffset += childNode.nodeSize;

        const childType = mapBlockNodeType(childNode);
        if (!childType) return;

        const childPath = [...tablePath, rowIndex, colIndex, childIndex];

        if (childType === 'table') {
          const nestedId = resolveBlockNodeId(childNode, childPos, 'table', childPath);
          if (nestedId) emitTable(childNode, childPos, childPath, nestedId, blocks);
          return;
        }

        const childId = resolveBlockNodeId(childNode, childPos, childType, childPath);
        if (childId) blocks.push(buildBlock(childNode, childId, childType, tableContext));
      });
    });
  });
}

function collectBlocks(editor: Editor): ExtractBlock[] {
  const blocks: ExtractBlock[] = [];
  const doc = editor.state.doc;

  // Walk doc children directly so the traversal path we thread into
  // resolveBlockNodeId matches the canonical PM child index used by
  // buildBlockIndex (a filtered index would diverge when unsupported
  // top-level nodes precede a table).
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const nodeType = mapBlockNodeType(child);
    const pos = offset;
    offset += child.nodeSize;

    if (!nodeType) continue;

    if (nodeType === 'table') {
      const tableNodeId = resolveBlockNodeId(child, pos, 'table', [i]);
      if (tableNodeId) emitTable(child, pos, [i], tableNodeId, blocks);
      continue;
    }

    const nodeId = resolveBlockNodeId(child, pos, nodeType, [i]);
    if (nodeId) blocks.push(buildBlock(child, nodeId, nodeType));
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
