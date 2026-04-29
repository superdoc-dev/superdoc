import type { ReviewSlice } from 'superdoc/ui';
import { shallowEqual } from 'superdoc/ui';
import { useSuperDocUI, useSuperDocSlice } from '../lib/SuperDocUIProvider';

const EMPTY: ReviewSlice = { items: [], openCount: 0, activeId: null };

/**
 * Merged review sidebar — comments + tracked changes in document
 * order. `ui.review.subscribe` returns a single feed; cards render
 * differently per `kind` ('comment' vs 'change').
 *
 * Accept / reject / next / previous all route through `ui.review.*`
 * — the controller resolves them to `editor.doc.trackChanges.decide`
 * under the hood and handles the multi-segment / activeId bookkeeping.
 */
export function ReviewSidebar() {
  const ui = useSuperDocUI();
  const slice = useSuperDocSlice<ReviewSlice>(
    (controller) => controller.select((state) => state.review, shallowEqual),
    EMPTY,
  );

  if (!ui) {
    return <div className="card">Loading editor…</div>;
  }

  if (slice.items.length === 0) {
    return <div className="card">No comments or tracked changes.</div>;
  }

  return (
    <>
      <div className="card-actions" style={{ marginTop: 0 }}>
        <button onClick={() => ui.review.previous()}>← Previous</button>
        <button onClick={() => ui.review.next()}>Next →</button>
      </div>
      {slice.items.map((item) =>
        item.kind === 'change' ? (
          <ChangeCard key={item.id} change={item.change as any} active={slice.activeId === item.id} />
        ) : (
          <CommentRow key={item.id} comment={item.comment as any} active={slice.activeId === item.id} />
        ),
      )}
    </>
  );
}

function CommentRow({ comment, active }: { comment: { id: string; text?: string; creatorName?: string }; active: boolean }) {
  const ui = useSuperDocUI()!;
  return (
    <div
      className="card"
      style={active ? { borderColor: 'var(--accent)' } : undefined}
      onClick={() => ui.review.scrollTo(comment.id)}
    >
      <div className="card-header">
        <span className="change-badge">Comment</span>
        <span className="author">{comment.creatorName ?? 'Unknown'}</span>
      </div>
      <div className="body">{comment.text}</div>
    </div>
  );
}

function ChangeCard({
  change,
  active,
}: {
  change: { id: string; type?: string; author?: string; excerpt?: string };
  active: boolean;
}) {
  const ui = useSuperDocUI()!;
  const kind = change.type === 'insert' ? 'insertion' : change.type === 'delete' ? 'deletion' : 'format';
  return (
    <div
      className="card"
      style={active ? { borderColor: 'var(--accent)' } : undefined}
      onClick={() => ui.review.scrollTo(change.id)}
    >
      <div className="card-header">
        <span className={`change-badge ${kind}`}>{kind}</span>
        <span className="author">{change.author ?? 'Unknown'}</span>
      </div>
      {change.excerpt ? <div className="quote">“{change.excerpt}”</div> : null}
      <div className="card-actions">
        <button
          className="primary"
          onClick={(e) => {
            e.stopPropagation();
            ui.review.accept(change.id);
          }}
        >
          Accept
        </button>
        <button
          className="danger"
          onClick={(e) => {
            e.stopPropagation();
            ui.review.reject(change.id);
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
