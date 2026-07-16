import { useEffect } from 'react';
import { useSuperDocUI } from 'superdoc/ui/react';

/**
 * Mirrors document clicks on tracked changes into the custom Activity
 * sidebar without moving selection or starting review navigation.
 */
export function TrackedChangeActivation() {
  const ui = useSuperDocUI();

  useEffect(() => {
    if (!ui) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const host = ui.viewport.getHost();
      const target = event.target;
      if (!host || !(target instanceof Node) || !host.contains(target)) return;

      const hit = ui.trackChanges.getAt({ x: event.clientX, y: event.clientY });
      ui.trackChanges.setActive(hit?.id ?? null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [ui]);

  return null;
}
