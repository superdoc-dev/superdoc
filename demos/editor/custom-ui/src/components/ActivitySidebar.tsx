import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommentsListResult, TrackChangeInfo } from 'superdoc/ui';
import {
  useSuperDocComments,
  useSuperDocSelection,
  useSuperDocTrackChanges,
  useSuperDocUI,
} from 'superdoc/ui/react';
import { CommentComposer } from './CommentComposer';
import type { DecidedChange, DecidedChangesState } from './useDecidedChanges';

type CommentItem = CommentsListResult['items'][number];

/**
 * Local merged-feed item. The controller exposes comments and tracked
 * changes as separate slices (`ui.comments` / `ui.trackChanges`) so
 * each consumer can decide whether to merge them. This panel wants the
 * Google-Docs-style single feed, so we compose the two locally.
 */
type ActivityItem =
  | { kind: 'comment'; id: string; comment: CommentItem }
  | { kind: 'change'; id: string; change: TrackChangeInfo };

interface Props {
  /** When true, render the inline composer at the top of the panel. */
  composeOpen: boolean;
  /** Close the composer without posting. */
  onCloseComposer(): void;
  /**
   * Shared decided-changes store. The accept/reject buttons on each
   * card and the right-click context menu both route through the
   * store's `decideChange` so a tracked-change decision shows up in
   * the Resolved section regardless of which surface fired it.
   */
  decided: DecidedChangesState;
}

/**
 * Single Activity feed merging comments + tracked changes in document
 * order. Composes `ui.comments.items` and `ui.trackChanges.items` so
 * the panel renders one card per row regardless of source.
 *
 * Active-card highlight is driven by the document selection: clicking
 * a comment or tracked change in the editor surfaces the matching id
 * via `ui.selection.activeCommentIds` / `activeChangeIds`, and the
 * panel highlights that card and scrolls it into view.
 */
