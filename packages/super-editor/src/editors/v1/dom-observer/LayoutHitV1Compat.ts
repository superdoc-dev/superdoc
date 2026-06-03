/**
 * Editor-side v1 compatibility adapter for the editor-neutral layout
 * hit-test / range-mapping substrate (prep-002).
 *
 * The neutral substrate landed in `prep-001` as `hitTestNeutral` /
 * `mapRangeToFragmentsNeutral` and the editor-neutral `data-layout-*`
 * datasets emitted by DomPainter. v1 consumers continue to address rendered
 * output through the PM-shaped `PositionHit` and `data-pm-*` datasets. This
 * module is the single editor-side place where the two surfaces meet.
 *
 * AIDEV-NOTE: compat-fallback - v1 callers consume `PositionHit` /
 * `data-pm-*`. Retire once a future v2 consumer takes ownership of the
 * neutral surface end-to-end. Adding behavior here is additive only —
 * nothing in this module may break the v1 contract.
 *
 * Hard rules (prep-002):
 *  - Public `PositionHit` shape MUST NOT change.
 *  - `data-pm-*` datasets MUST remain available for current v1 consumers.
 *  - Browser/editor pointer logic stays editor-owned (this file is editor-side).
 *  - No v2 runtime dependency is introduced.
 *
 * @module dom-observer/LayoutHitV1Compat
 */

import type {
  FlowBlock,
  Layout,
  LayoutSourceIdentity,
  LayoutStoryLocator,
  Measure,
  SourceAnchor,
} from '@superdoc/contracts';
import {
  type ClickToPositionGeometryOptions,
  type LayoutFragmentOpaqueRange,
  type LayoutHit,
  type LayoutRangeMapping,
  type LayoutRect,
  type PmOpaqueRange,
  type PageGeometryHelper,
  type Point,
  type PositionHit,
  hitTestNeutral,
  mapRangeToFragmentsNeutral,
  resolvePositionHitFromDomPosition,
  selectionToRects,
} from '@superdoc/layout-bridge';
import { DATA_ATTRS, DATASET_KEYS, decodeLayoutStoryDataset } from '@superdoc/dom-contract';
import { clickToPositionDom, findPageElement, readLayoutEpochFromDom } from './DomPointerMapping.js';

// ---------------------------------------------------------------------------
// LayoutHit ↔ PositionHit projection
// ---------------------------------------------------------------------------

/**
 * Project an editor-neutral `LayoutHit` into the v1 `PositionHit` shape.
 *
 * Today the neutral substrate carries `legacyPm` for every hit that
 * resolved against a PM-aware fragment. v1 callers can therefore continue
 * to consume `PositionHit` while interacting with the neutral entry points.
 *
 * Returns `null` when the neutral hit could not be projected — typically
 * because the underlying fragment did not carry `pmStart`/`pmEnd` (which
 * surfaces as a `pm-position-unavailable` diagnostic on the neutral hit).
 * Callers should treat `null` as the same "no v1 mapping" signal they get
 * from the existing `clickToPositionGeometry` path.
 */
export function layoutHitToPositionHit(hit: LayoutHit | null | undefined): PositionHit | null {
  if (!hit) return null;
  return hit.legacyPm ?? null;
}

/**
 * Editor-neutral pointer hit resolution.
 *
 * Mirrors {@link resolvePointerPositionHit} from
 * `presentation-editor/input/PositionHitResolver` but returns a
 * `LayoutHit` (with `legacyPm` populated for v1 callers). This is additive
 * — `resolvePointerPositionHit` keeps the historical signature and v1 call
 * sites are not switched today.
 */
