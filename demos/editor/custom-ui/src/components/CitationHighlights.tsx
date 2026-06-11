import { useEffect, useState } from 'react';
import type { ViewportRect } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';
import { useCitations } from './useCitations';

/**
 * Renders absolute-positioned overlay rectangles on every cited span.
 * `ui.viewport.observe` tells the demo when cached rects may have moved.
 */
type HighlightEntry = { metadataId: string; tooltip: string; rects: ViewportRect[] };

export function CitationHighlights() {
  const ui = useSuperDocUI();
  const { citations } = useCitations();
  const [entries, setEntries] = useState<HighlightEntry[]>([]);

  useEffect(() => {
    const metadata = ui?.metadata;
    const viewport = ui?.viewport;
    if (!metadata?.getRect || !viewport?.observe) {
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

    // Coalesce burst geometry events into one remeasure per frame.
    let rafHandle: number | null = null;
    const scheduleRemeasure = () => {
      if (rafHandle !== null) return;
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        remeasure();
      });
    };

    remeasure();
    const stopObservingViewport = viewport.observe(scheduleRemeasure);

    return () => {
      stopObservingViewport();
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