export function ActivitySidebar({ composeOpen, onCloseComposer, decided }: Props) {
  const ui = useSuperDocUI();
  const comments = useSuperDocComments();
  const trackChanges = useSuperDocTrackChanges();
  const selection = useSuperDocSelection();

  // Decided-changes state is owned by the parent (App) via
  // `useDecidedChanges` so the right-click context menu can dispatch
  // through the same `decideChange` and the Resolved audit row shows
  // up regardless of which surface fired the decision.
  const { decidedChanges, decideChange } = decided;

  // Track which entity (if any) is currently under the editor cursor.
  const activeEntityId = useMemo<string | null>(() => {
    if (selection.activeCommentIds.length > 0) return selection.activeCommentIds[0]!;
    if (selection.activeChangeIds.length > 0) return selection.activeChangeIds[0]!;
    return null;
  }, [selection.activeCommentIds, selection.activeChangeIds]);

  // Merge the two slices into a single local feed. Comments are
  // emitted in `comments.list()` order, then tracked changes in
  // `trackChanges.list()` order. When `TrackChangeInfo.target` lands
  // (separate ticket), we'll be able to interleave by document
  // position; until then this stable two-bucket ordering matches what
  // the controller used to do internally.
  const feed = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const c of comments.items) items.push({ kind: 'comment', id: c.id, comment: c });
    for (const tc of trackChanges.items) items.push({ kind: 'change', id: tc.id, change: tc.change });
    return items;
  }, [comments.items, trackChanges.items]);

  // Partition the feed into active vs resolved-comment buckets, and
  // fold reply comments under their parent. Word/Google Docs thread a
  // comment by `parentCommentId` (DOCX persists this in
  // commentsExtended.xml as `paraIdParent`). The doc-api surfaces
  // `parentCommentId` on each item; we group it here so the sidebar
  // renders one card per thread root with its replies stacked under
  // it. Replies whose parent is missing (resolved or pruned) fall
  // back to top-level so we don't lose them.
  const { active, resolvedComments } = useMemo(() => {
    const a: ActivityItem[] = [];
    const r: ActivityItem[] = [];
    const commentRoots = new Set<string>();
    for (const item of feed) {
      if (item.kind === 'comment') {
        const c = item.comment as { parentCommentId?: string };
        if (!c.parentCommentId) commentRoots.add(item.id);
      }
    }
    for (const item of feed) {
      const isResolvedComment =
        item.kind === 'comment' && (item.comment as { status?: string }).status === 'resolved';
      if (item.kind === 'comment') {
        const c = item.comment as { parentCommentId?: string };
        if (c.parentCommentId && commentRoots.has(c.parentCommentId)) continue;
      }
      if (isResolvedComment) r.push(item);
      else a.push(item);
    }
    return { active: a, resolvedComments: r };
  }, [feed]);

  // Replies indexed by parent id. Built once per snapshot.
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const item of feed) {
      if (item.kind !== 'comment') continue;
      const c = item.comment as { parentCommentId?: string };
      if (!c.parentCommentId) continue;
      const list = map.get(c.parentCommentId) ?? [];
      list.push(item);
      map.set(c.parentCommentId, list);
    }
    return map;
  }, [feed]);

  // Auto-scroll the matching card into view when the active entity changes.
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeEntityId || !containerRef.current) return;
    const card = containerRef.current.querySelector(`[data-card-id="${CSS.escape(activeEntityId)}"]`);
    if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeEntityId]);

  if (!ui) {
    return <div className="card">Loading editor…</div>;
  }

  const decidedList = [...decidedChanges.values()].sort((a, b) => b.decidedAt - a.decidedAt);
  const resolvedCount = resolvedComments.length + decidedList.length;
  const empty = active.length === 0 && resolvedCount === 0 && !composeOpen;

  return (
    <div ref={containerRef} className="activity">
      {composeOpen && (
        <CommentComposer
          onCancel={onCloseComposer}
          onPosted={(_commentId) => onCloseComposer()}
        />
      )}

      {empty && <div className="card">No comments or tracked changes.</div>}

      {active.length > 0 && (
        <>
          <div className="activity-section-label">Active · {active.length}</div>
          {active.map((item) => (
            <ActivityCard
              key={item.id}
              item={item}
              active={item.id === activeEntityId}
              resolved={false}
              replies={item.kind === 'comment' ? repliesByParent.get(item.id) : undefined}
              onDecideChange={decideChange}
              onClick={() => {
                if (item.kind === 'comment') ui.comments.scrollTo(item.id);
                else ui.trackChanges.scrollTo(item.id);
              }}
            />
          ))}
        </>
      )}

      {resolvedCount > 0 && (
        <>
          <div className="activity-section-label muted">Resolved · {resolvedCount}</div>
          {resolvedComments.map((item) => (
            <ActivityCard
              key={item.id}
              item={item}
              active={item.id === activeEntityId}
              resolved
              replies={repliesByParent.get(item.id)}
              onDecideChange={decideChange}
              onClick={() => ui.comments.scrollTo(item.id)}
            />
          ))}
          {decidedList.map((entry) => (
            <DecidedChangeCard key={entry.id} entry={entry} />
          ))}
        </>
      )}
    </div>
  );
}

interface CardProps {
  item: ActivityItem;
  active: boolean;
  resolved: boolean;
  replies?: ActivityItem[];
  onClick(): void;
  onDecideChange(id: string, decision: 'accepted' | 'rejected'): void;
}

function ActivityCard({ item, active, resolved, replies, onClick, onDecideChange }: CardProps) {
  const ui = useSuperDocUI()!;
  const className = ['card', active ? 'active' : '', resolved ? 'resolved' : ''].filter(Boolean).join(' ');

  return (
    <div className={className} data-card-id={item.id} onClick={onClick}>
      {item.kind === 'comment' ? (
        <CommentBody comment={item.comment} resolved={resolved} replies={replies} ui={ui} />
      ) : (
        <ChangeBody change={item.change} onDecide={(decision) => onDecideChange(item.id, decision)} />
      )}
    </div>
  );
}

