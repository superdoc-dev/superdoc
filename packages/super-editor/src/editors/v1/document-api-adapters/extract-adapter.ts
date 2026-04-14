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
import { getHeadingLevel } from './helpers/node-address-resolver.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { collectTopLevelBlocks } from './plan-engine/blocks-wrappers.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { trackChangesListWrapper } from './plan-engine/track-changes-wrappers.js';

function collectBlocks(editor: Editor): ExtractBlock[] {
  const candidates = collectTopLevelBlocks(editor);

  return candidates.map((candidate) => {
    const pProps = (candidate.node.attrs as Record<string, unknown>).paragraphProperties as
      | { styleId?: string }
      | undefined;
    const headingLevel = getHeadingLevel(pProps?.styleId);

    const block: ExtractBlock = {
      nodeId: candidate.nodeId,
      type: candidate.nodeType,
      text: candidate.node.textContent,
    };
    if (headingLevel !== undefined) block.headingLevel = headingLevel;
    return block;
  });
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
