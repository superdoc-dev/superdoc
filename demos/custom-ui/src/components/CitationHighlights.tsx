import { useEffect, useMemo, useState } from 'react';
import type { ViewportRect } from 'superdoc/ui';
import { useSuperDocContentControls, useSuperDocUI } from 'superdoc/ui/react';
import { useCitations } from './useCitations';

/**
 * Renders absolute-positioned overlay rectangles on every cited span.
 *
 * Two-step lookup. `editor.doc.metadata.*` keys by the metadata id
 * (which is the SDT's `w:tag`); `ui.contentControls.getRect({ id })`
 * keys by the SDT's PM node id (which the painter stamps as
 * `data-sdt-id`). These are different identifiers. The contentControls
 * slice surfaces both per item (`target.nodeId` + `properties.tag`),
 * so we build a tag → nodeId map and translate at measure time.
 *
 * `getRect` returns `rects[]` — one ViewportRect per painted line of a
 * wrapped span — so line-wrapped citations get clean per-line
 * underlines without spilling across the page margin.
 *
 * Scroll and resize trigger a re-measure so the highlights stay glued.
 */
type HighlightEntry = { metadataId: string; tooltip: string; rects: ViewportRect[] };

type CCItem = { target?: { nodeId?: string }; properties?: { tag?: string } };

export function CitationHighlights() {
  const ui = useSuperDocUI();
  const { citations } = useCitations();
  const cc = useSuperDocContentControls();
  const [entries, setEntries] = useState<HighlightEntry[]>([]);

  // tag (= metadata id) → PM node id. Refreshes whenever the slice
  // items array reference changes.
  const tagToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of (cc.items ?? []) as unknown as CCItem[]) {
      const tag = item.properties?.tag;
      const nodeId = item.target?.nodeId;
      if (typeof tag === 'string' && typeof nodeId === 'string') {
        map.set(tag, nodeId);
      }
    }
    return map;
  }, [cc.items]);

  useEffect(() => {
    if (!ui) {
      setEntries([]);
      return;
    }

    const remeasure = () => {
      const next: HighlightEntry[] = [];
      for (const c of citations) {
        const nodeId = tagToNodeId.get(c.id);
        if (!nodeId) continue;
        const result = ui.contentControls.getRect({ id: nodeId });
        if (!result.success) continue;
        next.push({
          metadataId: c.id,
          tooltip: `${c.payload.displayText} (${c.payload.citationId})`,
          rects: result.rects,
        });
      }
      setEntries(next);
    };

    remeasure();
    window.addEventListener('scroll', remeasure, true);
    window.addEventListener('resize', remeasure);
    return () => {
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
    };
  }, [ui, citations, tagToNodeId]);

  return (
    <div className="citation-highlights" aria-hidden>
      {entries.flatMap((entry) =>
        entry.rects.map((rect, i) => (
          <div
            key={`${entry.metadataId}:${i}`}
            className="citation-highlight"
            data-citation-id={entry.metadataId}
            title={entry.tooltip}
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          />
        )),
      )}
    </div>
  );
}
