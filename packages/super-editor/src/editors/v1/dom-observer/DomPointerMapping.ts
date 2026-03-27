/**
 * Editor-owned DOM pointer helpers for hit resolution.
 *
 * This module is intentionally transitional. For PR2 it wraps or re-exports
 * bridge implementations; the physical move of dom-mapping logic into this
 * module is deferred to a follow-up PR.
 *
 * @module dom-observer/DomPointerMapping
 */

import {
  clickToPositionDom as bridgeClickToPositionDom,
  findPageElement as bridgeFindPageElement,
} from '@superdoc/layout-bridge';

/**
 * Maps viewport coordinates to a ProseMirror position via the rendered DOM.
 *
 * Thin wrapper around @superdoc/layout-bridge clickToPositionDom.
 * Will be internalized in a follow-up PR.
 */
export function clickToPositionDom(domContainer: HTMLElement, clientX: number, clientY: number): number | null {
  return bridgeClickToPositionDom(domContainer, clientX, clientY);
}

/**
 * Finds the page element at the given viewport coordinates.
 *
 * Thin wrapper around @superdoc/layout-bridge findPageElement.
 * Will be internalized in a follow-up PR.
 */
export function findPageElement(domContainer: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  return bridgeFindPageElement(domContainer, clientX, clientY);
}

/**
 * Reads the layout epoch from DOM data attributes at the given viewport point.
 *
 * Copied from layout-bridge/src/index.ts readLayoutEpochFromDom. The bridge
 * keeps its own copy for the clickToPosition compatibility wrapper; this copy
 * is the editor-owned version used by PositionHitResolver.
 *
 * Picks the newest (highest) epoch in the hit chain to avoid stale descendants
 * blocking mapping.
 */
export function readLayoutEpochFromDom(domContainer: HTMLElement, clientX: number, clientY: number): number | null {
  const doc = domContainer.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.elementsFromPoint !== 'function') {
    return null;
  }

  let hitChain: Element[] = [];
  try {
    hitChain = doc.elementsFromPoint(clientX, clientY) ?? [];
  } catch {
    return null;
  }

  let latestEpoch: number | null = null;
  for (const el of hitChain) {
    if (!(el instanceof HTMLElement)) continue;
    if (!domContainer.contains(el)) continue;
    const raw = el.dataset.layoutEpoch;
    if (raw == null) continue;
    const epoch = Number(raw);
    if (!Number.isFinite(epoch)) continue;
    if (latestEpoch == null || epoch > latestEpoch) {
      latestEpoch = epoch;
    }
  }

  return latestEpoch;
}
