import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorAdapter } from '../core/EditorAdapter';
import type { Comment, SelectionInfo, TrackedChange } from '../core/types';
import { CommentCard } from './CommentCard';
import { CommentComposer } from './CommentComposer';
import { TrackedChangeCard } from './TrackedChangeCard';

interface Props {
  adapter: EditorAdapter;
  currentAuthorId: string;
}

export function CommentsSidebar({ adapter, currentAuthorId }: Props) {
  const [comments, setComments] = useState<Comment[]>(() => adapter.listComments());
  const [trackedChanges, setTrackedChanges] = useState<TrackedChange[]>(() => adapter.listTrackedChanges());
  const [selection, setSelection] = useState<SelectionInfo>(() => adapter.getSelection());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => adapter.onCommentsChange(setComments), [adapter]);
  useEffect(() => adapter.onTrackedChangesChange(setTrackedChanges), [adapter]);
  useEffect(() => adapter.onSelectionChange(setSelection), [adapter]);

  // When a comment becomes active, mark the inline range. The editors
  // stamp comment ids differently: TipTap's CommentMark emits
  // `data-comment-id="<id>"` on a single span; SuperDoc's highlight
  // decorator emits `data-comment-ids="<id1>,<id2>,..."` (a single span
  // can carry multiple overlapping threads). We check both shapes so
  // the same sidebar works for either editor.
  useEffect(() => {
    // Search the whole document since TipTap mounts under .doc-surface
    // and SuperDoc mounts under its own paginated host.
    document
      .querySelectorAll('[data-comment-id].is-active, [data-comment-ids].is-active')
      .forEach((el) => el.classList.remove('is-active'));
    if (!activeId) return;
    // TipTap: exact match.
    document
      .querySelectorAll(`[data-comment-id="${activeId}"]`)
      .forEach((el) => el.classList.add('is-active'));
    // SuperDoc: comma-separated list — match the id anywhere in the list.
    document.querySelectorAll('[data-comment-ids]').forEach((el) => {
      const ids = (el.getAttribute('data-comment-ids') ?? '').split(',');
      if (ids.includes(activeId)) el.classList.add('is-active');
    });
  }, [activeId, comments]);

  const handleCardClick = (c: Comment) => {
    setActiveId(c.id);
    // Prefer the engine-native scroll-to-comment (handles multi-page
    // SuperDoc layouts). Falls back to range-based scroll if it no-ops.
    void adapter.scrollToComment(c.id);
  };

  const submitComment = (body: string) => {
    if (!selection.range) return;
    const c = adapter.addComment({ body, range: selection.range, authorId: currentAuthorId });
    setComposing(false);
    // addComment returns null when the engine rejects the insert (no
    // selection, non-success receipt, thrown resolver, etc). Surface the
    // failure instead of leaving a stale composer behind.
    if (c) setActiveId(c.id);
  };

  // Merge comments + tracked changes into a single chronological feed so
  // the sidebar tells one story. Each item carries a discriminator.
  const feed = useMemo(() => {
    type Item =
      | { type: 'comment'; at: number; comment: Comment }
      | { type: 'change'; at: number; change: TrackedChange };
    const items: Item[] = [
      ...comments.map((c) => ({ type: 'comment' as const, at: Date.parse(c.createdAt) || 0, comment: c })),
      ...trackedChanges.map((c) => ({ type: 'change' as const, at: Date.parse(c.createdAt) || 0, change: c })),
    ];
    items.sort((a, b) => b.at - a.at);
    return items;
  }, [comments, trackedChanges]);

  const canCompose = selection.range !== null && !selection.empty;
  const openCount = comments.filter((c) => !c.resolved).length + trackedChanges.length;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Activity</span>
        <span className="count">{openCount} open</span>
      </div>
      <div className="sidebar-body" ref={bodyRef}>
        {composing && selection.range && (
          <CommentComposer
            quotedText={selection.quotedText}
            onSubmit={submitComment}
            onCancel={() => setComposing(false)}
          />
        )}
        {!composing && canCompose && (
          <button className="btn-primary" onClick={() => setComposing(true)}>
            + Comment on selection
          </button>
        )}
        {feed.length === 0 && !composing && (
          <div className="sidebar-empty">
            Select text in the document, then add a comment.
          </div>
        )}
        {feed.map((item) => item.type === 'comment' ? (
          <CommentCard
            key={`c:${item.comment.id}`}
            comment={item.comment}
            active={activeId === item.comment.id}
            onClick={() => handleCardClick(item.comment)}
            onResolve={() => adapter.updateComment(item.comment.id, { resolved: true })}
            onReopen={() => adapter.updateComment(item.comment.id, { resolved: false })}
            onDelete={() => {
              adapter.deleteComment(item.comment.id);
              if (activeId === item.comment.id) setActiveId(null);
            }}
          />
        ) : (
          <TrackedChangeCard
            key={`tc:${item.change.id}`}
            change={item.change}
            onClick={() => void adapter.scrollToChange(item.change.id)}
            onAccept={() => adapter.acceptChange(item.change.id)}
            onReject={() => adapter.rejectChange(item.change.id)}
          />
        ))}
      </div>
    </aside>
  );
}