export function resolvePointerLayoutHit(options: {
  layout: Layout;
  blocks: FlowBlock[];
  measures: Measure[];
  containerPoint: Point;
  domContainer?: HTMLElement | null;
  clientX?: number;
  clientY?: number;
  geometryHelper?: PageGeometryHelper;
}): LayoutHit | null {
  const { layout, blocks, measures, containerPoint, domContainer, clientX, clientY, geometryHelper } = options;

  if (domContainer != null && clientX != null && clientY != null) {
    const domPos = clickToPositionDom(domContainer, clientX, clientY);
    const domLayoutEpoch = readLayoutEpochFromDom(domContainer, clientX, clientY) ?? layout.layoutEpoch ?? 0;
    const pageHint = resolveDomPageHint(layout, domContainer, clientX, clientY);
    const neutralOptions: ClickToPositionGeometryOptions = {
      ...(geometryHelper ? { geometryHelper } : {}),
      ...(pageHint ? { pageHint } : {}),
    };
    const neutralHit = hitTestNeutral(layout, blocks, measures, containerPoint, neutralOptions);

    if (domPos != null) {
      const legacyPm = resolvePositionHitFromDomPosition(layout, blocks, measures, domPos, domLayoutEpoch);
      return mergeDomFirstHit({
        neutralHit,
        identity: resolveDomLayoutIdentity(domContainer, clientX, clientY),
        legacyPm,
        layoutRevision: layout.layoutEpoch ?? 0,
        pageIndex: pageHint?.pageIndex,
      });
    }

    if (neutralHit) {
      return neutralHit;
    }
  }

  const neutralOptions: ClickToPositionGeometryOptions | undefined = geometryHelper ? { geometryHelper } : undefined;
  return hitTestNeutral(layout, blocks, measures, containerPoint, neutralOptions);
}

function mergeDomFirstHit(options: {
  neutralHit: LayoutHit | null;
  identity: LayoutSourceIdentity | undefined;
  legacyPm: PositionHit | null;
  layoutRevision: number;
  pageIndex?: number;
}): LayoutHit | null {
  const { neutralHit, identity, legacyPm, layoutRevision, pageIndex } = options;
  const legacyFields = legacyPm ? { legacyPm } : {};
  const sourceAnchor = identity?.sourceAnchor ?? neutralHit?.sourceAnchor;
  const sourceAnchorFields = sourceAnchor !== undefined ? { sourceAnchor } : {};

  if (!identity) {
    return neutralHit ? { ...neutralHit, ...sourceAnchorFields, ...legacyFields } : null;
  }

  return {
    ...(neutralHit ?? {
      schema: identity.schema,
      layoutRevision,
      story: identity.story,
      blockRef: identity.blockRef,
      fragmentId: identity.fragmentId,
      identity,
      pageIndex: pageIndex ?? legacyPm?.pageIndex ?? 0,
    }),
    identity,
    story: identity.story,
    blockRef: identity.blockRef,
    fragmentId: identity.fragmentId,
    ...sourceAnchorFields,
    ...legacyFields,
  };
}

function resolveDomLayoutIdentity(
  domContainer: HTMLElement,
  clientX: number,
  clientY: number,
): LayoutSourceIdentity | undefined {
  const doc = domContainer.ownerDocument as
    | (Document & { elementsFromPoint?: (x: number, y: number) => Element[] })
    | null;
  if (typeof doc?.elementsFromPoint !== 'function') {
    return undefined;
  }

  let hitChain: Element[] = [];
  try {
    hitChain = doc.elementsFromPoint(clientX, clientY) ?? [];
  } catch {
    return undefined;
  }

  for (const element of hitChain) {
    if (!(element instanceof HTMLElement)) continue;
    const identity = findNearestRenderedElementIdentity(element, domContainer);
    if (identity) return identity;
  }

  return undefined;
}

