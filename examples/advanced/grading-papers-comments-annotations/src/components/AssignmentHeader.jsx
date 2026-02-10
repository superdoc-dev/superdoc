const AssignmentHeader = () => {
  return (
    <div className="assignment-header">
      <h2 className="assignment-title">Midterm Assignment</h2>
      <div className="assignment-meta">
        <div className="meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>
            Due: <span className="due-date" id="dueDate">August 16, 2026 at 11:59 PM</span>
          </span>
        </div>
        <div className="meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10,9 9,9 8,9" />
          </svg>
          <span>Format: PDF</span>
        </div>
        <div className="meta-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Instructor: Dr. Sarah Smith</span>
        </div>
      </div>
      <p>
        Submit your midterm paper on "The Impact of Technology on Modern Education". The paper should be 2000-3000 words
        and include proper citations.
      </p>
      <div className="submission-status status-pending" id="submissionStatus">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
        <span>Submission Pending</span>
      </div>
    </div>
  );
};

export default AssignmentHeader;
