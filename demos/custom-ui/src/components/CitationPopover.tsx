import { useEffect, useState } from 'react';
import { useSuperDocUI, useSuperDocHost } from 'superdoc/ui/react';
import { CITATIONS_NAMESPACE, isCitationPayload, type CitationPayload, type MetadataDocApi } from './citations-types';

const HOVER_DEBOUNCE_MS = 60;

type HoverState = { id: string; payload: CitationPayload; x: number; y: number } | null;

function getMetadataApi(host: ReturnType<typeof useSuperDocHost>): MetadataDocApi | null {
  if (!host) return null;
  const editor = (host as unknown as { activeEditor?: { doc?: { metadata?: MetadataDocApi } } }).activeEditor;
  return editor?.doc?.metadata ?? null;
}

/**
 * Hover-driven popover for cited spans. Composes existing primitives:
 *
 *   - `mousemove` listener (throttled) over the editor area
 *   - `ui.viewport.entityAt({ x, y })` → ordered list of hits, innermost first
 *   - Take the first `type: 'contentControl'` hit's `tag` (the metadata id)
 *   - `editor.doc.metadata.get({ id })` → payload
 *   - Filter on namespace + payload-shape guard to ignore non-citation SDTs
 *
 * This is exactly the surface the SD-3104 PR claims is "composable
 * from existing primitives." Building it here proves that claim or
 * surfaces the friction. If it turns out to be awkward, that's the
 * evidence to file a first-class `ui.metadata({ namespace }).observe(...)`
 * convenience handle.
 */
export function CitationPopover() {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();
  const [hover, setHover] = useState<HoverState>(null);

  useEffect(() => {
    if (!ui) return;
    let raf: number | null = null;
    let lastFire = 0;

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastFire < HOVER_DEBOUNCE_MS) return;
      lastFire = now;

      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;
        // `ui` is typed `any` here because the published superdoc/ui
        // declaration file isn't picked up by the demo's tsconfig
        // (pre-existing debt). Annotating `h` keeps this file free of
        // implicit-any errors at the demo TS check.
        type ViewportHit = { type: string; id?: string; tag?: string; scope?: 'block' | 'inline' };
        type ContentControlHit = { type: 'contentControl'; id: string; tag?: string; scope?: 'block' | 'inline' };
        const hits: ViewportHit[] = ui.viewport.entityAt({ x: e.clientX, y: e.clientY });
        // Innermost first per the entityAt contract; the first
        // contentControl hit is the one the cursor is currently over.
        const ccHit = hits.find((h: ViewportHit): h is ContentControlHit =>
          h.type === 'contentControl' && typeof h.id === 'string',
        );
        if (!ccHit || !ccHit.tag) {
          setHover(null);
          return;
        }
        // ccHit.tag IS the metadata id when the SDT was attached via
        // metadata.attach (the adapter sets w:tag = metadataId).
        const api = getMetadataApi(host);
        if (!api) {
          setHover(null);
          return;
        }
        const info = api.get({ id: ccHit.tag });
        if (!info || info.namespace !== CITATIONS_NAMESPACE || !isCitationPayload(info.payload)) {
          setHover(null);
          return;
        }
        setHover({ id: info.id, payload: info.payload, x: e.clientX, y: e.clientY });
      });
    };

    const onLeave = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      setHover(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [ui, host]);

  if (!hover) return null;

  const p = hover.payload;

  return (
    <div
      className="citation-popover"
      style={{
        position: 'fixed',
        left: hover.x + 12,
        top: hover.y + 12,
        pointerEvents: 'none',
      }}
      role="tooltip"
    >
      <div className="citation-popover-source">{p.displayText}</div>
      {p.locator && <div className="citation-popover-locator">{p.locator}</div>}
      {p.excerpt && (
        <div className="citation-popover-excerpt">
          &ldquo;{p.excerpt}&rdquo;
        </div>
      )}
      <div className="citation-popover-meta">
        <span className="citation-popover-provider">{p.provider}</span>
        {typeof p.confidence === 'number' && (
          <>
            {' · '}
            <span className="citation-popover-confidence">conf {p.confidence.toFixed(2)}</span>
          </>
        )}
      </div>
    </div>
  );
}
