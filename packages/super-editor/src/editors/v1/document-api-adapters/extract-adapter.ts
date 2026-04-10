/**
 * Extract adapter — produces a flat, RAG-friendly extraction of the entire
 * document: blocks with full text, comments, and tracked changes.
 *
 * Follows the same read-only adapter pattern as info-adapter.ts.
 */

import type { Editor } from '../core/Editor.js';
import type {
  ExtractInput,
  ExtractResult,
  ExtractBlock,
  ExtractComment,
  ExtractTrackedChange,
  CommentsListQuery,
} from '@superdoc/document-api';
import { mapBlockNodeType, resolveBlockNodeId } from './helpers/node-address-resolver.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { trackChangesListWrapper } from './plan-engine/track-changes-wrappers.js';

const HEADING_PATTERN = /^Heading(\d)$/;

function collectBlocks(editor: Editor): ExtractBlock[] {
  const doc = editor.state.doc;
  const blocks: ExtractBlock[] = [];

  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const nodeType = mapBlockNodeType(child);
    const pos = offset;

    if (nodeType) {
      const nodeId = resolveBlockNodeId(child, pos, nodeType, [i]);

      if (nodeId) {
        const text = child.textContent;

        let headingLevel: number | undefined;
        const pProps = (child.attrs as Record<string, unknown>).paragraphProperties as { styleId?: string } | undefined;
        const styleId = pProps?.styleId;
        if (typeof styleId === 'string') {
          const m = HEADING_PATTERN.exec(styleId);
          if (m) headingLevel = parseInt(m[1], 10);
        }

        const block: ExtractBlock = { nodeId, type: nodeType, text };
        if (headingLevel !== undefined) block.headingLevel = headingLevel;
        blocks.push(block);
      }
    }
    offset += child.nodeSize;
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
