import { useEffect, useMemo, useRef, useState } from 'react';
import type { SelectionCapture } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';

interface Props {
  /** Close the composer without posting. */
  onCancel(): void;
  /** Called after a successful create so the parent can dismiss / scroll. */
  onPosted(commentId: string | null): void;
}

/**
 * Inline composer for new comments. Mounts inside the activity panel
 * when the toolbar's comment button is clicked.
 *
 * Selection-capture flow: the composer freezes the editor's current
 * selection at mount time via `ui.selection.capture()`. The user then
 * clicks into the textarea, which moves browser focus and visually
 * clears the editor's live selection. The capture survives that
 * focus loss because it's a frozen snapshot, not a live read. On
 * submit, `ui.comments.createFromCapture(capture, { text })` anchors
 * the post against the captured target regardless of where focus has
 * moved. `createFromSelection` would read the LIVE selection (null
 * while typing in the textarea) and refuse the create.
 */
export function CommentComposer({ onCancel, onPosted }: Props) {
  const ui = useSuperDocUI();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Capture once at mount, hold for the composer's lifetime.
  // `ui` is null until SuperDoc reports ready; the memo recomputes
  // when it flips, so the first composer-open after mount captures
  // correctly.
  const captured: SelectionCapture | null = useMemo(() => ui?.selection.capture() ?? null, [ui]);

  // Autofocus the textarea: the user-flow expectation is
  // "click comment icon, start typing immediately."
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canPost = !!ui && !!captured && !posting && text.trim().length > 0;

  const post = () => {
    if (!ui || !canPost || !captured) return;
    setPosting(true);
    try {
      const receipt = ui.comments.createFromCapture(captured, { text: text.trim() });
      setPosting(false);
      if (!receipt.success) {
        onPosted(null);
        return;
      }
      const entity = (receipt.inserted as Array<{ entityId?: string }> | undefined)?.[0];
      onPosted(entity?.entityId ?? null);
    } catch (err) {
      console.error('[CommentComposer] createFromCapture threw', err);
      setPosting(false);
    }
  };

  return (
    <div className="composer">
      <div className="composer-quote">
        {captured?.quotedText ? <>“{captured.quotedText}”</> : <em>No selection</em>}
      </div>
      <textarea
        ref={textareaRef}
        className="composer-input"
        rows={3}
        placeholder="Write a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="composer-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!canPost} onClick={post}>
          {posting ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </div>
  );
}
