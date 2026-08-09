/* global CSS, queueMicrotask */
import { markRaw } from 'vue';
import LinkInput from '../internal/toolbar/built-in/LinkInput.vue';
import { scrollToElement } from '../internal/toolbar/built-in/scroll-helpers.js';

/** @typedef {import('../core/types/index.js').LinkPopoverContext} LinkPopoverContext */
/** @typedef {import('../core/types/index.js').LinkPopoverResolution} LinkPopoverResolution */
/** @typedef {import('../core/types/index.js').LinkPopoverResolver} LinkPopoverResolver */
/** @typedef {import('../core/surface-manager.js').SurfaceManager} SurfaceManager */
/** @typedef {import('../core/types/index.js').SurfaceHandle} SurfaceHandle */
/** @typedef {import('../core/types/index.js').SurfaceOutcome} SurfaceOutcome */
/** @typedef {import('../core/types/index.js').SurfaceRequest} SurfaceRequest */
/** @typedef {import('../core/types/index.js').DirectSurfaceRequest} DirectSurfaceRequest */
/** @typedef {import('../core/types/index.js').ExternalSurfaceRenderContext} ExternalSurfaceRenderContext */
/** @typedef {import('../core/types/index.js').DocumentMode} DocumentMode */
/** @typedef {import('../core/types/index.js').Editor} Editor */
/** @typedef {import('../public/ui/types.js').SuperDocUI} SuperDocUI */

/**
 * A single-block text-selection target in the Document API `query.match`
 * result shape.
 * @typedef {Object} TextSelectionTarget
 * @property {'selection'} kind
 * @property {{ kind: 'text', blockId: string, offset: number }} start
 * @property {{ kind: 'text', blockId: string, offset: number }} end
 */

/**
 * Block-anchored address carried by a Document API hyperlink record.
 * @typedef {Object} HyperlinkAddress
 * @property {{ start?: { blockId?: string, offset?: number }, end?: { blockId?: string, offset?: number } }} [anchor]
 */

/**
 * The subset of a Document API hyperlink record this composable reads. The
 * records come from the async `doc.hyperlinks` facade, so every field is
 * optional here.
 * @typedef {Object} HyperlinkRecord
 * @property {string} [rId]
 * @property {string} [text]
 * @property {string} [externalTarget]
 * @property {string} [anchor]
 * @property {string} [targetKind]
 * @property {string} [hyperlinkNodeId]
 * @property {HyperlinkAddress} [address]
 */

/**
 * A block record as read from `doc.blocks.list()`.
 * @typedef {Object} BlockRecord
 * @property {number} [ordinal]
 * @property {string} [nodeId]
 */

/**
 * Result of `doc.blocks.list()` as read here.
 * @typedef {Object} BlocksListResult
 * @property {BlockRecord[]} [blocks]
 */

/**
 * One item of a `doc.query.match` result as read here.
 * @typedef {Object} QueryMatchItem
 * @property {TextSelectionTarget} [target]
 */

/**
 * Result of `doc.query.match` as read here.
 * @typedef {Object} QueryMatchResult
 * @property {QueryMatchItem[]} [items]
 */

/**
 * One story entry of a `doc.hyperlinks.list()` result.
 * @typedef {Object} HyperlinkStory
 * @property {string} [storyId]
 * @property {HyperlinkRecord[]} [hyperlinks]
 */

/**
 * Result of `doc.hyperlinks.list()` as read here.
 * @typedef {Object} HyperlinksListResult
 * @property {HyperlinkStory[]} [stories]
 */

/**
 * Result of `doc.hyperlinks.get()` as read here.
 * @typedef {Object} HyperlinkGetResult
 * @property {boolean} [success]
 * @property {HyperlinkRecord} [hyperlink]
 */

/**
 * Result of `doc.bookmarks.get()` as read here (Document API `BookmarkInfo`).
 * `range.from.blockId` is the bookmark's `w14:paraId`, used to find/reveal
 * the target paragraph. `address.story` is populated for non-body
 * bookmarks (omitted for body) — used to scope this fix to body targets,
 * since `revealBodyTarget`/`pageIndexForBodyTarget` are body-only.
 * @typedef {Object} BookmarkGetResult
 * @property {{ story?: { kind?: string, storyType?: string } }} [address]
 * @property {{ from?: { blockId?: string } }} [range]
 */

/**
 * The narrow Document API subset this composable reads. The host facade
 * (`Editor['doc']`) carries no typed surface, so the facades and their results
 * are declared structurally here with every field optional; the call sites
 * keep their runtime narrowing (`Array.isArray`, `typeof`, `?.`) before use.
 * The async-capable facades may return promises, so their results are awaited
 * through `Promise.resolve(...)`.
 * @typedef {Object} LinkPopoverDocumentApi
 * @property {{ list?: () => BlocksListResult | null | undefined } | null} [blocks]
 * @property {{ match?: (query: { select: { type: 'text', pattern: string, caseSensitive: boolean }, require: 'any' }) => QueryMatchResult | null | undefined } | null} [query]
 * @property {{ list?: () => HyperlinksListResult | Promise<HyperlinksListResult | null | undefined> | null | undefined, get?: (input: { storyId: string, hyperlinkNodeId: string }) => HyperlinkGetResult | Promise<HyperlinkGetResult | null | undefined> | null | undefined } | null} [hyperlinks]
 * @property {{ get?: (input: { target: { kind: 'entity', entityType: 'bookmark', name: string } }) => BookmarkGetResult | Promise<BookmarkGetResult | null | undefined> | null | undefined } | null} [bookmarks]
 */

