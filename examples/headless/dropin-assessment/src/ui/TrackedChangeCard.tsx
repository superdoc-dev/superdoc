import type { TrackedChange } from '../core/types';

interface Props {
  change: TrackedChange;
  onClick: () => void;
  onAccept: () => void;
  onReject: () => void;
}

const KIND_LABEL: Record<TrackedChange['kind'], string> = {
  insertion: 'Insertion',
  deletion: 'Deletion',
  format: 'Format change',
};

const KIND_ACCENT: Record<TrackedChange['kind'], string> = {
  insertion: '#10b981',  // green
  deletion: '#dc2626',   // red
  format: '#a855f7',     // purple
};

export function TrackedChangeCard({ change, onClick, onAccept, onReject }: Props) {
  const accent = KIND_ACCENT[change.kind];
  return (
    <div
      className="comment-card"
      style={{ borderLeft: `3px solid ${accent}` }}
      data-tc-card-id={change.id}
      onClick={onClick}
    >
      <div className="cc-head">
        <div className="avatar" style={{ background: change.author.color }}>
          {change.author.name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')}
        </div>
        <div className="cc-name">{change.author.name}</div>
        <div className="cc-time" style={{ marginLeft: 'auto' }}>
          <span style={{ color: accent, fontWeight: 600, marginRight: 6 }}>{KIND_LABEL[change.kind]}</span>
          {new Date(change.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      {change.text && (
        <div
          className="cc-quote"
          style={{
            textDecoration: change.kind === 'deletion' ? 'line-through' : undefined,
            color: change.kind === 'deletion' ? accent : undefined,
          }}
        >
          {change.kind === 'insertion' ? '+ ' : change.kind === 'deletion' ? '− ' : '~ '}
          {change.text}
        </div>
      )}
      <div className="cc-body" style={{ color: '#6b7280', fontSize: 12 }}>{change.summary}</div>
      <div className="cc-actions" onClick={(e) => e.stopPropagation()}>
        <button onClick={onAccept} style={{ color: '#10b981', borderColor: '#10b981' }}>
          Accept
        </button>
        <button className="danger" onClick={onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}
