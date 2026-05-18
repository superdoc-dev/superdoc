import { useState } from 'react';
import { useSuperDocUI } from 'superdoc/ui/react';
import { selectionTargetToTextTarget, type CitationInfo } from './citations-types';
import { useCitations } from './useCitations';
import { CitationComposer } from './CitationComposer';

interface Props {
  composeOpen: boolean;
  onCloseComposer(): void;
}

/**
 * Sidebar panel showing every citation in the document plus an
 * inline composer when triggered from the toolbar / selection
 * popover. Each card has Scroll-to (resolve + viewport.scrollIntoView),
 * Edit (inline update form → metadata.update), and Remove (metadata.remove).
 */
export function CitationsPanel({ composeOpen, onCloseComposer }: Props) {
  const ui = useSuperDocUI();
  const { citations, resolve, remove, loading } = useCitations();
  const [editingId, setEditingId] = useState<string | null>(null);

  const scrollTo = async (id: string) => {
    if (!ui) return;
    const selectionTarget = resolve(id);
    const textTarget = selectionTargetToTextTarget(selectionTarget);
    if (!textTarget) return;
    await ui.viewport.scrollIntoView({ target: textTarget });
  };

  return (
    <div className="citations-panel">
      {composeOpen && (
        <CitationComposer
          onCancel={onCloseComposer}
          onPosted={(id) => {
            onCloseComposer();
            if (id) void scrollTo(id);
          }}
        />
      )}
      <div className="citations-list">
        {loading && <div className="citations-empty">Loading…</div>}
        {!loading && citations.length === 0 && (
          <div className="citations-empty">
            No citations yet. Select text and click <em>Cite</em>.
          </div>
        )}
        {citations.map((c) => (
          <article key={c.id} className="citation-card">
            <header className="citation-card-header">
              <span className="citation-source">{c.payload.displayText}</span>
              {c.payload.locator && <span className="citation-locator">{c.payload.locator}</span>}
            </header>
            <div className="citation-meta">
              <span className="citation-id">{c.payload.citationId}</span>
              {' · '}
              {new Date(c.payload.createdAt).toLocaleString()}
            </div>
            {editingId === c.id ? (
              <CitationEditor citation={c} onClose={() => setEditingId(null)} />
            ) : (
              <div className="citation-actions">
                <button onClick={() => void scrollTo(c.id)}>Scroll to</button>
                <button onClick={() => setEditingId(c.id)}>Edit</button>
                <button onClick={() => remove(c.id)}>Remove</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/**
 * Inline edit form. Exercises `metadata.update` — the sixth method on
 * the namespace, so the demo's coverage matches SD-3199's scope (all
 * six metadata.* operations get UI paths, not just the hook). Edit is
 * payload-only; the anchor stays put.
 */
function CitationEditor({ citation, onClose }: { citation: CitationInfo; onClose(): void }) {
  const { update } = useCitations();
  const [displayText, setDisplayText] = useState(citation.payload.displayText);
  const [locator, setLocator] = useState(citation.payload.locator ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    const result = update(citation.id, {
      citationId: citation.payload.citationId,
      sourceId: citation.payload.sourceId,
      displayText: displayText.trim(),
      locator: locator.trim() || undefined,
      confidence: citation.payload.confidence,
      createdAt: citation.payload.createdAt,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div className="citation-editor">
      <input
        className="composer-input"
        value={displayText}
        onChange={(e) => setDisplayText(e.target.value)}
        placeholder="Display text"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
          if (e.key === 'Escape') onClose();
        }}
      />
      <input
        className="composer-input"
        value={locator}
        onChange={(e) => setLocator(e.target.value)}
        placeholder="Locator (optional)"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
          if (e.key === 'Escape') onClose();
        }}
      />
      {error && <div className="composer-error">{error}</div>}
      <div className="citation-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={save}>Save</button>
      </div>
    </div>
  );
}
