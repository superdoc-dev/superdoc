import { useEffect, useMemo, useRef, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import type { ReviewItem, ReviewSlice } from 'superdoc/ui';
import { useSuperDocHost, useSuperDocReview, useSuperDocSelection, useSuperDocUI } from 'superdoc/ui/react';
import { CommentComposer } from './CommentComposer';

type ReviewCommentItem = Extract<ReviewItem, { kind: 'comment' }>;
type ReviewChangeItem = Extract<ReviewItem, { kind: 'change' }>;
type ReviewComment = ReviewCommentItem['comment'];
type ReviewChange = ReviewChangeItem['change'];

interface Props {
  /** When true, render the inline composer at the top of the panel. */
  composeOpen: boolean;
  /** Close the composer without posting. */
  onCloseComposer(): void;
}

/**
 * Single Activity feed merging comments + tracked changes in document
 * order. Replaces the earlier dual Comments/Review tab split — that
 * was an internal-tooling convention; consumers want one panel showing
 * everything that needs attention.
 *
 * Active-card highlight is driven by the document selection: clicking
 * a comment or tracked change in the editor surfaces the matching id
 * via `ui.selection.activeCommentIds` / `activeChangeIds`, and the
 * panel highlights that card and scrolls it into view. No separate
 * event needed — SD-2792 already exposed the active ids on the
 * selection slice.
 */
interface DecidedChange {
  id: string;
  decision: 'accepted' | 'rejected';
  decidedAt: number;
  /** Snapshot taken before the doc-api call so we can render it post-accept. */
  snapshot: { type?: string; author?: string; authorEmail?: string; excerpt?: string };
}

export function ActivitySidebar({ composeOpen, onCloseComposer }: Props) {
  const ui = useSuperDocUI();
  const review = useSuperDocReview();
  const selection = useSuperDocSelection();

  // Track tracked-changes that the user has accepted/rejected. Once
  // decided, the change leaves the live `ui.review` feed (the
  // tracked-change row in the document is gone — accepted means
  // applied, rejected means discarded). To mimic the Google Docs
  // experience the user asked for, we capture the change snapshot
  // before calling accept/reject and render it in the Resolved
  // section as an audit row. State is component-local: refresh wipes
  // it, which is fine for a demo.
  const [decidedChanges, setDecidedChanges] = useState<Map<string, DecidedChange>>(() => new Map());

  // Track which entity (if any) is currently under the editor cursor.
  // Multiple ids can be active when marks overlap; the example picks
  // the first for highlight purposes.
  const activeEntityId = useMemo<string | null>(() => {
    if (selection.activeCommentIds.length > 0) return selection.activeCommentIds[0]!;
    if (selection.activeChangeIds.length > 0) return selection.activeChangeIds[0]!;
    return null;
  }, [selection.activeCommentIds, selection.activeChangeIds]);

  // Partition the live feed into active vs resolved-comment buckets,
  // and fold reply comments under their parent. Word/Google Docs thread
  // a comment by `parentCommentId` (DOCX persists this in
  // commentsExtended.xml as `paraIdParent`). The doc-api surfaces
  // `parentCommentId` on each item; we group it here so the sidebar
  // renders one card per thread root with its replies stacked under
  // it. Replies whose parent is missing (resolved or pruned) fall
  // back to top-level so we don't lose them.
  const { active, resolvedComments } = useMemo(() => {
    const a: ReviewSlice['items'] = [];
    const r: ReviewSlice['items'] = [];
    const commentRoots = new Set<string>();
    for (const item of review.items) {
      if (item.kind === 'comment') {
        const c = item.comment as { parentCommentId?: string };
        if (!c.parentCommentId) commentRoots.add(item.id);
      }
    }
    for (const item of review.items) {
      const isResolvedComment =
        item.kind === 'comment' && (item.comment as { status?: string }).status === 'resolved';
      if (item.kind === 'comment') {
        const c = item.comment as { parentCommentId?: string };
        // Reply rows are rendered inline inside the parent card —
        // skip them at the top level if the parent is also visible.
        if (c.parentCommentId && commentRoots.has(c.parentCommentId)) continue;
      }
      if (isResolvedComment) r.push(item);
      else a.push(item);
    }
    return { active: a, resolvedComments: r };
  }, [review.items]);

  // Replies indexed by parent id. Built once per snapshot.
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ReviewSlice['items']>();
    for (const item of review.items) {
      if (item.kind !== 'comment') continue;
      const c = item.comment as { parentCommentId?: string };
      if (!c.parentCommentId) continue;
      const list = map.get(c.parentCommentId) ?? [];
      list.push(item);
      map.set(c.parentCommentId, list);
    }
    return map;
  }, [review.items]);

  const decideChange = (id: string, decision: 'accepted' | 'rejected') => {
    if (!ui) return;
    // Capture a snapshot from the live feed BEFORE we mutate, since
    // accept/reject removes the tracked-change row entirely.
    const liveItem = review.items.find((it) => it.id === id);
    const change =
      liveItem?.kind === 'change'
        ? (liveItem.change as DecidedChange['snapshot'])
        : null;
    if (decision === 'accepted') ui.review.accept(id);
    else ui.review.reject(id);
    if (change) {
      setDecidedChanges((prev) => {
        const next = new Map(prev);
        next.set(id, { id, decision, decidedAt: Date.now(), snapshot: change });
        return next;
      });
    }
  };

  // Reconcile `decidedChanges` against the live review feed: when a
  // tracked change we previously decided reappears in `review.items`
  // (undo of the accept/reject, collaborator restore, etc.), drop it
  // from the local decided roll-up. Without this prune, the same
  // change renders in both the Active and Resolved sections with a
  // stale "accepted" / "rejected" label.
  useEffect(() => {
    setDecidedChanges((prev) => {
      if (prev.size === 0) return prev;
      const liveChangeIds = new Set<string>();
      for (const item of review.items) {
        if (item.kind === 'change') liveChangeIds.add(item.id);
      }
      let mutated = false;
      const next = new Map(prev);
      for (const id of prev.keys()) {
        if (liveChangeIds.has(id)) {
          next.delete(id);
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [review.items]);

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

  // Resolved roll-up: comments resolved in-document + tracked changes
  // we've decided locally. Sorted by most recently resolved first so
  // the latest action floats to the top of the resolved section.
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
                else ui.review.scrollTo(item.id);
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
  item: ReviewSlice['items'][number];
  active: boolean;
  resolved: boolean;
  replies?: ReviewSlice['items'];
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
  comment: ReviewComment;
  resolved: boolean;
  replies?: ReviewSlice['items'];
  ui: NonNullable<ReturnType<typeof useSuperDocUI>>;
}) {
  const host = useSuperDocHost() as SuperDoc | null;
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
    const editor = host?.activeEditor;
    const commentsApi = editor?.doc?.comments;
    if (!commentsApi || typeof commentsApi.create !== 'function' || !replyText.trim()) return;
    setReplying(true);
    try {
      // Reply uses the doc-api `create({ parentCommentId, text })`
      // path. `ui.comments` doesn't yet expose a typed `reply()`
      // method (filed as a follow-up under SD-2817); the `host`
      // surface is the documented escape hatch until then.
      commentsApi.create({ parentCommentId: comment.id, text: replyText.trim() });
      cancelReply();
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
              disabled={!host || replying || !replyText.trim()}
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
              <button disabled={!host} onClick={openReply}>
                Reply
              </button>
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
  change: ReviewChange;
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
 * accepted/rejected. The live `ui.review` feed drops decided changes
 * (the row is gone from the document either way), so this row is
 * rendered from the local snapshot we captured before deciding —
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
