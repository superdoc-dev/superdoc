import { useEffect, useState } from 'react';
import type { ContextMenuItem } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';

interface OpenState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

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
 * on `<SuperDocEditor>`, so this is the only menu the user sees.
 */
export function ContextMenu() {
  const ui = useSuperDocUI();
  const [state, setState] = useState<OpenState | null>(null);

  useEffect(() => {
    if (!ui) return;
    const onContextMenu = (event: MouseEvent) => {
      // Scope to the painted host. Entity hits alone aren't a scope
      // signal: `entityAt` returns `[]` outside the editor AND inside
      // plain text, and a custom toolbar / sidebar inside the host
      // wrapper would otherwise trigger this menu.
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setState(null);
    };
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ui]);

  if (!state || !ui) return null;

  return (
    <div
      className="context-menu"
      style={{ position: 'fixed', left: state.x, top: state.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {state.items.map((item, idx) => {
        const prev = state.items[idx - 1];
        const showSeparator = prev && prev.group !== item.group;
        return (
          <div key={item.id}>
            {showSeparator && <div className="context-menu-separator" />}
            <button
              className="context-menu-item"
              onClick={() => {
                // `invoke()` fires the registered `execute({ context })`
                // with the bundle the menu was opened on. Falls back to
                // a no-op for items the registry didn't stamp (shouldn't
                // happen for menus opened with a bundle, kept for type
                // safety).
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
