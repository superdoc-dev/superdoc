import { useEffect, useState } from 'react';
import type { ViewportRect } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';
import { useAnnotations } from './useAnnotations';

/**
 * Renders absolute-positioned border overlays on every metadata range.
 * Uses `ui.metadata.getRect({ id })` to get the bounding rectangles.
 */
type HighlightEntry = { metadataId: string; annotationId: string; rects: ViewportRect[] };

export function MetadataHighlights() {
  const ui = useSuperDocUI();
  const { annotations } = useAnnotations();
  const [entries, setEntries] = useState<HighlightEntry[]>([]);

  useEffect(() => {
    const metadata = ui?.metadata;
    if (!metadata?.getRect) {
      setEntries([]);
      return;
    }

    const remeasure = () => {
      const next: HighlightEntry[] = [];
      for (const ann of annotations) {
        const result = metadata.getRect({ id: ann.id });
        if (!result.success) continue;
        next.push({
          metadataId: ann.id,
          annotationId: ann.payload.annotationId,
          rects: result.rects,
        });
      }
      setEntries(next);
    };

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

    const mutationObserver =
      canvas && annotations.length > 0
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
  }, [ui, annotations]);

  return (
    <div className="metadata-highlights" aria-hidden>
      {entries.flatMap((entry) =>
        entry.rects.map((rect, i) => (
          <div
            key={`${entry.metadataId}:${i}`}
            className="metadata-highlight"
            data-annotation-id={entry.annotationId}
            title={`Annotation: ${entry.annotationId}`}
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