function resolveDomPageHint(
  layout: Layout,
  domContainer: HTMLElement,
  clientX: number,
  clientY: number,
): ClickToPositionGeometryOptions['pageHint'] | undefined {
  const pageEl = findPageElement(domContainer, clientX, clientY);
  if (!pageEl) return undefined;

  const pageIndex = Number(pageEl.dataset.pageIndex ?? 'NaN');
  if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= layout.pages.length) {
    return undefined;
  }

  const page = layout.pages[pageIndex];
  const pageRect = pageEl.getBoundingClientRect();
  const layoutPageHeight = page.size?.h ?? layout.pageSize.h;
  const domPageHeight = pageRect.height;
  const effectiveZoom = domPageHeight > 0 && layoutPageHeight > 0 ? domPageHeight / layoutPageHeight : 1;

  return {
    pageIndex,
    pageRelativeY: (clientY - pageRect.top) / effectiveZoom,
  };
}

// ---------------------------------------------------------------------------
// Selection-range neutral mapping (PM range → fragment subranges)
// ---------------------------------------------------------------------------

/**
 * Map a v1 PM selection range onto editor-neutral fragment subranges.
 *
 * Wraps `mapRangeToFragmentsNeutral` and supplies `selectionToRects` as the
 * PM-rect producer so callers do not need to know about that internal
 * dependency. Existing v1 selection painting continues to call
 * `selectionToRects` directly; this entry point is additive and used by
 * future neutral consumers and by tests proving parity.
 */
export function mapPmRangeToLayoutFragments(
  layout: Layout,
  blocks: FlowBlock[],
  measures: Measure[],
  range: PmOpaqueRange,
): LayoutRangeMapping {
  // Cast — `selectionToRects` returns the layout-bridge `Rect` shape which
  // is structurally compatible with `LayoutRect` (same fields). Both types
  // exist for historical reasons and the cast keeps this adapter's surface
  // typed against the neutral contract.
  return mapRangeToFragmentsNeutral(
    layout,
    blocks,
    measures,
    range,
    selectionToRects as unknown as (l: Layout, b: FlowBlock[], m: Measure[], from: number, to: number) => LayoutRect[],
  );
}

/**
 * Variant overload for already-known fragment ids — useful when a future
 * neutral consumer holds opaque fragment identifiers and wants their
 * page-positioned rectangles back.
 */
export function mapFragmentIdsToLayoutFragments(
  layout: Layout,
  blocks: FlowBlock[],
  measures: Measure[],
  range: LayoutFragmentOpaqueRange,
): LayoutRangeMapping {
  return mapRangeToFragmentsNeutral(layout, blocks, measures, range);
}

// ---------------------------------------------------------------------------
// DOM dataset compatibility helpers (data-layout-* ↔ data-pm-*)
// ---------------------------------------------------------------------------

/**
 * Result of reading a rendered element's identity through the explicit
 * compatibility helper.
 *
 * The neutral fields (`fragmentId`, `blockRef`, `story`) come from the
 * `data-layout-*` datasets stamped by DomPainter (prep-001). The legacy
 * `pm` field is the existing `data-pm-start`/`data-pm-end` pair, preserved
 * so v1 consumers do not need to fork their reads.
 */
export type RenderedElementIdentity = {
  fragmentId?: string;
  blockRef?: string;
  story?: LayoutStoryLocator;
  sourceAnchor?: SourceAnchor;
  pm?: { start: number; end: number };
};

/**
 * Read both the neutral identity datasets and the legacy PM datasets from a
 * rendered element.
 *
 * v1 consumers that today reach for `dataset.pmStart` / `dataset.pmEnd`
 * directly can call this helper to pick up the parallel neutral identity
 * without rewriting their hot paths. The function is intentionally cheap —
 * just dataset reads, no DOM walks.
 *
 * `data-pm-*` reads remain available regardless of whether neutral datasets
 * are present.
 */
