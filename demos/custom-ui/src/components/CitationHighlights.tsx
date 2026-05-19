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
 * Remeasure triggers: window scroll/resize, ResizeObserver on the
 * editor canvas (catches pagination/zoom), and MutationObserver on
 * the canvas DOM (catches text edits that move cited spans without
 * resizing the canvas). All paths funnel through a single rAF tick
 * to coalesce bursts of keystrokes into one remeasure per frame.
 *
 * This is demo-tier instrumentation. A library would expose a
 * dedicated layout/transaction event rather than observing the DOM.
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

    // Coalesce burst triggers (multi-mutation keystrokes, ResizeObserver
    // firing alongside MutationObserver, etc.) into one remeasure per frame.
    let rafHandle: number | null = null;
    const scheduleRemeasure = () => {
      if (rafHandle !== null) return;
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        remeasure();
      });
    };

    remeasure();
    window.addEventListener('scroll', scheduleRemeasure, true);
    window.addEventListener('resize', scheduleRemeasure);

    const canvas = document.querySelector('.editor-canvas');
    const resizeObserver = canvas ? new ResizeObserver(scheduleRemeasure) : null;
    if (canvas && resizeObserver) resizeObserver.observe(canvas);

    // Skip the DOM-mutation observer when there are no citations to track —
    // keeps the demo from observing the editor body when there's nothing to update.
    const mutationObserver =
      canvas && citations.length > 0
        ? new MutationObserver(scheduleRemeasure)
        : null;
    if (canvas && mutationObserver) {
      mutationObserver.observe(canvas, { childList: true, subtree: true, characterData: true });
    }

    return () => {
      window.removeEventListener('scroll', scheduleRemeasure, true);
      window.removeEventListener('resize', scheduleRemeasure);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
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