/**
 * Result of `activeEditor.pageMetrics.revealBodyTarget()` as read here
 * (`V2EditorHostRevealBodyTargetResult`). Only available in editing/
 * suggesting mode — the host rejects with `editing-not-mounted` in
 * viewing mode.
 * @typedef {Object} RevealBodyTargetResult
 * @property {'revealed' | 'rejected'} [status]
 * @property {string} [reason]
 */

/**
 * The `v2-link-click` payload the shell relays from the v2 host's
 * `onLinkClick` callback.
 * @typedef {Object} LinkClickPayload
 * @property {string} href
 * @property {string | null} target
 * @property {string | null} rel
 * @property {string | null} tooltip
 * @property {HTMLAnchorElement} element
 * @property {number} clientX
 * @property {number} clientY
 * @property {DocumentMode} documentMode
 */

/**
 * Hyperlink identity resolved from the Document API for a clicked anchor.
 * @typedef {Object} ResolvedHyperlinkTarget
 * @property {string} storyId
 * @property {string | undefined} hyperlinkNodeId
 * @property {string} href
 * @property {string | undefined} text
 * @property {string | undefined} targetKind
 * @property {TextSelectionTarget | null} textTarget
 */

const FLOATING_SURFACE_ID = 'link-popover';
const RECENT_OUTSIDE_CLOSE_MS = 500;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isThenable = (value) =>
  Boolean(
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (/** @type {{ then?: unknown }} */ (value).then) === 'function',
  );

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/**
 * @param {unknown} value
 * @returns {value is LinkPopoverResolution}
 */
function isValidResolution(value) {
  if (!isObject(value)) return false;
  if (value.type === 'default' || value.type === 'none') return true;
  if (value.type === 'custom') return value.component != null;
  if (value.type === 'external') return typeof value.render === 'function';
  return false;
}

/**
 * @param {unknown} error
 * @returns {Error}
 */
function toError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * @param {string | null | undefined} rel
 * @returns {string}
 */
function linkOpenFeatures(rel) {
  if (typeof rel !== 'string') return '';
  return rel
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token === 'noopener' || token === 'noreferrer')
    .filter((token, index, tokens) => tokens.indexOf(token) === index)
    .join(',');
}

/**
 * @param {string | null | undefined} rel
 * @param {string} target
 * @returns {string}
 */
function linkOpenFeaturesForTarget(rel, target) {
  const features = linkOpenFeatures(rel);
  if (target !== '_blank') return features;
  const tokens = features ? features.split(',') : [];
  if (!tokens.includes('noopener')) tokens.unshift('noopener');
  return tokens.join(',');
}

/**
 * @param {string} value
 * @returns {string}
 */
function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/['"\\]/g, '\\$&');
}

/**
 * @param {HTMLElement | null | undefined} fragment
 * @returns {number | null}
 */
