/**
 * DOM transition helpers for the SuperDoc collaboration upgrade.
 *
 * During `upgradeToCollaboration()`, the visible runtime is torn down and
 * rebuilt. These helpers create a frozen snapshot overlay so the user sees
 * no visual discontinuity while the new runtime initializes.
 */

/**
 * Capture the visible `.superdoc` DOM into an inert overlay before teardown.
 *
 * Returns a snapshot descriptor (overlay element + restore callback), or
 * `null` if the DOM state doesn't allow snapshotting (graceful degradation).
 *
 * @param {HTMLElement | null} container   The SuperDoc host element
 * @param {HTMLElement | null} mountWrapper The internal Vue mount wrapper
 * @returns {{ overlay: HTMLDivElement, restore: () => void } | null}
 */
export function createUpgradeSnapshot(container, mountWrapper) {
  const superdocEl = mountWrapper?.querySelector('.superdoc');
  if (!container || !superdocEl) return null;

  // Pin container geometry so the page doesn't collapse during unmount
  const rect = container.getBoundingClientRect();
  const prevMinHeight = container.style.minHeight;
  const prevPosition = container.style.position;
  container.style.minHeight = `${rect.height}px`;
  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const scrollTop = container.scrollTop;
  const scrollLeft = container.scrollLeft;

  // Clone the visible tree
  const clone = superdocEl.cloneNode(true);

  // Copy canvas pixels — cloneNode doesn't preserve them
  const srcCanvases = superdocEl.querySelectorAll('canvas');
  const dstCanvases = clone.querySelectorAll('canvas');
  for (let i = 0; i < srcCanvases.length; i++) {
    try {
      const ctx = dstCanvases[i]?.getContext('2d');
      if (ctx) ctx.drawImage(srcCanvases[i], 0, 0);
    } catch {
      /* tainted canvas — skip */
    }
  }

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'sd-upgrade-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.appendChild(clone);
  container.appendChild(overlay);

  return {
    overlay,
    restore() {
      container.style.minHeight = prevMinHeight;
      container.style.position = prevPosition;
      container.scrollTop = scrollTop;
      container.scrollLeft = scrollLeft;
    },
  };
}

/**
 * Reveal the new runtime and clean up the snapshot overlay.
 *
 * @param {HTMLElement | null} mountWrapper
 * @param {HTMLDivElement | null} overlay
 * @param {{ restore: () => void } | null} snapshot
 */
export function revealNewRuntime(mountWrapper, overlay, snapshot) {
  const newEl = mountWrapper?.querySelector('.superdoc');
  if (newEl) newEl.classList.remove('sd-upgrade-hidden');
  snapshot?.restore();
  if (overlay) overlay.remove();
}

/**
 * Emergency cleanup if an upgrade transition is aborted (e.g. by `destroy()`).
 *
 * @param {HTMLElement | null} mountWrapper
 * @param {HTMLDivElement | null} overlay
 * @param {{ restore?: () => void } | null} snapshot
 */
export function teardownUpgradeTransition(mountWrapper, overlay, snapshot) {
  if (overlay) overlay.remove();
  snapshot?.restore();
  const el = mountWrapper?.querySelector('.superdoc');
  if (el) el.classList.remove('sd-upgrade-hidden');
}
