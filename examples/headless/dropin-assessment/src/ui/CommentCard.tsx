import type { Comment } from '../core/types';

interface Props {
  comment: Comment;
  active: boolean;
  onClick: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
}

export function CommentCard({ comment, active, onClick, onResolve, onReopen, onDelete }: Props) {
  return (
    <div
      className={`comment-card ${active ? 'is-active' : ''} ${comment.resolved ? 'is-resolved' : ''}`}
      onClick={onClick}
      data-comment-card-id={comment.id}
    >
      <div className="cc-head">
        <div className="avatar" style={{ background: comment.author.color }}>
          {comment.author.name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')}
        </div>
        <div className="cc-name">{comment.author.name}</div>
        <div className="cc-time" style={{ marginLeft: 'auto' }}>
          {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      {comment.quotedText && <div className="cc-quote">“{comment.quotedText}”</div>}
      <div className="cc-body">{comment.body}</div>
      <div className="cc-actions" onClick={(e) => e.stopPropagation()}>
        {comment.resolved ? (
          <button onClick={onReopen}>Reopen</button>
        ) : (
          <button onClick={onResolve}>Resolve</button>
        )}
        <button className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