function readSourceParagraphOrdinal(fragment) {
  const sourceAnchor = fragment?.dataset?.sourceAnchor;
  if (typeof sourceAnchor !== 'string') return null;
  try {
    const parsed = JSON.parse(sourceAnchor);
    const path = parsed?.sourceRef?.xpathLikePath;
    const match = typeof path === 'string' ? path.match(/w:p\[ordinal=(\d+)\]/) : null;
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * @param {HTMLElement | null | undefined} fragment
 * @param {LinkPopoverDocumentApi | null | undefined} doc
 * @returns {string | undefined}
 */
function readApiBlockId(fragment, doc) {
  const ordinal = readSourceParagraphOrdinal(fragment);
  const blocks = doc?.blocks?.list?.()?.blocks;
  const block = Array.isArray(blocks) ? blocks.find((candidate) => candidate.ordinal === ordinal) : null;
  return typeof block?.nodeId === 'string' ? block.nodeId : fragment?.dataset?.blockId;
}

/**
 * @param {HTMLAnchorElement} element
 * @param {LinkPopoverDocumentApi | null | undefined} doc
 * @returns {TextSelectionTarget | null}
 */
function readClickedTextTarget(element, doc) {
  // `closest()` returns `Element`; painted block fragments are HTML elements
  // (the code below reads `dataset`), so narrow the DOM type here.
  const fragment = /** @type {HTMLElement | null | undefined} */ (element?.closest?.('[data-block-id][data-pm-start]'));
  const blockId = readApiBlockId(fragment, doc);
  if (!blockId || !fragment || !element?.ownerDocument) return null;
  const pmStart = Number(element?.dataset?.pmStart);
  const pmEnd = Number(element?.dataset?.pmEnd);
  if (Number.isFinite(pmStart) && Number.isFinite(pmEnd) && pmEnd > pmStart) {
    const fragmentPmStart = Number(fragment?.dataset?.pmStart);
    const shouldConvertAbsolutePmOffset = Number.isFinite(fragmentPmStart) && pmStart >= fragmentPmStart;
    const start = shouldConvertAbsolutePmOffset ? pmStart - fragmentPmStart : pmStart;
    const end = shouldConvertAbsolutePmOffset ? pmEnd - fragmentPmStart : pmEnd;
    if (start < 0 || end <= start) return null;
    return {
      kind: 'selection',
      start: { kind: 'text', blockId, offset: start },
      end: { kind: 'text', blockId, offset: end },
    };
  }
  const ownerWindow = element.ownerDocument.defaultView;
  const nodeFilter = ownerWindow?.NodeFilter;
  const nodeCtor = ownerWindow?.Node;
  if (!nodeFilter || !nodeCtor) return null;

  let start = 0;
  const walker = element.ownerDocument.createTreeWalker(fragment, nodeFilter.SHOW_ELEMENT | nodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node === element) break;
    if (node.nodeType === nodeCtor.TEXT_NODE && !element.contains(node)) {
      start += node.textContent?.length ?? 0;
    }
    node = walker.nextNode();
  }
  if (node !== element) return null;
  const end = start + (element.textContent?.length ?? 0);
  if (end <= start) return null;
  return {
    kind: 'selection',
    start: { kind: 'text', blockId, offset: start },
    end: { kind: 'text', blockId, offset: end },
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeHrefForMatch(value) {
  if (typeof value !== 'string') return '';
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return value;
  }
}

/**
 * @param {HyperlinkRecord} hyperlink
 * @returns {string}
 */
function hrefFromHyperlink(hyperlink) {
  if (typeof hyperlink?.externalTarget === 'string' && hyperlink.externalTarget) return hyperlink.externalTarget;
  if (typeof hyperlink?.anchor === 'string' && hyperlink.anchor) return `#${hyperlink.anchor}`;
  return '';
}

/**
 * @param {HyperlinkAddress | null | undefined} address
 * @returns {TextSelectionTarget | null}
 */
function textTargetFromHyperlinkAddress(address) {
  const start = address?.anchor?.start;
  const end = address?.anchor?.end;
  if (typeof start?.blockId !== 'string' || typeof start?.offset !== 'number') return null;
  if (typeof end?.blockId !== 'string' || typeof end?.offset !== 'number') return null;
  if (start.blockId !== end.blockId) return null;
  return {
    kind: 'selection',
    start: { kind: 'text', blockId: start.blockId, offset: start.offset },
    end: { kind: 'text', blockId: end.blockId, offset: end.offset },
  };
}

/**
 * @param {TextSelectionTarget | null} textTarget
 * @param {HyperlinkAddress | null | undefined} address
 * @returns {boolean}
 */
function textTargetMatchesHyperlinkAddress(textTarget, address) {
  const target = textTargetFromHyperlinkAddress(address);
  if (!target) return false;
  return (
    target.start.blockId === textTarget?.start?.blockId &&
    target.start.offset === textTarget?.start?.offset &&
    target.end.blockId === textTarget?.end?.blockId &&
    target.end.offset === textTarget?.end?.offset
  );
}

/**
 * @param {LinkPopoverDocumentApi | null | undefined} doc
 * @param {string | undefined} text
 * @param {string | undefined} blockId
 * @returns {TextSelectionTarget | null}
 */
function textTargetFromQueryMatch(doc, text, blockId) {
  if (typeof text !== 'string' || !text) return null;
  const result = doc?.query?.match?.({
    select: { type: 'text', pattern: text, caseSensitive: true },
    require: 'any',
  });
  // `QueryMatchItem` declares the target shape this function reads; the
  // runtime still narrows each item before trusting it.
  const targets = (Array.isArray(result?.items) ? result.items : [])
    .map((item) => item?.target)
    .filter(
      /** @returns {target is TextSelectionTarget} */
      (target) => target?.kind === 'selection' && Boolean(target?.start?.blockId) && Boolean(target?.end?.blockId),
    );
  const blockTargets =
    typeof blockId === 'string'
      ? targets.filter((target) => target.start.blockId === blockId && target.end.blockId === blockId)
      : targets;
  if (blockTargets.length === 1) return blockTargets[0];
  if (typeof blockId === 'string') return null;
  return targets.length === 1 ? targets[0] : null;
}

/**
 * True when a clicked link element is inside a painted TOC entry
 * (`.superdoc-toc-entry`). TOC entry links navigate to their heading instead of
 * opening the link editor.
 * @param {Element | null | undefined} element
 */
function isTocEntryLinkElement(element) {
  return Boolean(element && typeof element.closest === 'function' && element.closest('.superdoc-toc-entry'));
}

/**
 * @param {Object} options
 * @param {() => SurfaceManager | null | undefined} options.getSurfaceManager
 * @param {() => Editor | null | undefined} options.getActiveEditor
 * @param {() => SuperDocUI | null | undefined} options.getUi
 * @param {() => LinkPopoverResolver | null | undefined} options.getResolver
 * @param {() => HTMLElement | null | undefined} options.getLayerElement
 * @param {(payload: { error: Error, source: string }) => void} options.emitException
 */
export function useLinkPopover({
  getSurfaceManager,
  getActiveEditor,
  getUi,
  getResolver,
  getLayerElement,
  emitException,
}) {
  /** @type {{ href: string, element: HTMLAnchorElement, handle: SurfaceHandle, pointerDownTarget: EventTarget | null, unbindPointerDown: (() => void) | null } | null} */
  let currentPopover = null;
  /** @type {{ href: string, element: HTMLAnchorElement, closedAt: number } | null} */
  let recentOutsideClose = null;
  let openGeneration = 0;

  function cancelPendingOpen() {
    openGeneration += 1;
  }

  /**
   * @param {SurfaceHandle | null | undefined} handle
   * @param {SurfaceOutcome} [outcome]
   */
  function clearCurrentPopover(handle, outcome) {
    if (!handle || !currentPopover || currentPopover.handle !== handle) return;
    const activePopover = currentPopover;
    activePopover.unbindPointerDown?.();
    const NodeCtor = activePopover.element.ownerDocument?.defaultView?.Node;
    const closedFromSameLinkPointer =
      NodeCtor != null &&
      activePopover.pointerDownTarget instanceof NodeCtor &&
      activePopover.element.contains(activePopover.pointerDownTarget);
    if (outcome?.status === 'closed' && outcome.reason === undefined && closedFromSameLinkPointer) {
      recentOutsideClose = {
        href: activePopover.href,
        element: activePopover.element,
        closedAt: Date.now(),
      };
    }
    currentPopover = null;
  }

  function closeCurrentPopover(reason = 'closed') {
    cancelPendingOpen();
    const activePopover = currentPopover;
    currentPopover = null;
    recentOutsideClose = null;
    activePopover?.unbindPointerDown?.();
    activePopover?.handle?.close?.(reason);
  }

  /**
   * @param {LinkPopoverContext} ctx
   * @returns {DirectSurfaceRequest}
   */
  function sharedFloatingConfig(ctx) {
    return {
      id: FLOATING_SURFACE_ID,
      mode: 'floating',
      closeOnEscape: true,
      floating: {
        top: ctx.position.top,
        left: ctx.position.left,
        autoFocus: true,
        closeOnOutsidePointerDown: true,
        width: 'auto',
      },
    };
  }

  /**
   * @param {LinkPopoverContext} ctx
   * @param {SurfaceHandle} handle
   */
  function rememberHandle(ctx, handle) {
    /** @type {{ href: string, element: HTMLAnchorElement, handle: SurfaceHandle, pointerDownTarget: EventTarget | null, unbindPointerDown: (() => void) | null }} */
    const activePopover = {
      href: ctx.href,
      element: ctx.element,
      handle,
      pointerDownTarget: null,
      unbindPointerDown: null,
    };
    const ownerDocument = ctx.element.ownerDocument;
    /** @param {PointerEvent} event */
    const onPointerDown = (event) => {
      activePopover.pointerDownTarget = event.target ?? null;
    };
    ownerDocument.addEventListener('pointerdown', onPointerDown, true);
    activePopover.unbindPointerDown = () => ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
    currentPopover = activePopover;
    recentOutsideClose = null;
    handle.result?.then?.(
      (outcome) => clearCurrentPopover(handle, outcome),
      () => clearCurrentPopover(handle),
    );
  }

  /**
   * Look up a real `<a name>` anchor, or a bookmark-marker span, in the
   * currently mounted DOM. The marker span
   * (`data-bookmark-marker`/`data-bookmark-name`) is a best-effort fast
   * path only: layout-engine measuring drops those zero-width marker runs
   * from paint whenever the wrapping paragraph has other visible content
   * (the standard shape for a TOC bookmark wrapping heading text,
   * `<w:bookmarkStart .../><w:r>Heading</w:r><w:bookmarkEnd/>`) — but it
   * DOES survive for a standalone/empty bookmark paragraph (a supported v2
   * shape, see `v2-layout-adapter/src/empty-paragraph.test.ts` and
   * `isSyntheticStandaloneBookmarkParagraph` in
   * `v2-host/src/compose-exact-complete-render.ts`), where it lets a
   * mounted bookmark scroll immediately without a Document API round trip.
   * `findPaintedParagraphByParaId` remains the reliable fallback for the
   * common (marker-not-painted) case.
   * @param {HTMLElement | null} container
   * @param {string} escapedAnchorName
   * @returns {HTMLElement | null}
   */
  function findMountedAnchor(container, escapedAnchorName) {
    return (
      container?.querySelector?.(
        `a[name='${escapedAnchorName}'], [data-bookmark-marker='start'][data-bookmark-name='${escapedAnchorName}']`,
      ) ?? null
    );
  }

  /**
   * Find the painted paragraph element for a `w14:paraId`, mirroring the
   * attribute chain `paintedParaIdElement` uses in v2-host
   * (`create-v2-editor-host.ts`) to confirm a paragraph is painted.
   * @param {HTMLElement | null} container
   * @param {string} paraId
   * @returns {HTMLElement | null}
   */
  function findPaintedParagraphByParaId(container, paraId) {
    if (!container) return null;
    const escaped = cssEscape(paraId);
    return (
      container.querySelector(`[data-source-node-id='${escaped}']`) ??
      container.querySelector(`[data-layout-paraid='${escaped}']`) ??
      container.querySelector(`[data-block-id$='/${escaped}']`) ??
      container.querySelector(`[data-layout-block-ref$='/${escaped}']`) ??
      null
    );
  }

  /**
   * Poll for an element across a bounded number of animation frames. Used
   * after `scrollToPage()` in review/viewing mode, where — unlike
   * `revealBodyTarget` in editing mode — there is no promise that resolves
   * once the deep-jumped page's geometry reconciles and paints.
   * @param {() => HTMLElement | null} lookup
   * @param {number} maxTicks
   * @returns {Promise<HTMLElement | null>}
   */
  function pollForElement(lookup, maxTicks = 30) {
    return new Promise((resolve) => {
      const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null;
      let ticks = 0;
      const tick = () => {
        const found = lookup();
        if (found || ticks >= maxTicks || typeof raf !== 'function') {
          resolve(found ?? null);
          return;
        }
        ticks += 1;
        raf(tick);
      };
      tick();
    });
  }

  /**
   * Move the editable caret to the start of a resolved target paragraph after
   * navigating to it. Mirrors V1's `goToAnchor`, whose final step places the
   * caret at the bookmark position: without it a V2 TOC click only scrolls, so
   * the caret stays wherever it last was (typically inside the TOC field) and
   * subsequent typing corrupts the TOC instead of editing the heading.
   *
   * Best-effort and body-story only. The authoring facade self-guards in
   * viewing mode (no editable selection target), so callers gate this to
   * editing/suggesting via `placeCaret`.
   * @param {string} blockId
   */
  async function placeCaretAtHeadingStart(blockId) {
    const setSelectionTarget = getActiveEditor()?.authoring?.setSelectionTarget;
    if (typeof setSelectionTarget !== 'function') return;

    const story = { kind: 'story', storyType: 'body' };
    const anchor = { kind: 'text', blockId, offset: 0, story };
    const target = { kind: 'selection', start: anchor, end: anchor, story };
    try {
      await Promise.resolve(setSelectionTarget({ target, collapse: 'start', focus: true }));
    } catch {
      // Caret placement is best-effort; the navigation scroll already landed.
    }
  }

  /**
   * Navigate to an internal `#anchor` link (TOC entries, bookmark links).
   * Tries a real `<a name>` anchor in the currently mounted DOM first, then
   * resolves the bookmark's target paragraph through the Document API and
   * scrolls to that paragraph by its `paraId` — not to a bookmark-marker
   * element, which layout-engine measuring may have excluded from paint.
   *
   * In editing/suggesting mode (`placeCaret`), also moves the caret to the
   * start of the resolved target paragraph, matching V1's `goToAnchor`.
   *
   * If the paragraph isn't mounted (the v2 layout engine only mounts a
   * sliding window of pages), asks the host to reveal it:
   *  - In editing/suggesting mode, `pageMetrics.revealBodyTarget` deep-jumps
   *    into unmounted pages and resolves once the target is painted. Any
   *    rejection here OTHER than `editing-not-mounted` is a real failure of
   *    this strong, paint-confirmed path and is left as a no-op rather than
   *    silently degrading to the weaker path below.
   *  - In viewing mode the host is mounted in "review" mode, where
   *    `revealBodyTarget` always rejects with reason `editing-not-mounted`
   *    (or is simply unpublished); only then falls back to
   *    `pageIndexForBodyTarget` + `scrollToPage` (neither gated on mount
   *    mode) and polls for paint, since neither returns a paint-complete
   *    promise.
   *
   * Out of scope: bookmarks outside the body story (headers/footers/
   * footnotes) — `revealBodyTarget`/`pageIndexForBodyTarget` are body-only.
   * @param {string | null | undefined} anchorUrl
   * @param {{ placeCaret?: boolean }} [options]
   */
  async function navigateToAnchor(anchorUrl, { placeCaret = false } = {}) {
    if (typeof anchorUrl !== 'string' || !anchorUrl.startsWith('#')) return;
    const anchorName = anchorUrl.slice(1);
    const escapedAnchorName = cssEscape(anchorName);

    const mountedAnchor = findMountedAnchor(getUi()?.viewport?.getHost?.() ?? null, escapedAnchorName);
    if (mountedAnchor) {
      scrollToElement(mountedAnchor);
      return;
    }

    /** @type {LinkPopoverDocumentApi | null | undefined} */
    const doc = getActiveEditor()?.doc;
    /** @type {BookmarkGetResult | null} */
    let bookmark = null;
    try {
      bookmark = await Promise.resolve(
        doc?.bookmarks?.get?.({ target: { kind: 'entity', entityType: 'bookmark', name: anchorName } }),
      );
      bookmark ??= null;
    } catch {
      bookmark = null;
    }
    const story = bookmark?.address?.story;
    if (story && story.storyType !== 'body') return;
    const blockId = bookmark?.range?.from?.blockId;
    if (typeof blockId !== 'string') return;

    // Move the caret to the heading first, before any scroll. Placing it after
    // an in-flight `scrollToElement` races the render surface's scroll gating
    // and snaps the viewport back to the top; done first (focus uses
    // `preventScroll`) it is inert, and the scroll below then wins.
    if (placeCaret) await placeCaretAtHeadingStart(blockId);

    const mountedParagraph = findPaintedParagraphByParaId(getUi()?.viewport?.getHost?.() ?? null, blockId);
    if (mountedParagraph) {
      scrollToElement(mountedParagraph);
      return;
    }

    const pageMetrics = getActiveEditor()?.pageMetrics;
    const revealBodyTarget =
      /** @type {((input: { paraId: string }) => Promise<RevealBodyTargetResult>) | undefined} */ (
        pageMetrics?.revealBodyTarget
      );
    let revealResult;
    try {
      revealResult = await revealBodyTarget?.({ paraId: blockId });
    } catch {
      revealResult = undefined;
    }
    if (revealResult?.status === 'revealed') {
      const revealedParagraph = findPaintedParagraphByParaId(getUi()?.viewport?.getHost?.() ?? null, blockId);
      if (revealedParagraph) scrollToElement(revealedParagraph);
      return;
    }

    // Only fall back to the weaker mode-agnostic page-jump primitives when
    // `revealBodyTarget` was never a viable path to begin with — either it
    // isn't published (no `pageMetrics`), or the host rejected specifically
    // because this is viewing mode (`editing-not-mounted`, the host mounts
    // in "review" mode there). Any OTHER rejection reason in editing mode
    // (e.g. `target-paragraph-not-mounted`, coverage/timeout reasons) is a
    // real failure of the strong (paint-confirmed) path and must not
    // silently degrade into the weaker scroll-and-poll path.
    if (revealBodyTarget && revealResult?.reason !== 'editing-not-mounted') return;

    const pageIndexForBodyTarget = /** @type {((input: { paraId: string }) => number | null) | undefined} */ (
      pageMetrics?.pageIndexForBodyTarget
    );
    const scrollToPage = /** @type {((pageIndex: number) => boolean) | undefined} */ (pageMetrics?.scrollToPage);
    const pageIndex = pageIndexForBodyTarget?.({ paraId: blockId });
    if (typeof pageIndex !== 'number' || !scrollToPage?.(pageIndex)) return;

    const revealedByScroll = await pollForElement(() =>
      findPaintedParagraphByParaId(getUi()?.viewport?.getHost?.() ?? null, blockId),
    );
    if (revealedByScroll) scrollToElement(revealedByScroll);
  }

  /**
   * @param {LinkPopoverContext} ctx
   * @returns {Promise<ResolvedHyperlinkTarget | null>}
   */
  async function resolveClickedHyperlink(ctx) {
    /** @type {LinkPopoverDocumentApi | null | undefined} */
    const doc = ctx.editor?.doc;
    let result;
    try {
      result = await Promise.resolve(doc?.hyperlinks?.list?.());
    } catch {
      return null;
    }
    const stories = Array.isArray(result?.stories) ? result.stories : [];
    const clickedRid = ctx.element?.dataset?.linkRid;
    const clickedText = ctx.element?.textContent ?? '';
    const clickedHref = normalizeHrefForMatch(ctx.href);
    const clickedTextTarget = readClickedTextTarget(ctx.element, doc);

    for (const story of stories) {
      // `HyperlinkStory` declares the record shape this loop reads; the
      // runtime still narrows the array before trusting it.
      const hyperlinks = Array.isArray(story?.hyperlinks) ? story.hyperlinks : [];
      /** @param {HyperlinkRecord} hyperlink */
      const hydrateHyperlink = async (hyperlink) => {
        if (!hyperlink?.hyperlinkNodeId || !story?.storyId || hyperlink.address) return hyperlink;
        try {
          const detailedResult = await Promise.resolve(
            doc?.hyperlinks?.get?.({
              storyId: story.storyId,
              hyperlinkNodeId: hyperlink.hyperlinkNodeId,
            }),
          );
          return detailedResult?.success && detailedResult.hyperlink ? detailedResult.hyperlink : hyperlink;
        } catch {
          return hyperlink;
        }
      };
      /** @param {HyperlinkRecord[]} matches */
      const addressHit = async (matches) => {
        if (!clickedTextTarget) return null;
        const hydratedMatches = await Promise.all(matches.map(hydrateHyperlink));
        const addressMatches = hydratedMatches.filter((hyperlink) =>
          textTargetMatchesHyperlinkAddress(clickedTextTarget, hyperlink.address),
        );
        return addressMatches.length === 1 ? addressMatches[0] : null;
      };
      const ridMatches = clickedRid ? hyperlinks.filter((hyperlink) => hyperlink.rId === clickedRid) : [];
      const exactRidMatches = ridMatches.filter((hyperlink) => hyperlink.text === clickedText);
      const exactTargetMatches = hyperlinks.filter((hyperlink) => {
        const target = normalizeHrefForMatch(hrefFromHyperlink(hyperlink));
        return target === clickedHref && hyperlink.text === clickedText;
      });
      const textMatches = hyperlinks.filter((hyperlink) => hyperlink.text === clickedText);
      const segmentMatches = hyperlinks.filter((hyperlink) => {
        const target = normalizeHrefForMatch(hrefFromHyperlink(hyperlink));
        return clickedText && target === clickedHref && hyperlink.text?.includes?.(clickedText);
      });
      const exactRidHit = exactRidMatches.length === 1 ? exactRidMatches[0] : null;
      const exactTargetHit = exactTargetMatches.length === 1 ? exactTargetMatches[0] : null;
      const textHit = textMatches.length === 1 ? textMatches[0] : null;
      const segmentHit = segmentMatches.length === 1 ? segmentMatches[0] : null;
      const ridHit = ridMatches.length === 1 ? ridMatches[0] : null;
      const resolvedHit =
        exactRidHit ??
        (await addressHit(exactRidMatches)) ??
        exactTargetHit ??
        (await addressHit(exactTargetMatches)) ??
        textHit ??
        (await addressHit(textMatches)) ??
        segmentHit ??
        (await addressHit(segmentMatches)) ??
        ridHit ??
        (await addressHit(ridMatches));
      if (resolvedHit?.hyperlinkNodeId && story?.storyId) {
        const detailedHit = await hydrateHyperlink(resolvedHit);
        const addressTarget = textTargetFromHyperlinkAddress(detailedHit.address);
        return {
          storyId: story.storyId,
          hyperlinkNodeId: detailedHit.hyperlinkNodeId,
          href: hrefFromHyperlink(detailedHit),
          text: detailedHit.text,
          targetKind: detailedHit.targetKind,
          textTarget:
            addressTarget ?? textTargetFromQueryMatch(doc, detailedHit.text, clickedTextTarget?.start?.blockId),
        };
      }
    }
    return null;
  }

  /**
   * @param {LinkClickPayload} payload
   * @returns {boolean}
   */
  function matchesRecentOutsideClose(payload) {
    if (!recentOutsideClose) return false;
    const isSameLink = recentOutsideClose.element === payload.element && recentOutsideClose.href === payload.href;
    const isRecent = Date.now() - recentOutsideClose.closedAt <= RECENT_OUTSIDE_CLOSE_MS;
    if (!isSameLink || !isRecent) return false;
    recentOutsideClose = null;
    return true;
  }

  /**
   * @param {LinkPopoverContext} ctx
   * @param {SurfaceRequest} request
   */
  function openSurfaceDeferred(ctx, request) {
    const manager = getSurfaceManager();
    if (!manager?.open) return;
    const generation = openGeneration;
    queueMicrotask(() => {
      if (generation !== openGeneration) return;
      const handle = manager.open(request);
      rememberHandle(ctx, handle);
    });
  }

  /** @param {LinkPopoverContext} ctx */
  function openDefaultPopover(ctx) {
    closeCurrentPopover('replace');

    // A TOC entry link is navigational, not an editable hyperlink: clicking it
    // jumps to the heading (MS Word behaviour) instead of opening the link
    // editor — in every mode, not just viewing. Editing the entry's heading text
    // is done by keyboard navigation, not by clicking the link. Non-TOC anchor
    // links keep the normal editing-mode popover.
    if (ctx.isAnchorLink && isTocEntryLinkElement(ctx.element)) {
      void navigateToAnchor(ctx.href, { placeCaret: ctx.documentMode !== 'viewing' });
      return;
    }

    if (ctx.documentMode === 'viewing') {
      if (ctx.isAnchorLink) {
        void navigateToAnchor(ctx.href);
      } else if (ctx.href) {
        const target = ctx.target || '_self';
        const features = linkOpenFeaturesForTarget(ctx.rel, target);
        if (features) {
          window.open(ctx.href, target, features);
        } else {
          window.open(ctx.href, target);
        }
      }
      return;
    }

    const closePopover = () => closeCurrentPopover('closed');
    /** @param {string | null | undefined} anchorUrl */
    const goToAnchor = (anchorUrl) => {
      closePopover();
      void navigateToAnchor(anchorUrl, { placeCaret: true });
    };
    const generation = openGeneration;
    /** @param {ResolvedHyperlinkTarget | null} hyperlinkTarget */
    const openWithHyperlinkTarget = (hyperlinkTarget) => {
      if (generation !== openGeneration) return;
      openSurfaceDeferred(ctx, {
        ...sharedFloatingConfig(ctx),
        // The `.vue` shim types SFC default exports as `unknown`; narrow to
        // `object` for `markRaw()` since the Vue compiler guarantees the SFC
        // default export is a component definition object.
        component: markRaw(/** @type {object} */ (LinkInput)),
        props: {
          href: hyperlinkTarget?.href || ctx.href,
          target: ctx.target,
          rel: ctx.rel,
          tooltip: ctx.tooltip,
          clickedElement: ctx.element,
          hyperlinkTarget,
          hyperlinkText: hyperlinkTarget?.text,
          textTarget: hyperlinkTarget?.textTarget ?? readClickedTextTarget(ctx.element, ctx.editor?.doc),
          documentMode: ctx.documentMode,
          ui: getUi(),
          closePopover,
          goToAnchor,
        },
      });
    };
    resolveClickedHyperlink(ctx).then(openWithHyperlinkTarget, () => openWithHyperlinkTarget(null));
  }

  /**
   * @param {LinkPopoverContext} ctx
   * @param {Extract<LinkPopoverResolution, { type: 'custom' }>} resolution
   */
  function openCustomPopover(ctx, resolution) {
    closeCurrentPopover('replace');
    const closePopover = () => closeCurrentPopover('closed');
    openSurfaceDeferred(ctx, {
      ...sharedFloatingConfig(ctx),
      // `component` is `unknown` on the public resolution type;
      // isValidResolution() guaranteed it non-null, so narrow to `object`
      // for `markRaw()`.
      component: markRaw(/** @type {object} */ (resolution.component)),
      props: {
        ...resolution.props,
        editor: ctx.editor,
        href: ctx.href,
        closePopover,
      },
    });
  }

  /**
   * @param {LinkPopoverContext} ctx
   * @param {Extract<LinkPopoverResolution, { type: 'external' }>} resolution
   */
  function openExternalPopover(ctx, resolution) {
    closeCurrentPopover('replace');
    const userRender = resolution.render;
    openSurfaceDeferred(ctx, {
      ...sharedFloatingConfig(ctx),
      /** @param {ExternalSurfaceRenderContext} surfaceCtx */
      render: (surfaceCtx) => {
        try {
          return userRender({
            container: surfaceCtx.container,
            closePopover: () => surfaceCtx.close('closed'),
            editor: ctx.editor,
            href: ctx.href,
          });
        } catch (error) {
          emitException({ error: toError(error), source: 'linkPopoverExternalRender' });
          surfaceCtx.close('external-error');
          const generation = openGeneration;
          queueMicrotask(() => {
            if (generation === openGeneration) openDefaultPopover(ctx);
          });
          return undefined;
        }
      },
    });
  }

  /**
   * @param {LinkClickPayload} payload
   * @returns {LinkPopoverContext}
   */
  function buildContext(payload) {
    const layerRect = getLayerElement()?.getBoundingClientRect?.();
    const layerLeft = typeof layerRect?.left === 'number' ? layerRect.left : 0;
    const layerTop = typeof layerRect?.top === 'number' ? layerRect.top : 0;
    return {
      // A link click always originates from a mounted editor surface, so the
      // active editor is present here; the public context type declares it
      // required.
      editor: /** @type {Editor} */ (getActiveEditor()),
      href: payload.href,
      target: payload.target,
      rel: payload.rel,
      tooltip: payload.tooltip,
      element: payload.element,
      clientX: payload.clientX,
      clientY: payload.clientY,
      isAnchorLink: payload.href.startsWith('#'),
      documentMode: payload.documentMode,
      position: {
        left: `${Math.max(0, payload.clientX - layerLeft)}px`,
        top: `${Math.max(0, payload.clientY - layerTop)}px`,
      },
      closePopover: () => closeCurrentPopover('closed'),
    };
  }

  /**
   * @param {LinkPopoverContext} ctx
   * @returns {LinkPopoverResolution}
   */
  function resolvePopover(ctx) {
    const resolver = getResolver();
    if (typeof resolver !== 'function') return { type: 'default' };

    try {
      const resolution = resolver(ctx);
      if (isThenable(resolution)) {
        emitException({
          error: new Error('modules.links.popoverResolver must return synchronously.'),
          source: 'linkPopoverResolver',
        });
        return { type: 'default' };
      }
      if (resolution == null) return { type: 'default' };
      if (!isValidResolution(resolution)) {
        emitException({
          error: new Error('modules.links.popoverResolver returned an invalid resolution.'),
          source: 'linkPopoverResolver',
        });
        return { type: 'default' };
      }
      return resolution;
    } catch (error) {
      emitException({ error: toError(error), source: 'linkPopoverResolver' });
      return { type: 'default' };
    }
  }

  /** @param {LinkClickPayload | null | undefined} payload */
  function handleLinkClick(payload) {
    if (!payload?.element || typeof payload.href !== 'string') return;
    cancelPendingOpen();
    if (currentPopover && currentPopover.element === payload.element && currentPopover.href === payload.href) {
      closeCurrentPopover('toggle');
      return;
    }
    if (matchesRecentOutsideClose(payload)) return;

    const ctx = buildContext(payload);
    const resolution = resolvePopover(ctx);

    if (resolution.type === 'none') {
      closeCurrentPopover('none');
      return;
    }
    if (resolution.type === 'custom') {
      openCustomPopover(ctx, resolution);
      return;
    }
    if (resolution.type === 'external') {
      openExternalPopover(ctx, resolution);
      return;
    }
    openDefaultPopover(ctx);
  }

  function destroy() {
    closeCurrentPopover('destroyed');
  }

  return {
    handleLinkClick,
    closeCurrentPopover,
    destroy,
  };
}
