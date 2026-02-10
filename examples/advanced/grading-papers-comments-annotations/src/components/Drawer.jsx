const Drawer = ({ onSelectFile }) => {
  const onCommentDragStart = (comment, event) => {
    event.dataTransfer.setData('text/plain', comment);
    event.dataTransfer.setData('application/comment', comment);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const onStickerDragStart = (stickerType, event) => {
    event.dataTransfer.setData('text/plain', stickerType);
    event.dataTransfer.setData('application/sticker', stickerType);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="sidebar" id="versionsDrawer">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Document Versions</h2>
      </div>

      <div className="card">
        <h3 className="card-title">Comments</h3>
        <div className="version-list" id="commentsList">
          <div style={{ textAlign: 'left', color: '#666', padding: '1rem' }}>
            <div className="comment-entry" draggable onDragStart={(event) => onCommentDragStart('great-job', event)}>
              Great job!
            </div>
            <div className="comment-entry" draggable onDragStart={(event) => onCommentDragStart('expand-this', event)}>
              Expand this
            </div>
            <div className="comment-entry" draggable onDragStart={(event) => onCommentDragStart('your-references', event)}>
              Where are your references?
            </div>
          </div>
        </div>

        <div className="add-new-comment">
          + Add new comment
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Stickers</h3>
        <div className="version-list">
          <div className="stickers-container">
            <div className="sticker-item" draggable onDragStart={(event) => onStickerDragStart('check-mark', event)}>
              <svg className="sticker-svg check-mark" width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="#22C55E" stroke="#16A34A" strokeWidth="2" />
                <path d="M12 20l6 6L28 14" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="sticker-label">Check Mark</span>
            </div>

            <div className="sticker-item" draggable onDragStart={(event) => onStickerDragStart('nice', event)}>
              <svg className="sticker-svg nice" width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="#3B82F6" stroke="#2563EB" strokeWidth="2" />
                <circle cx="15" cy="16" r="2" fill="white" />
                <circle cx="25" cy="16" r="2" fill="white" />
                <path d="M13 25c2 3 6 3 8 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M27 25c-2 3-6 3-8 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
              <span className="sticker-label">Nice!</span>
            </div>

            <div className="sticker-item" draggable onDragStart={(event) => onStickerDragStart('needs-improvement', event)}>
              <svg className="sticker-svg needs-improvement" width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="#F59E0B" stroke="#D97706" strokeWidth="2" />
                <path d="M20 12v10" stroke="white" strokeWidth="3" strokeLinecap="round" />
                <circle cx="20" cy="28" r="2" fill="white" />
              </svg>
              <span className="sticker-label">Needs Improvement</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Submissions</h3>
        <div className="version-list" id="versionList">
          <div className="version-item" data-version-id="1754508051682" onClick={() => onSelectFile?.('nick')}>
            <div className="version-info">
              <div className="version-name">
                Nick_Bernal_version4.pdf
                <span className="version-latest-label">Latest</span>
              </div>
              <div className="version-date">8/6/2025 at 12:20 PM</div>
              <div className="version-author">Submitted by: Nick Bernal</div>
            </div>
          </div>
          <div className="version-item" data-version-id="1754508051682" onClick={() => onSelectFile?.('nick')}>
            <div className="version-info">
              <div className="version-name">
                Nick_Bernal_version3.pdf
                <span className="version-latest-label">Latest</span>
              </div>
              <div className="version-date">8/6/2025 at 12:20 PM</div>
              <div className="version-author">Submitted by: Nick Bernal</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Drawer;
