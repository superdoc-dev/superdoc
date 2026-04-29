import type { CommentsSlice } from 'superdoc/ui';
import { shallowEqual } from 'superdoc/ui';
import { useSuperDocUI, useSuperDocSlice } from '../lib/SuperDocUIProvider';

const EMPTY: CommentsSlice = { items: [], activeIds: [], total: 0 };

/**
 * Comments sidebar bound to `ui.comments.subscribe`. Each card binds
 * its actions (resolve, reopen, delete, scroll-to) to the matching
 * `ui.comments.<verb>(id)` method. The custom UI never reaches into
 * `editor.doc.comments.*` directly — `ui.comments` is the consumer
 * surface, the doc-api methods underneath are an implementation
 * detail.
 */
export function CommentsSidebar() {
  const ui = useSuperDocUI();
  const slice = useSuperDocSlice<CommentsSlice>(
    (controller) => controller.select((state) => state.comments, shallowEqual),
    EMPTY,
  );

  if (!ui) {
    return <div className="card">Loading editor…</div>;
  }

  if (slice.items.length === 0) {
    return <div className="card">No comments yet. Select text and click the comment icon.</div>;
  }

  const items = slice.items as unknown as CommentRecord[];
  const open = items.filter((c) => c.status !== 'resolved');
  const resolved = items.filter((c) => c.status === 'resolved');

  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {open.length} open · {resolved.length} resolved
      </div>
      {open.map((c) => (
        <CommentCard key={c.id} comment={c} onScroll={() => ui.comments.scrollTo(c.id)} resolved={false} />
      ))}
      {resolved.map((c) => (
        <CommentCard key={c.id} comment={c} onScroll={() => ui.comments.scrollTo(c.id)} resolved />
      ))}
    </>
  );
}

interface CommentRecord {
  id: string;
  text?: string;
  creatorName?: string;
  creatorEmail?: string;
  createdTime?: number;
  anchoredText?: string;
  status?: string;
}

function CommentCard({
  comment,
  onScroll,
  resolved,
}: {
  comment: CommentRecord;
  onScroll: () => void;
  resolved: boolean;
}) {
  const ui = useSuperDocUI()!;

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
    <div
      className="card"
      style={resolved ? { opacity: 0.6 } : undefined}
      onDoubleClick={onScroll}
    >
      <div className="card-header">
        <span className="avatar" style={{ background: avatarColor(author) }}>{initials}</span>
        <span className="author">{author}</span>
        <span className="timestamp">{time}</span>
      </div>
      {comment.anchoredText ? <div className="quote">“{comment.anchoredText}”</div> : null}
      <div className="body">{comment.text}</div>
      <div className="card-actions">
        <button onClick={onScroll}>Scroll to</button>
        {resolved ? (
          <button className="primary" onClick={() => ui.comments.reopen(comment.id)}>
            Reopen
          </button>
        ) : (
          <button className="primary" onClick={() => ui.comments.resolve(comment.id)}>
            Resolve
          </button>
        )}
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
