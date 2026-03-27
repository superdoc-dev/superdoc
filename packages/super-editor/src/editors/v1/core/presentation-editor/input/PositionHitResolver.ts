/**
 * Editor-side pointer-hit orchestration.
 *
 * Replaces direct `clickToPosition()` calls in PresentationEditor and
 * EditorInputManager with a local seam that the editor owns.
 *
 * This module does NOT perform epoch mapping or position clamping — those
 * remain at the existing call sites in PresentationEditor / EditorInputManager.
 *
 * @module input/PositionHitResolver
 */

import type { Layout, FlowBlock, Measure } from '@superdoc/contracts';
import {
  type Point,
  type PositionHit,
  type PageGeometryHelper,
  resolvePositionHitFromDomPosition,
  clickToPositionGeometry,
} from '@superdoc/layout-bridge';
import { clickToPositionDom, findPageElement, readLayoutEpochFromDom } from '../../../dom-observer/index.js';

/**
 * Full pointer-hit resolution: DOM-first with geometry fallback.
 *
 * 1. If DOM args provided, tries DOM-based mapping.
 * 2. If DOM mapping succeeds, enriches the position into a PositionHit.
 * 3. If DOM mapping fails, computes a page hint from the DOM and falls back
 *    to geometry-only hit testing.
 * 4. If no DOM args provided, runs pure geometry hit testing.
 */
export function resolvePointerPositionHit(options: {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  containerPoint: Point;
  domContainer?: HTMLElement | null;
  clientX?: number;
  clientY?: number;
  geometryHelper?: PageGeometryHelper;
}): PositionHit | null {
  const { layout, blocks, measures, containerPoint, domContainer, clientX, clientY, geometryHelper } = options;
  const layoutEpoch = layout.layoutEpoch ?? 0;

  // DOM-based mapping when viewport coordinates are available
  if (domContainer != null && clientX != null && clientY != null) {
    const domPos = clickToPositionDom(domContainer, clientX, clientY);
    const domLayoutEpoch = readLayoutEpochFromDom(domContainer, clientX, clientY) ?? layoutEpoch;

    if (domPos != null) {
      return resolvePositionHitFromDomPosition(layout, blocks, measures, domPos, domLayoutEpoch);
    }

    // DOM mapping failed — derive a page hint from the DOM for the geometry fallback
    const pageEl = findPageElement(domContainer, clientX, clientY);
    if (pageEl) {
      const domPageIndex = Number(pageEl.dataset.pageIndex ?? 'NaN');
      if (Number.isFinite(domPageIndex) && domPageIndex >= 0 && domPageIndex < layout.pages.length) {
        const page = layout.pages[domPageIndex];
        const pageRect = pageEl.getBoundingClientRect();
        const layoutPageHeight = page.size?.h ?? layout.pageSize.h;
        const domPageHeight = pageRect.height;
        const effectiveZoom = domPageHeight > 0 && layoutPageHeight > 0 ? domPageHeight / layoutPageHeight : 1;
        const domPageRelativeY = (clientY - pageRect.top) / effectiveZoom;
        return clickToPositionGeometry(layout, blocks, measures, containerPoint, {
          geometryHelper,
          pageHint: { pageIndex: domPageIndex, pageRelativeY: domPageRelativeY },
        });
      }
    }
  }

  // Pure geometry path
  return clickToPositionGeometry(layout, blocks, measures, containerPoint, { geometryHelper });
}
