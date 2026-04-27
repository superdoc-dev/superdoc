import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { BODY_STORY_KEY } from '../../../document-api-adapters/story-runtime/story-key.js';
import {
  makeCommentAnchorKey,
  makeTrackedChangeAnchorKey,
} from '../../../document-api-adapters/helpers/tracked-change-runtime-ref.js';

export type CommentPosition = {
  threadId: string;
  key: string;
  storyKey: string;
  kind: 'trackedChange' | 'comment';
  start: number;
  end: number;
};

export interface CollectCommentPositionsOptions {
  commentMarkName: string;
  trackChangeMarkNames: string[];
  storyKey?: string;
}

export function collectCommentPositions(
  doc: ProseMirrorNode | null,
  options: CollectCommentPositionsOptions,
): Record<string, CommentPosition> {
  if (!doc) {
    return {};
  }

  const storyKey = options.storyKey ?? BODY_STORY_KEY;
  const positions: Record<string, CommentPosition> = {};

  doc.descendants((node, pos) => {
    const marks = node.marks || [];

    for (const mark of marks) {
      const descriptor = describeThreadMark(mark, options);
      if (!descriptor) continue;

      const canonicalKey =
        descriptor.kind === 'trackedChange'
          ? makeTrackedChangeAnchorKey({ storyKey, rawId: descriptor.rawId })
          : makeCommentAnchorKey(descriptor.rawId);
      const storageKey = descriptor.kind === 'trackedChange' ? canonicalKey : descriptor.rawId;
      const nodeEnd = pos + node.nodeSize;
      const existing = positions[storageKey];

      if (!existing) {
        positions[storageKey] = {
          threadId: descriptor.rawId,
          key: canonicalKey,
          storyKey,
          kind: descriptor.kind,
          start: pos,
          end: nodeEnd,
        };
        continue;
      }

      existing.start = Math.min(existing.start, pos);
      existing.end = Math.max(existing.end, nodeEnd);
    }
  });

  return positions;
}

interface ThreadMarkDescriptor {
  rawId: string;
  kind: 'trackedChange' | 'comment';
}

function describeThreadMark(mark: Mark, options: CollectCommentPositionsOptions): ThreadMarkDescriptor | undefined {
  if (mark.type.name === options.commentMarkName) {
    const commentId = (mark.attrs.commentId as string | undefined) ?? (mark.attrs.importedId as string | undefined);
    if (!commentId) return undefined;
    return { rawId: commentId, kind: 'comment' };
  }

  if (options.trackChangeMarkNames.includes(mark.type.name)) {
    const rawId = mark.attrs.id as string | undefined;
    if (!rawId) return undefined;
    return { rawId, kind: 'trackedChange' };
  }

  return undefined;
}
