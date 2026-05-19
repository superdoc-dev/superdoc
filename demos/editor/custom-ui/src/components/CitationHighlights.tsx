import { useEffect, useState } from 'react';
import type { ViewportRect } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';
import { useCitations } from './useCitations';

/**
 * Renders absolute-positioned overlay rectangles on every cited span.
 *
 * Geometry comes from `ui.metadata.getRect({ id })`. The handle hides
 * the underlying lookup (metadata id = SDT `w:tag` → SDT node id →
 * painter rect) so consumers only carry the metadata id they originally
 * passed to `editor.doc.metadata.attach`. Before SD-3204 this demo had
 * to compose `useSuperDocContentControls` + a tag → nodeId map +
 * `ui.contentControls.getRect`; that bridge is now obviated.
 *
 * `getRect` returns `rects[]` on success (one ViewportRect per painted
 * line of a wrapped span), so line-wrapped citations get clean per-line
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

export function CitationHighlights() {
  const ui = useSuperDocUI();
  const { citations } = useCitations();
  const [entries, setEntries] = useState<HighlightEntry[]>([]);

  useEffect(() => {
    const metadata = ui?.metadata;
    if (!metadata?.getRect) {
      setEntries([]);
      return;
    }

    const remeasure = () => {
      const next: HighlightEntry[] = [];
      for (const c of citations) {
        const result = metadata.getRect({ id: c.id });
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

    // Skip the DOM-mutation observer when there are no citations to track,
    // so the demo doesn't observe the editor body when there's nothing to update.
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
  }, [ui, citations]);

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