function CommentBody({
  comment,
  resolved,
  replies,
  ui,
}: {
  comment: CommentItem;
  resolved: boolean;
  replies?: ActivityItem[];
  ui: NonNullable<ReturnType<typeof useSuperDocUI>>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);

  const author = comment.creatorName ?? comment.creatorEmail ?? 'Unknown';
  const time = comment.createdTime
    ? new Date(comment.createdTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const openReply = () => {
    setReplyOpen(true);
    setReplyText('');
    queueMicrotask(() => replyInputRef.current?.focus());
  };

  const cancelReply = () => {
    setReplyOpen(false);
    setReplyText('');
  };

  const postReply = () => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const receipt = ui.comments.reply(comment.id, { text: replyText.trim() });
      if (receipt.success) {
        cancelReply();
      } else {
        console.error('[ActivitySidebar] reply rejected', receipt);
      }
    } catch (err) {
      console.error('[ActivitySidebar] reply failed', err);
    } finally {
      setReplying(false);
    }
  };

  return (
    <>
      <div className="card-header">
        <span className="avatar" style={{ background: avatarColor(author) }}>{initials(author)}</span>
        <span className="author">{author}</span>
        <span className="timestamp">{time}</span>
      </div>
      {comment.anchoredText ? <div className="quote">“{comment.anchoredText}”</div> : null}
      <div className="body">{comment.text}</div>
      {replies && replies.length > 0 ? (
        <ul className="thread-replies">
          {replies.map((r) => {
            if (r.kind !== 'comment') return null;
            const reply = r.comment;
            const a = reply.creatorName ?? reply.creatorEmail ?? 'Unknown';
            return (
              <li key={r.id} className="thread-reply" data-card-id={r.id}>
                <span className="avatar avatar-sm" style={{ background: avatarColor(a) }}>
                  {initials(a)}
                </span>
                <div className="thread-reply-body">
                  <span className="author">{a}</span>
                  <span className="thread-reply-text">{reply.text}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {replyOpen ? (
        <div className="reply-composer" onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={replyInputRef}
            className="reply-input"
            rows={2}
            placeholder="Write a reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postReply();
              if (e.key === 'Escape') cancelReply();
            }}
          />
          <div className="reply-actions">
            <button onClick={cancelReply}>Cancel</button>
            <button
              className="primary"
              disabled={replying || !replyText.trim()}
              onClick={postReply}
            >
              {replying ? 'Posting…' : 'Reply'}
            </button>
          </div>
        </div>
      ) : null}
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {resolved ? (
          <button className="primary" onClick={() => ui.comments.reopen(comment.id)}>
            Reopen
          </button>
        ) : (
          <>
            <button onClick={() => ui.comments.resolve(comment.id)}>Resolve</button>
            {!replyOpen && (
              <button onClick={openReply}>Reply</button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function ChangeBody({
  change,
  onDecide,
}: {
  change: TrackChangeInfo;
  onDecide: (decision: 'accepted' | 'rejected') => void;
}) {
  const kind = change.type === 'insert' ? 'insertion' : change.type === 'delete' ? 'deletion' : 'format';
  const author = change.author ?? change.authorEmail ?? 'Unknown';
  return (
    <>
      <div className="card-header">
        <span className={`change-badge ${kind}`}>{kind}</span>
        <span className="author">{author}</span>
      </div>
      {change.excerpt ? <div className="quote">“{change.excerpt}”</div> : null}
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        <button className="primary" onClick={() => onDecide('accepted')}>Accept</button>
        <button className="danger" onClick={() => onDecide('rejected')}>Reject</button>
      </div>
    </>
  );
}

/**
 * Resolved-section row for a tracked change the user already
 * accepted/rejected. The live `ui.trackChanges` feed drops decided
 * changes (the row is gone from the document either way), so this row
 * is rendered from the local snapshot we captured before deciding —
 * mimicking the Google Docs "Suggestion accepted" trail.
 */
function DecidedChangeCard({ entry }: { entry: DecidedChange }) {
  const kind = entry.snapshot.type === 'insert' ? 'insertion' : entry.snapshot.type === 'delete' ? 'deletion' : 'format';
  const author = entry.snapshot.author ?? entry.snapshot.authorEmail ?? 'Unknown';
  const time = new Date(entry.decidedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="card resolved" data-card-id={entry.id}>
      <div className="card-header">
        <span className={`change-badge ${kind}`}>{kind}</span>
        <span className="author">{author}</span>
        <span className="timestamp">{time}</span>
      </div>
      {entry.snapshot.excerpt ? <div className="quote">“{entry.snapshot.excerpt}”</div> : null}
      <div className="body" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Suggestion {entry.decision}
      </div>
    </div>
  );
}

/** Tiny deterministic avatar color so multiple commenters render distinctly. */
function avatarColor(key: string): string {
  const palette = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  return palette[hash % palette.length]!;
}
