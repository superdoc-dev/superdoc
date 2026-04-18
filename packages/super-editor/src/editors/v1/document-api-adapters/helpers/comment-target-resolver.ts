import type { Editor } from '../../core/Editor.js';
import type { TextAddress } from '@superdoc/document-api';
import { getInlineIndex } from './index-cache.js';
import type { InlineCandidate } from './inline-address-resolver.js';
import { resolveCommentIdFromAttrs, toNonEmptyString } from './value-utils.js';

export type CommentAnchorStatus = 'open' | 'resolved';

export interface CommentAnchor {
  commentId: string;
  importedId?: string;
  status: CommentAnchorStatus;
  target: TextAddress;
  isInternal?: boolean;
  pos: number;
  end: number;
  attrs: Record<string, unknown>;
}

function resolveCommentId(candidate: InlineCandidate): string | undefined {
  return resolveCommentIdFromAttrs(candidate.attrs ?? {});
}

function resolveImportedId(candidate: InlineCandidate): string | undefined {
  const attrs = candidate.attrs ?? {};
  return toNonEmptyString(attrs.importedId);
}

function toTextAddress(candidate: InlineCandidate): TextAddress | null {
  const { start, end } = candidate.anchor;
  if (start.blockId !== end.blockId) return null;

  return {
    kind: 'text',
    blockId: start.blockId,
    range: {
      start: start.offset,
      end: end.offset,
    },
  };
}

export function listCommentAnchors(editor: Editor): CommentAnchor[] {
  const inlineIndex = getInlineIndex(editor);
  const candidates = inlineIndex.byType.get('comment') ?? [];
  const anchors: CommentAnchor[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const commentId = resolveCommentId(candidate);
    if (!commentId) continue;

    const target = toTextAddress(candidate);
    if (!target) continue;

    const dedupeKey = `${commentId}|${target.blockId}:${target.range.start}:${target.range.end}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const attrs = (candidate.attrs ?? {}) as Record<string, unknown>;
    const isInternal = typeof attrs.internal === 'boolean' ? attrs.internal : undefined;
    const status: CommentAnchorStatus = candidate.mark ? 'open' : 'resolved';

    anchors.push({
      commentId,
      importedId: resolveImportedId(candidate),
      status,
      target,
      isInternal,
      pos: candidate.pos,
      end: candidate.end,
      attrs,
    });
  }

  return anchors;
}

export function resolveCommentAnchorsById(editor: Editor, commentId: string): CommentAnchor[] {
  return listCommentAnchors(editor).filter(
    (anchor) => anchor.commentId === commentId || anchor.importedId === commentId,
  );
}
