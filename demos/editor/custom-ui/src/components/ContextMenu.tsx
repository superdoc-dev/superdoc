import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ContextMenuItem } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';

interface OpenState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

const VIEWPORT_MARGIN = 8;

/**
 * Right-click context menu wired through the controller's bundle API.
 *
 *   - `ui.viewport.contextAt({ x, y })` returns one object with the
 *     entities under the click, the resolved caret position, the live
 *     selection, and `insideSelection` (whether the click landed in
 *     the painted selection rects). The demo no longer assembles
 *     these by hand.
 *   - `ui.commands.getContextMenuItems(context)` filters contributions
 *     against the same shape predicates see, and stamps each returned
 *     item with `invoke()`. Calling `item.invoke()` fires the
 *     registered `execute({ context })` with the bundle bound, so
 *     handlers act on the click target without the demo threading
 *     entity ids through a payload.
 *   - `ui.viewport.getHost()` returns the painted host element, so
 *     scoping to "events inside the editor" doesn't depend on a
 *     consumer-side CSS class.
 *
 * Built-in editor context menu is suppressed via `disableContextMenu`
 * on `<SuperDocEditor>`. When `getContextMenuItems(context)` returns
 * items, the demo's menu opens and `preventDefault` blocks the native
 * one. When the result is empty (no contribution matches the click
 * target), the handler returns without `preventDefault` so the
 * browser native menu falls through.
 */
export function ContextMenu() {
  const ui = useSuperDocUI();
  const [state, setState] = useState<OpenState | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!ui) return;
    const onContextMenu = (event: MouseEvent) => {
      // Scope to the painted host before reading `contextAt`. An empty
      // bundle can mean "outside the editor" OR "inside plain text
      // with no selection and no entities", so emptiness alone isn't
      // a scope signal. Without the host check, a right-click on the
      // consumer's own toolbar or sidebar would still open this menu.
      const host = ui.viewport.getHost();
      const target = event.target;
      if (!host || !(target instanceof Node) || !host.contains(target)) {
        return;
      }

      const context = ui.viewport.contextAt({ x: event.clientX, y: event.clientY });
      const items = ui.commands.getContextMenuItems(context);
      if (items.length === 0) {
        setState(null);
        return;
      }
      event.preventDefault();
      setState({ x: event.clientX, y: event.clientY, items });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest?.('.context-menu')) return;
      setState(null);
    };
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [ui]);

  // Clamp the menu inside the viewport once we know its size. Reading
  // offsetWidth/offsetHeight inside useLayoutEffect runs after layout
  // but before paint, so the menu is never visibly placed off-screen
  // first and snapped back.
  useLayoutEffect(() => {
    if (!state || !menuRef.current) {
      setPosition(null);
      return;
    }
    const menu = menuRef.current;
    const { offsetWidth: w, offsetHeight: h } = menu;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(state.x, VIEWPORT_MARGIN), vw - w - VIEWPORT_MARGIN);
    const top = Math.min(Math.max(state.y, VIEWPORT_MARGIN), vh - h - VIEWPORT_MARGIN);
    setPosition({ left, top });
    // Focus the first item so keyboard users can navigate immediately.
    itemRefs.current[0]?.focus();
  }, [state]);

  // Roving keyboard navigation. Up/Down moves focus, Home/End jump to
  // the ends, Escape closes. Clicks dismiss via `pointerdown` above.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!state) return;
    const last = state.items.length - 1;
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setState(null);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = current < 0 ? 0 : Math.min(current + 1, last);
      itemRefs.current[next]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = current < 0 ? last : Math.max(current - 1, 0);
      itemRefs.current[next]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      itemRefs.current[last]?.focus();
    }
  };

  if (!state || !ui) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: position?.left ?? state.x,
        top: position?.top ?? state.y,
        // Hide the menu for the single frame it takes useLayoutEffect
        // to measure and clamp. Avoids a flash at the unclamped coords.
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {state.items.map((item, idx) => {
        const prev = state.items[idx - 1];
        const showSeparator = prev && prev.group !== item.group;
        return (
          <div key={item.id}>
            {showSeparator && <div className="context-menu-separator" role="separator" />}
            <button
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              className="context-menu-item"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                item.invoke?.();
                setState(null);
              }}
            >
              {item.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
