import { useEffect, useRef, useState } from 'react';
import { shallowEqual } from 'superdoc/ui';
import { useSuperDocUI, useSuperDocSlice } from '../lib/SuperDocUIProvider';

interface Props {
  /** Close the composer without posting. */
  onCancel(): void;
  /** Called after a successful create so the parent can dismiss / scroll. */
  onPosted(commentId: string | null): void;
}

/**
 * Inline composer for new comments. Mounts inside the activity panel
 * when the toolbar's comment button is clicked. Captures the current
 * selection target on submit and routes through
 * `ui.comments.createFromSelection({ text })`.
 *
 * Why an inline composer instead of `window.prompt`: a real product UI
 * doesn't pop a browser dialog. The composer also lets the user
 * preview the quoted text — the snippet that will be anchored — so
 * they know what they're commenting on.
 */
export function CommentComposer({ onCancel, onPosted }: Props) {
  const ui = useSuperDocUI();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selection = useSuperDocSlice(
    (controller) => controller.select((state) => state.selection, shallowEqual),
    {
      empty: true,
      target: null as null | unknown,
      activeMarks: [] as string[],
      activeCommentIds: [] as string[],
      activeChangeIds: [] as string[],
      quotedText: '',
    } as never,
  );

  // Autofocus the textarea on mount — the consumer-flow expectation is
  // "click comment icon, start typing immediately."
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canPost = !!ui && !!selection.target && !posting && text.trim().length > 0;

  const post = () => {
    if (!ui || !canPost) return;
    setPosting(true);
    try {
      const receipt = ui.comments.createFromSelection({ text: text.trim() });
      setPosting(false);
      if (!receipt.success) {
        onPosted(null);
        return;
      }
      const entity = receipt.inserted?.[0];
      onPosted((entity as { entityId?: string } | undefined)?.entityId ?? null);
    } catch (err) {
      console.error('[CommentComposer] createFromSelection threw', err);
      setPosting(false);
    }
  };

  return (
    <div className="composer">
      <div className="composer-quote">
        {selection.quotedText ? <>“{selection.quotedText}”</> : <em>No selection</em>}
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
