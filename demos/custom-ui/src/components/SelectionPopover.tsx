import { useEffect, useRef, useState } from 'react';
import type { ViewportRect } from 'superdoc/ui';
import { useSuperDocSelection, useSuperDocUI } from 'superdoc/ui/react';

interface Props {
  /** Open the comment composer with the captured selection. */
  onComposeComment(): void;
}

/**
 * Floating bubble menu over the user's selection. Demonstrates the
 * selection-rect path consumers used to reach for
 * `window.getSelection().getRangeAt(0).getBoundingClientRect()` —
 * which reads from the offscreen ProseMirror DOM and lands the
 * popover in the wrong place. `ui.selection.getAnchorRect()` reads
 * from the painted layout instead.
 *
 * The popover only re-positions when the selection slice meaningfully
 * changes (range / quoted text). Scroll and resize trigger a refresh
 * so the anchor stays glued through layout shifts; the rect is
 * viewport-relative so `position: fixed` is enough.
 */
export function SelectionPopover({ onComposeComment }: Props) {
  const ui = useSuperDocUI();
  const selection = useSuperDocSelection();
  const [rect, setRect] = useState<ViewportRect | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Recompute the anchor whenever the selection slice changes shape.
  // `useSuperDocSelection` is memoized at the controller, so this
  // effect runs once per selection-change burst rather than per
  // editor transaction.
  useEffect(() => {
    if (!ui || selection.empty || selection.target === null) {
      setRect(null);
      return;
    }
    const update = () => {
      setRect(ui.selection.getAnchorRect({ placement: 'start' }));
    };
    update();
    // Scroll-capture listener so the popover follows the page when the
    // user scrolls; the document is paginated so scroll happens
    // somewhere up the DOM chain. `capture: true` catches scroll on
    // any scrollable ancestor.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [ui, selection.empty, selection.target, selection.quotedText]);

  if (!rect) return null;

  return (
    <div
      ref={popoverRef}
      className="selection-popover"
      style={{
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: rect.top - 8,
        transform: 'translate(-50%, -100%)',
      }}
      // Stop pointerdown from bubbling so clicking a button doesn't
      // tear down the editor's selection (which would then close the
      // popover before the click handler runs).
      onPointerDown={(e) => e.preventDefault()}
    >
      <button
        className={`tb-btn ${selection.activeMarks.includes('bold') ? 'active' : ''}`}
        title="Bold (⌘B)"
        onClick={() => ui?.commands.get('bold')?.execute()}
      >
        B
      </button>
      <button
        className={`tb-btn ${selection.activeMarks.includes('italic') ? 'active' : ''}`}
        title="Italic (⌘I)"
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