export function readRenderedElementIdentity(element: HTMLElement | null | undefined): RenderedElementIdentity {
  if (!element) return {};

  const result: RenderedElementIdentity = {};

  const fragmentId = element.dataset[DATASET_KEYS.LAYOUT_FRAGMENT_ID];
  if (fragmentId) result.fragmentId = fragmentId;

  const blockRef = element.dataset[DATASET_KEYS.LAYOUT_BLOCK_REF];
  if (blockRef) result.blockRef = blockRef;

  const rawStory = element.dataset[DATASET_KEYS.LAYOUT_STORY];
  if (typeof rawStory === 'string' && rawStory.length > 0) {
    const story = decodeLayoutStoryDataset(rawStory);
    if (story.kind !== 'unknown') {
      result.story = story;
    }
  }

  const sourceAnchor = readSourceAnchorDataset(element);
  if (sourceAnchor) {
    result.sourceAnchor = sourceAnchor;
  }

  const pmStartRaw = element.dataset[DATASET_KEYS.PM_START];
  const pmEndRaw = element.dataset[DATASET_KEYS.PM_END];
  if (pmStartRaw != null && pmEndRaw != null) {
    const pmStart = Number(pmStartRaw);
    const pmEnd = Number(pmEndRaw);
    if (Number.isFinite(pmStart) && Number.isFinite(pmEnd)) {
      result.pm = { start: pmStart, end: pmEnd };
    }
  }

  return result;
}

/**
 * Read the nearest neutral identity from `element` or any of its ancestors
 * up to (and including) `container`.
 *
 * Returns `undefined` when no element in the chain carries a usable neutral
 * identity. Callers that still need PM positions should fall back to
 * `data-pm-*` (which {@link readRenderedElementIdentity} continues to
 * expose).
 */
export function findNearestRenderedElementIdentity(
  element: HTMLElement | null | undefined,
  container?: HTMLElement | null,
): LayoutSourceIdentity | undefined {
  let cursor: HTMLElement | null = element ?? null;
  let nearestSourceAnchor: SourceAnchor | undefined;
  while (cursor) {
    nearestSourceAnchor ??= readSourceAnchorDataset(cursor);
    const fragmentId = cursor.dataset?.[DATASET_KEYS.LAYOUT_FRAGMENT_ID];
    const blockRef = cursor.dataset?.[DATASET_KEYS.LAYOUT_BLOCK_REF];
    const rawStory = cursor.dataset?.[DATASET_KEYS.LAYOUT_STORY];
    if (fragmentId && blockRef) {
      const story = decodeLayoutStoryDataset(rawStory);
      if (story.kind !== 'unknown') {
        return {
          schema: 'layout-identity/1',
          story,
          blockRef,
          fragmentId,
          sourceAnchor: nearestSourceAnchor,
        };
      }
    }
    if (container && cursor === container) break;
    cursor = cursor.parentElement;
  }
  return undefined;
}

function readSourceAnchorDataset(element: HTMLElement): SourceAnchor | undefined {
  const raw = element.dataset.sourceAnchor;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as SourceAnchor;
  } catch {
    return undefined;
  }
}

/**
 * Find a rendered element by neutral `LayoutFragmentId`.
 *
 * v1 today locates elements by PM range via {@link DomPositionIndex}.
 * Neutral consumers should locate elements by fragment id; this helper is
 * the explicit adapter they call. Returns the first element whose
 * `data-layout-fragment-id` matches, or `null`.
 */
export function findElementByLayoutFragmentId(
  container: HTMLElement | null | undefined,
  fragmentId: string | null | undefined,
): HTMLElement | null {
  if (!container || !fragmentId) return null;
  return container.querySelector<HTMLElement>(`[${DATA_ATTRS.LAYOUT_FRAGMENT_ID}="${cssEscape(fragmentId)}"]`);
}

/**
 * Minimal CSS.escape polyfill for the attribute selector built in
 * {@link findElementByLayoutFragmentId}. `LayoutFragmentId` values today
 * include `:` and `,` characters which need escaping inside attribute
 * selectors. We avoid pulling in a runtime polyfill by hand-escaping the
 * smallest set of characters the fragment-id format actually uses.
 */
function cssEscape(value: string): string {
  if (typeof (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape === 'function') {
    return (globalThis as { CSS: { escape: (v: string) => string } }).CSS.escape(value);
  }
  return value.replace(/["\\\n\r\t]/g, (ch) => `\\${ch}`);
}
