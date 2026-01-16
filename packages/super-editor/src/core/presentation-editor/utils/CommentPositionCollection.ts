import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';

export type CommentPosition = { threadId: string; start: number; end: number };

export function collectCommentPositions(
  doc: ProseMirrorNode | null,
  options: { commentMarkName: string; trackChangeMarkNames: string[] },
): Record<string, CommentPosition> {
  if (!doc) {
    return {};
  }

  const pmPositions: Record<string, CommentPosition> = {};

  doc.descendants((node, pos) => {
    const marks = node.marks || [];

    for (const mark of marks) {
      const threadId = getThreadIdFromMark(mark, options);
      if (!threadId) continue;

      const nodeEnd = pos + node.nodeSize;

      if (!pmPositions[threadId]) {
        pmPositions[threadId] = { threadId, start: pos, end: nodeEnd };
      } else {
        pmPositions[threadId].start = Math.min(pmPositions[threadId].start, pos);
        pmPositions[threadId].end = Math.max(pmPositions[threadId].end, nodeEnd);
      }
    }
  });

  return pmPositions;
}

function getThreadIdFromMark(
  mark: Mark,
  options: { commentMarkName: string; trackChangeMarkNames: string[] },
): string | undefined {
  if (mark.type.name === options.commentMarkName) {
    return mark.attrs.commentId || mark.attrs.importedId;
  }

  if (options.trackChangeMarkNames.includes(mark.type.name)) {
    return mark.attrs.id;
  }

  return undefined;
}
