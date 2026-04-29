import { useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual, type ReviewSlice, type SelectionSlice } from 'superdoc/ui';
import { useSuperDocUI, useSuperDocSlice } from '../lib/SuperDocUIProvider';
import { CommentComposer } from './CommentComposer';

interface Props {
  /** When true, render the inline composer at the top of the panel. */
  composeOpen: boolean;
  /** Close the composer without posting. */
  onCloseComposer(): void;
}

const EMPTY_REVIEW: ReviewSlice = { items: [], openCount: 0, activeId: null };
const EMPTY_SELECTION: SelectionSlice = {
  empty: true,
  target: null,
  activeMarks: [],
  activeCommentIds: [],
  activeChangeIds: [],
  quotedText: '',
};

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
  const review = useSuperDocSlice<ReviewSlice>(
    (controller) => controller.select((state) => state.review, shallowEqual),
    EMPTY_REVIEW,
  );
  const selection = useSuperDocSlice<SelectionSlice>(
    (controller) => controller.select((state) => state.selection, shallowEqual),
    EMPTY_SELECTION,
  );

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

  // Partition the live feed into active vs resolved-comment buckets.
  // Tracked changes that are still pending stay active. Decided
  // tracked changes are merged in later from the local `decidedChanges`
  // state; the live feed no longer carries them.
  const { active, resolvedComments } = useMemo(() => {
    const a: ReviewSlice['items'] = [];
    const r: ReviewSlice['items'] = [];
    for (const item of review.items) {
      const isResolvedComment =
        item.kind === 'comment' && (item.comment as { status?: string }).status === 'resolved';
      if (isResolvedComment) r.push(item);
      else a.push(item);
    }
    return { active: a, resolvedComments: r };
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
  onClick(): void;
  onDecideChange(id: string, decision: 'accepted' | 'rejected'): void;
}

function ActivityCard({ item, active, resolved, onClick, onDecideChange }: CardProps) {
  const ui = useSuperDocUI()!;
  const className = ['card', active ? 'active' : '', resolved ? 'resolved' : ''].filter(Boolean).join(' ');

  return (
    <div className={className} data-card-id={item.id} onClick={onClick}>
      {item.kind === 'comment' ? (
        <CommentBody comment={item.comment as never} resolved={resolved} ui={ui} />
      ) : (
        <ChangeBody change={item.change as never} onDecide={(decision) => onDecideChange(item.id, decision)} />
      )}
    </div>
  );
}

interface CommentRecord {
  id: string;
  text?: string;
  creatorName?: string;
  creatorEmail?: string;
  createdTime?: number;
  anchoredText?: string;
}

function CommentBody({ comment, resolved, ui }: { comment: CommentRecord; resolved: boolean; ui: NonNullable<ReturnType<typeof useSuperDocUI>> }) {
  const author = comment.creatorName ?? comment.creatorEmail ?? 'Unknown';
  const initials = author
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const time = comment.createdTime
    ? new Date(comment.createdTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <>
      <div className="card-header">
        <span className="avatar" style={{ background: avatarColor(author) }}>{initials}</span>
        <span className="author">{author}</span>
        <span className="timestamp">{time}</span>
      </div>
      {comment.anchoredText ? <div className="quote">“{comment.anchoredText}”</div> : null}
      <div className="body">{comment.text}</div>
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {resolved ? (
          <button className="primary" onClick={() => ui.comments.reopen(comment.id)}>
            Reopen
          </button>
        ) : (
          <button onClick={() => ui.comments.resolve(comment.id)}>Resolve</button>
        )}
      </div>
    </>
  );
}

interface ChangeRecord {
  id: string;
  type?: string;
  author?: string;
  authorEmail?: string;
  excerpt?: string;
  date?: string | number;
}

function ChangeBody({
  change,
  onDecide,
}: {
  change: ChangeRecord;
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
