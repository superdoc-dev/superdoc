import { useEffect, useMemo, useRef, useState } from 'react';
import type { SelectionCapture } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';
import type { SelectionTarget } from './citations-types';
import { useCitations } from './useCitations';

interface Props {
  /** Close without posting. */
  onCancel(): void;
  /** Called after a successful attach so the parent can dismiss / scroll. */
  onPosted(id: string | null): void;
}

/**
 * Inline composer for new citations. Mirrors `CommentComposer`'s
 * capture pattern: freeze the editor selection at mount so focusing
 * the form fields doesn't tear it down. On submit, the captured
 * selection feeds `metadata.attach` via `useCitations.attachAtSelection`.
 */
export function CitationComposer({ onCancel, onPosted }: Props) {
  const ui = useSuperDocUI();
  const { attach } = useCitations();
  const [citationId, setCitationId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [locator, setLocator] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const citationIdRef = useRef<HTMLInputElement | null>(null);

  // Capture once at mount and hold it. SelectionCapture's quotedText
  // gives us a preview, and the capture's TextTarget feeds attach.
  const captured: SelectionCapture | null = useMemo(() => ui?.selection.capture() ?? null, [ui]);

  useEffect(() => {
    citationIdRef.current?.focus();
  }, []);

  // `SelectionCapture` is a SelectionSlice; `selectionTarget` is the
  // SelectionTarget shape `metadata.attach` accepts directly.
  const capturedTarget =
    ((captured as unknown as { selectionTarget?: SelectionTarget | null } | null)?.selectionTarget ?? null);
  const canPost =
    !!ui &&
    !!captured &&
    !posting &&
    citationId.trim().length > 0 &&
    sourceId.trim().length > 0 &&
    displayText.trim().length > 0 &&
    capturedTarget !== null;

  const post = () => {
    if (!ui || !canPost || !capturedTarget) return;
    setPosting(true);
    setError(null);
    const result = attach(capturedTarget, {
      citationId: citationId.trim(),
      sourceId: sourceId.trim(),
      displayText: displayText.trim(),
      locator: locator.trim() || undefined,
    });
    setPosting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    // Restore the editor's visible selection so the user can keep editing.
    if (captured) ui.selection.restore(captured);
    onPosted(result.id);
  };

  const cancel = () => {
    if (ui && captured) ui.selection.restore(captured);
    onCancel();
  };

  return (
    <div className="composer">
      <div className="composer-quote">
        {captured?.quotedText ? <>“{captured.quotedText}”</> : <em>No selection</em>}
      </div>
      <input
        ref={citationIdRef}
        className="composer-input"
        placeholder="Citation ID (your stable id, e.g. cite-7f3a)"
        value={citationId}
        onChange={(e) => setCitationId(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
          if (e.key === 'Escape') cancel();
        }}
      />
      <input
        className="composer-input"
        placeholder="Source ID (record key in your citation DB)"
        value={sourceId}
        onChange={(e) => setSourceId(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
          if (e.key === 'Escape') cancel();
        }}
      />
      <input
        className="composer-input"
        placeholder="Display text (fallback label, e.g. Smith v. Jones, 2024)"
        value={displayText}
        onChange={(e) => setDisplayText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
          if (e.key === 'Escape') cancel();
        }}
      />
      <input
        className="composer-input"
        placeholder="Locator (optional, e.g. §3.2 or p. 17)"
        value={locator}
        onChange={(e) => setLocator(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
          if (e.key === 'Escape') cancel();
        }}
      />
      {error && <div className="composer-error">{error}</div>}
      <div className="composer-actions">
        <button onClick={cancel}>Cancel</button>
        <button className="primary" disabled={!canPost} onClick={post}>
          {posting ? 'Saving…' : 'Cite'}
        </button>
      </div>
    </div>
  );
}
