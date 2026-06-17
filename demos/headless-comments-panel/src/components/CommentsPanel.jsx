import { useState, useEffect, useMemo, useCallback } from 'react';
import './CommentsPanel.css';

export default function CommentsPanel({ isReady }) {
  // State
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showChanges, setShowChanges] = useState(true);
  const [showComments, setShowComments] = useState(true);

  // Helpers
  const getEditor = () => window.editor;
  const getSuperdoc = () => window.superdoc;

  // Data fetching
  const fetchComments = useCallback(() => {
    const editor = getEditor();
    if (!editor?.doc?.comments) {
      if (isReady) setError('Editor not ready');
      setIsLoading(false);
      return;
    }

    try {
      const result = editor.doc.comments.list({ includeResolved: true });
      const items = result?.items ?? [];

      // Enrich with full comment details
      const enriched = items.map(item => {
        try {
          const commentId = item.id || item.commentId;
          if (commentId && editor.doc.comments.get) {
            return { ...item, ...editor.doc.comments.get({ commentId }) };
          }
        } catch (e) {}
        return item;
      });

      setComments(enriched);
      setError(null);
    } catch (e) {
      console.error('Failed to fetch comments:', e);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [isReady]);

  // Derived data
  const pairedRows = useMemo(() => {
    const rows = [];
    for (const item of comments) {
      const isTrackChange = item.trackedChange === true;
      const changeText = item.deletedText || item.trackedChangeText || item.insertedText || '';
      const commentText = item.text?.trim() || '';
      const hasActualComment = commentText.length > 0 && commentText !== changeText.trim();

      if (isTrackChange) {
        rows.push({
          change: { ...item, displayText: changeText || item.anchoredText || '' },
          commentText: hasActualComment ? item.text : null,
          commentItem: hasActualComment ? item : null,
          resolved: item.status === 'resolved',
        });
      } else {
        const text = item.text || item.content || item.body || item.replies?.[0]?.text || '';
        if (text) {
          rows.push({
            change: null,
            commentText: text,
            commentItem: item,
            resolved: item.status === 'resolved',
          });
        }
      }
    }
    return rows;
  }, [comments]);

  const activeRows = useMemo(() => pairedRows.filter(r => !r.resolved), [pairedRows]);

  const stats = useMemo(() => ({
    changes: activeRows.filter(r => r.change).length,
    comments: activeRows.filter(r => r.commentText).length,
  }), [activeRows]);

  // Actions
  const acceptChange = (change) => {
    const editor = getEditor();
    if (!editor?.doc?.trackChanges) return;
    try {
      const id = change.trackedChangeAnchorKey || change.id || change.commentId;
      editor.doc.trackChanges.decide({ decision: 'accept', target: { id } });
      fetchComments();
    } catch (e) {
      console.error('Failed to accept change:', e);
    }
  };

  const rejectChange = (change) => {
    const editor = getEditor();
    if (!editor?.doc?.trackChanges) return;
    try {
      const id = change.trackedChangeAnchorKey || change.id || change.commentId;
      editor.doc.trackChanges.decide({ decision: 'reject', target: { id } });
      fetchComments();
    } catch (e) {
      console.error('Failed to reject change:', e);
    }
  };

  const resolveComment = (commentId) => {
    const editor = getEditor();
    if (!editor?.doc?.comments) return;
    try {
      editor.doc.comments.update({ id: commentId, status: 'resolved' });
      fetchComments();
    } catch (e) {
      console.error('Failed to resolve comment:', e);
    }
  };

  const deleteComment = (commentId) => {
    const editor = getEditor();
    if (!editor?.doc?.comments) return;
    try {
      editor.doc.comments.delete({ id: commentId });
      fetchComments();
    } catch (e) {
      console.error('Failed to delete comment:', e);
    }
  };

  const goToItem = (item) => {
    const superdoc = getSuperdoc();
    if (!superdoc?.scrollToElement) return;
    document.body.click();
    setTimeout(() => superdoc.scrollToElement(item.id), 100);
  };

  // Formatting
  const getChangeType = (change) => {
    const type = change.trackedChangeType || change.trackedChangeDisplayType;
    if (type === 'insert') return { label: 'Inserted', cls: 'insert' };
    if (type === 'delete') return { label: 'Deleted', cls: 'delete' };
    if (type === 'format') return { label: 'Formatted', cls: 'format' };
    return { label: 'Changed', cls: 'change' };
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // Polling
  useEffect(() => {
    if (!isReady) return;

    setIsLoading(true);
    const timeout = setTimeout(() => {
      fetchComments();
    }, 300);

    const interval = setInterval(fetchComments, 2000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isReady, fetchComments]);

  return (
    <div className="panel">
      <div className="pills">
        <button
          className={`pill ${showChanges ? 'active' : ''}`}
          onClick={() => setShowChanges(!showChanges)}
        >
          {stats.changes} changes
        </button>
        <button
          className={`pill ${showComments ? 'active' : ''}`}
          onClick={() => setShowComments(!showComments)}
        >
          {stats.comments} comments
        </button>
      </div>

      {isLoading ? (
        <div className="message">Loading...</div>
      ) : error ? (
        <div className="message error">{error}</div>
      ) : activeRows.length === 0 ? (
        <div className="message">No tracked changes or comments</div>
      ) : (
        <div className="content">
          {activeRows.map((row, i) => (
            <div key={i} className={`row ${!showChanges || !showComments ? 'single' : ''}`}>
              {showChanges && (
                <div className="cell">
                  {row.change ? (
                    <div
                      className={`card change-card ${getChangeType(row.change).cls}`}
                      onClick={() => goToItem(row.change)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && goToItem(row.change)}
                    >
                      <div className="card-header">
                        <span className={`badge ${getChangeType(row.change).cls}`}>
                          {getChangeType(row.change).label}
                        </span>
                        <span className="author">{row.change.creatorName || 'Unknown'}</span>
                      </div>
                      <div className="card-text">{row.change.displayText}</div>
                      <div className="card-actions">
                        <button
                          className="btn accept"
                          onClick={(e) => { e.stopPropagation(); acceptChange(row.change); }}
                        >
                          Accept
                        </button>
                        <button
                          className="btn reject"
                          onClick={(e) => { e.stopPropagation(); rejectChange(row.change); }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="card placeholder" />
                  )}
                </div>
              )}
              {showComments && (
                <div className="cell">
                  {row.commentText ? (
                    <div
                      className="card comment-card"
                      onClick={() => goToItem(row.commentItem)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && goToItem(row.commentItem)}
                    >
                      <div className="card-header">
                        <span className="avatar">
                          {(row.commentItem?.creatorName || 'U')[0]}
                        </span>
                        <span className="author">{row.commentItem?.creatorName || 'Unknown'}</span>
                        <span className="date">{formatDate(row.commentItem?.createdTime)}</span>
                      </div>
                      <div className="card-text">{row.commentText}</div>
                      <div className="card-actions">
                        <button
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            resolveComment(row.commentItem?.id || row.commentItem?.commentId);
                          }}
                        >
                          Resolve
                        </button>
                        <button
                          className="btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteComment(row.commentItem?.id || row.commentItem?.commentId);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="card placeholder" />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
