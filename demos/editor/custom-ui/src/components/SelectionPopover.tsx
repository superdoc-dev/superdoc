import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ViewportRect } from 'superdoc/ui';
import { useSuperDocSelection, useSuperDocUI } from 'superdoc/ui/react';

interface Props {
  /** Open the comment composer with the captured selection. */
  onComposeComment(): void;
}

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

/**
 * Floating bubble menu over the user's selection. Demonstrates the
 * selection-rect path consumers used to reach for
 * `window.getSelection().getRangeAt(0).getBoundingClientRect()`, which
 * reads from the offscreen ProseMirror DOM and lands the popover in
 * the wrong place. `ui.selection.getAnchorRect()` reads from the
 * painted layout instead.
 *
 * The popover re-positions when the selection changes or viewport
 * geometry invalidates. Rects are viewport-relative, so
 * `position: fixed` is enough.
 */
export function SelectionPopover({ onComposeComment }: Props) {
  const ui = useSuperDocUI();
  const selection = useSuperDocSelection();
  const [rect, setRect] = useState<ViewportRect | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ui || selection.empty || selection.target === null) {
      setRect(null);
      return;
    }
    const update = () => {
      setRect(ui.selection.getAnchorRect({ placement: 'start' }));
    };
    update();
    return ui.viewport.observe(update);
  }, [ui, selection.empty, selection.target, selection.quotedText]);

  // Clamp horizontally inside the viewport and flip below the selection
  // when there's no room above. Reading offsetWidth / offsetHeight in
  // useLayoutEffect runs after layout but before paint, so the popover
  // never lands at an off-screen coord and snaps back on the next frame.
  useLayoutEffect(() => {
    if (!rect || !popoverRef.current) {
      setPosition(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = popoverRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centerX - w / 2, VIEWPORT_MARGIN), vw - w - VIEWPORT_MARGIN);
    const above = rect.top - h - ANCHOR_GAP;
    const below = rect.top + rect.height + ANCHOR_GAP;
    // Prefer above when there's room; flip below otherwise. Final clamp
    // covers the rare case where neither fits (selection taller than vh).
    let top = above >= VIEWPORT_MARGIN ? above : below;
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), vh - h - VIEWPORT_MARGIN);
    setPosition({ left, top });
  }, [rect]);

  if (!rect) return null;

  return (
    <div
      ref={popoverRef}
      className="selection-popover"
      style={{
        position: 'fixed',
        left: position?.left ?? rect.left,
        top: position?.top ?? rect.top,
        // Hide for the single frame it takes useLayoutEffect to measure
        // and clamp. Avoids a flash at the unclamped coords.
        visibility: position ? 'visible' : 'hidden',
      }}
      // Stop pointerdown from bubbling so clicking a button doesn't
      // tear down the editor's selection (which would then close the
      // popover before the click handler runs).
      onPointerDown={(e) => e.preventDefault()}
    >
      <button
        className={`tb-btn ${selection.activeMarks.includes('bold') ? 'active' : ''}`}
        title="Bold"
        onClick={() => ui?.commands.get('bold')?.execute()}
      >
        B
      </button>
      <button
        className={`tb-btn ${selection.activeMarks.includes('italic') ? 'active' : ''}`}
        title="Italic"
        onClick={() => ui?.commands.get('italic')?.execute()}
      >
        I
      </button>
      <button className="tb-btn" title="Comment on selection" onClick={onComposeComment}>
        Comment
      </button>
    </div>
  );
}
