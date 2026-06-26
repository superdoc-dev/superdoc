import { useSuperDocUI } from 'superdoc/ui/react';
import { useAnnotations } from './useAnnotations';

/**
 * Panel showing all annotation metadata entries in the document.
 * Each entry shows its ID, annotation ID, and creation time.
 * Users can scroll to the annotated range or remove the annotation.
 */
export function MetadataPanel() {
  const ui = useSuperDocUI();
  const { annotations, loading, remove } = useAnnotations();

  const scrollTo = async (id: string) => {
    const metadata = ui?.metadata;
    if (!metadata?.scrollIntoView) return;
    await metadata.scrollIntoView({ id, block: 'center' });
  };

  return (
    <div className="metadata-panel">
      {loading && <div className="metadata-empty">Loading...</div>}
      {!loading && annotations.length === 0 && (
        <div className="metadata-empty">
          No metadata ranges yet. Select some text and click <strong>Apply Metadata</strong> in the toolbar.
        </div>
      )}

      <div className="metadata-list">
        {annotations.map((ann) => (
          <article key={ann.id} className="metadata-card">
            <header className="metadata-card-header">
              <span className="metadata-badge">Annotation</span>
              <span className="metadata-id">{ann.payload.annotationId}</span>
            </header>
            <div className="metadata-card-meta">
              <span className="metadata-timestamp">
                Created: {new Date(ann.payload.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="metadata-card-details">
              <code className="metadata-entry-id">ID: {ann.id}</code>
            </div>
            <div className="metadata-card-actions">
              <button onClick={() => void scrollTo(ann.id)}>Scroll to</button>
              <button className="danger" onClick={() => remove(ann.id)}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
