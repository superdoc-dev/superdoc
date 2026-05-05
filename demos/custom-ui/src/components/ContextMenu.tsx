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
      // isn't enough now that always-on contributions (Bold, Italic,
      // Copy, Comment on selection) are wired to the selection slice
      // rather than the click coordinate — without an explicit
      // editor-surface check, right-clicking the sidebar with a
      // selection in the editor would pop our menu over the sidebar.
      // `.editor-shell` is the demo's own wrapper class. Once a
      // public `ui.viewport.getHost()` lands, swap the closest()
      // check for that.
      const target = event.target;
      if (!(target instanceof Element) || !target.closest?.('.editor-shell')) {
        return;
      }
      const entities = ui.viewport.entityAt({ x: event.clientX, y: event.clientY });
      const items = ui.commands.getContextMenuItems({ entities });
      if (items.length === 0) {
        // Inside the editor but no contributions matched. The
        // `custom-selection` PM extension has already preventDefault
        // -ed the original event so the browser's native menu
        // won't show — there's nothing to render here either, so
        // close any open menu and bail.
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
