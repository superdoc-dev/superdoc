import { useEffect, useState } from 'react';

interface Props {
  quotedText: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentComposer({ quotedText, onSubmit, onCancel }: Props) {
  const [body, setBody] = useState('');

  useEffect(() => {
    // Focus after mount
    const el = document.getElementById('composer-textarea') as HTMLTextAreaElement | null;
    el?.focus();
  }, []);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody('');
  };

  return (
    <div className="composer">
      {quotedText && <div className="quoted">On: “{quotedText.slice(0, 120)}{quotedText.length > 120 ? '…' : ''}”</div>}
      <textarea
        id="composer-textarea"
        placeholder="Add a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="composer-actions">
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" onClick={submit} disabled={!body.trim()}>
          Comment
        </button>
      </div>
    </div>
  );
}
