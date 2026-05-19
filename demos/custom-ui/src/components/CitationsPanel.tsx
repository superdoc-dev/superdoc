import { useMemo, useState } from 'react';
import { useSuperDocUI } from 'superdoc/ui/react';
import { selectionTargetToTextTarget, type CitationInfo, type CitationPayload } from './citations-types';
import { useCitations } from './useCitations';
import { GenerateDraftButton } from './GenerateDraftButton';

type UpdateCitation = (id: string, payload: CitationPayload) => { error?: string };

/**
 * References panel. Renders citations grouped by `sourceId` — the
 * pattern Harvey / CoCounsel / Lexis+ use for the side panel beside
 * AI-generated output. Each source group shows the metadata and links
 * back to every cited span in the body. No manual composer; citations
 * arrive via `metadata.attach` from the mocked generation pipeline.
 */
export function CitationsPanel() {
  const ui = useSuperDocUI();
  const { citations, resolve, remove, update, loading } = useCitations();
  const [editingId, setEditingId] = useState<string | null>(null);

  const groups = useMemo(() => groupBySource(citations), [citations]);

  const scrollTo = async (id: string) => {
    if (!ui) return;
    const selectionTarget = resolve(id);
    const textTarget = selectionTargetToTextTarget(selectionTarget);
    if (!textTarget) return;
    await ui.viewport.scrollIntoView({ target: textTarget });
  };

  return (
    <div className="citations-panel">
      <GenerateDraftButton />

      {loading && <div className="citations-empty">Loading\u2026</div>}
      {!loading && citations.length === 0 && (
        <div className="citations-empty">
          No sources cited yet. Click <em>Insert sample cited draft</em> to insert sample text
          with citations already attached.
        </div>
      )}

      <div className="references-list">
        {groups.map((group) => (
          <article key={group.sourceId} className="reference-card">
            <header className="reference-card-header">
              <span className="reference-source-title">{group.displayText}</span>
              <span className={`reference-source-type type-${group.sourceType}`}>{group.sourceType}</span>
            </header>
            <div className="reference-source-meta">
              <span className="reference-provider">{group.provider}</span>
              {group.deepLink && (
                <>
                  {' \u00b7 '}
                  <a className="reference-deeplink" href={group.deepLink} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                </>
              )}
            </div>
            <ul className="reference-citations">
              {group.citations.map((c) => (
                <li key={c.id} className="reference-citation">
                  <div className="reference-citation-line">
                    <span className="reference-citation-id">{c.payload.citationId}</span>
                    {c.payload.locator && (
                      <span className="reference-citation-locator">{c.payload.locator}</span>
                    )}
                    {typeof c.payload.confidence === 'number' && (
                      <span className="reference-citation-confidence">conf {c.payload.confidence.toFixed(2)}</span>
                    )}
                  </div>
                  {editingId === c.id ? (
                    <CitationEditor citation={c} update={update} onClose={() => setEditingId(null)} />
                  ) : (
                    <div className="reference-citation-actions">
                      <button onClick={() => void scrollTo(c.id)}>Scroll to</button>
                      <button onClick={() => setEditingId(c.id)}>Edit</button>
                      <button onClick={() => remove(c.id)}>Remove</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

type ReferenceGroup = {
  sourceId: string;
  sourceType: CitationInfo['payload']['sourceType'];
  provider: string;
  displayText: string;
  deepLink?: string;
  citations: CitationInfo[];
};

function groupBySource(citations: CitationInfo[]): ReferenceGroup[] {
  const bySourceId = new Map<string, ReferenceGroup>();
  for (const c of citations) {
    const p = c.payload;
    const existing = bySourceId.get(p.sourceId);
    if (existing) {
      existing.citations.push(c);
    } else {
      bySourceId.set(p.sourceId, {
        sourceId: p.sourceId,
        sourceType: p.sourceType,
        provider: p.provider,
        displayText: p.displayText,
        deepLink: p.deepLink,
        citations: [c],
      });
    }
  }
  return Array.from(bySourceId.values());
}

/**
 * Inline edit form. Exercises `metadata.update` — the lawyer can fix
 * displayText, locator, or excerpt without re-running the generation
 * pipeline. `citationId`, `sourceId`, `sourceType`, and `provider` are
 * locked here because changing those would mean a different citation,
 * not an edit of this one. A real product would offer "replace this
 * citation with a different source" as a separate flow.
 *
 * `update` is passed from the parent `CitationsPanel` rather than read
 * via a child-local `useCitations()`. A payload-only `metadata.update`
 * does not change the SDT structure, so the parent's content-controls
 * slice does not tick — a child-local hook would only refresh the
 * child's own copy of `citations`, leaving the parent panel stale on
 * Save.
 */
function CitationEditor({
  citation,
  update,
  onClose,
}: {
  citation: CitationInfo;
  update: UpdateCitation;
  onClose(): void;
}) {
  const [displayText, setDisplayText] = useState(citation.payload.displayText);
  const [locator, setLocator] = useState(citation.payload.locator ?? '');
  const [excerpt, setExcerpt] = useState(citation.payload.excerpt);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    const result = update(citation.id, {
      ...citation.payload,
      displayText: displayText.trim(),
      locator: locator.trim() || undefined,
      excerpt: excerpt.trim(),
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
      <textarea
        className="composer-input"
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        placeholder="Excerpt"
        rows={2}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
          if (e.key === 'Escape') onClose();
        }}
      />
      {error && <div className="composer-error">{error}</div>}
      <div className="reference-citation-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={save}>Save</button>
      </div>
    </div>
  );
}
