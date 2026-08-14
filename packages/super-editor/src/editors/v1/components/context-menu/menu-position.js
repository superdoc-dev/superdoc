const CLIPPING_OVERFLOW = new Set(['auto', 'scroll', 'hidden', 'clip']);

/**
 * Visible bounds (viewport coordinates) a fixed-position menu should stay within: the viewport
 * minus any window scrollbar, intersected with every clipping ancestor's client box.
 *
 * @param {Element|null} anchorEl - Element inside the scroll area (e.g. the editor surface).
 * @param {Window} view - Window used for measurements (injectable for tests).
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
export const resolveMenuBounds = (anchorEl, view) => {
  const docEl = view.document.documentElement;
  const bounds = { left: 0, top: 0, right: docEl.clientWidth, bottom: docEl.clientHeight };

  let current = anchorEl;
  while (current) {
    const { overflowX, overflowY } = view.getComputedStyle(current);
    const clipsX = CLIPPING_OVERFLOW.has(overflowX);
    const clipsY = CLIPPING_OVERFLOW.has(overflowY);

    if ((clipsX || clipsY) && current.getBoundingClientRect) {
      const rect = current.getBoundingClientRect();
      const clientLeft = rect.left + current.clientLeft;
      const clientTop = rect.top + current.clientTop;

      if (clipsX) {
        bounds.left = Math.max(bounds.left, clientLeft);
        bounds.right = Math.min(bounds.right, clientLeft + current.clientWidth);
      }
      if (clipsY) {
        bounds.top = Math.max(bounds.top, clientTop);
        bounds.bottom = Math.min(bounds.bottom, clientTop + current.clientHeight);
      }
    }

    current = current.parentElement;
  }

  return bounds;
};

/**
 * Clamp a fixed-position menu back inside `bounds` using its rendered rect. Shifts by how far the
 * rect overflows each edge, so the result is correct regardless of the menu's containing block.
 *
 * @param {{ left: string, top: string }} position - Current CSS position (px strings).
 * @param {{ left: number, top: number, right: number, bottom: number }} rect - Rendered menu rect.
 * @param {{ left: number, top: number, right: number, bottom: number }} bounds - Allowed area.
 * @param {number} [gutter=8] - Minimum gap from each edge.
 * @returns {{ left: string, top: string }}
 */
export const clampMenuPositionToBounds = (position, rect, bounds, gutter = 8) => {
  let left = parseFloat(position.left) || 0;
  let top = parseFloat(position.top) || 0;

  // Clamp an axis only when the menu fits; a larger menu renders as-is (shifting just trades edges).
  const fitsX = rect.right - rect.left <= bounds.right - bounds.left - 2 * gutter;
  const fitsY = rect.bottom - rect.top <= bounds.bottom - bounds.top - 2 * gutter;

  if (fitsX) {
    if (rect.right > bounds.right - gutter) left -= rect.right - (bounds.right - gutter);
    else if (rect.left < bounds.left + gutter) left += bounds.left + gutter - rect.left;
  }

  if (fitsY) {
    if (rect.bottom > bounds.bottom - gutter) top -= rect.bottom - (bounds.bottom - gutter);
    else if (rect.top < bounds.top + gutter) top += bounds.top + gutter - rect.top;
  }

  return { left: `${left}px`, top: `${top}px` };
};
