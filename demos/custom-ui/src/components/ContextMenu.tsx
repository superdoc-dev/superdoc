import { useEffect, useState } from 'react';
import type { ContextMenuItem, ViewportEntityHit } from 'superdoc/ui';
import { useSuperDocUI } from 'superdoc/ui/react';

interface OpenState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  entities: ViewportEntityHit[];
}

/**
 * Right-click context menu wired through the new contribution surface.
 * Two API calls together do the work consumers used to do imperatively:
 *
 *   - `ui.viewport.entityAt({ x, y })` says what entities (comment,
 *     tracked change) the click landed on. Replaces reading
 *     `data-track-change-id` / `data-comment-ids` off the DOM.
 *   - `ui.commands.getContextMenuItems({ entities })` returns items
 *     contributed via `register({ contextMenu: { ... } })`, filtered
 *     by each contribution's `when` predicate.
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
      // Scope the listener to the editor surface. `entityAt` alone
      // isn't enough as a scope check once you have selection-scoped
      // items, because `entityAt` returns `[]` BOTH outside the editor
      // AND inside plain text. `.editor-shell` is the demo's own
      // wrapper class — once a public `ui.viewport.getHost()` lands,
      // swap the closest() check for that.
      const target = event.target;
      if (!(target instanceof Element) || !target.closest?.('.editor-shell')) {
        return;
      }

      // Three-surface principle for the right-click menu: the action's
      // subject is whatever the user clicked on. Strictly:
      //
      //   1. An entity under the pointer (tracked change / comment) —
      //      target-scoped items resolve via `entityAt`.
      //   2. A point INSIDE the active selection — selection-scoped
      //      items (Copy, Comment on selection) act on the selection
      //      the user already has.
      //   3. Plain caret-only text — nothing today, because the public
      //      surface has no `ui.viewport.positionAt({ x, y })` yet, so
      //      a "Paste here" / "Insert clause here" item would dispatch
      //      against the stale selection rather than the click point.
      //      Filed as a follow-up; the menu stays empty until then.
      //
      // Hit-testing the click against the selection rects is what
      // separates case 2 from case 3 — without it, ANY right-click
      // with a non-empty selection somewhere in the doc would surface
      // selection-scoped items, even when the user clicked far away.
      const entities = ui.viewport.entityAt({ x: event.clientX, y: event.clientY });
      const insideSelection = isPointInsideSelectionRects(
        ui.selection.getRects(),
        event.clientX,
        event.clientY,
      );

      // Selection-scoped items are gated by both predicate (`when:
      // ({ selection }) => !selection.empty`) AND this hit-test. When
      // the click falls outside the selection rects, drop them so a
      // stale selection from elsewhere in the doc doesn't leak.
      const allItems = ui.commands.getContextMenuItems({ entities });
      const items = insideSelection
        ? allItems
        : allItems.filter((item) => item.group !== 'clipboard' && item.group !== 'comment');

      if (items.length === 0) {
        setState(null);
        return;
      }
      event.preventDefault();
      setState({ x: event.clientX, y: event.clientY, items, entities });
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
                // Pass the entity hits as payload so each command's
                // execute can find the right id to act on (e.g. the
                // tracked-change id under the right-click point).
                ui.commands.get(item.id)?.execute({ entities: state.entities });
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

function isPointInsideSelectionRects(
  rects: Array<{ left: number; top: number; width: number; height: number }>,
  x: number,
  y: number,
): boolean {
  for (const rect of rects) {
    if (x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height) {
      return true;
    }
  }
  return false;
}
