export const COMPACT_ANCHOR_SELECTOR = '[data-track-change-id], .superdoc-comment-highlight, .sd-comment-anchor';

export const DEFAULT_COMMENTS_SIDEBAR_LANE_PX = 320;
export const DEFAULT_COMMENTS_MIN_GUTTER_PX = 24;
export const DEFAULT_DOCUMENT_VISIBLE_MIN_WIDTH_PX = 816;
export const RIGHT_CLICK_COMMENT_SUPPRESS_MS = 250;
export const DEFAULT_COMMENTS_DISPLAY_MODE = 'sidebar';
export const VALID_COMMENTS_DISPLAY_MODES = new Set(['auto', 'sidebar', 'inline']);

/**
 * Whether a context-menu event landed inside the tracked-change carrier that
 * is already visually active. The review visual owner maintains this marker,
 * so the right-click path can stay synchronous and avoid a catalog lookup or
 * document-wide DOM query.
 *
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function isActiveTrackedChangeContextMenuTarget(target) {
  const element = /** @type {{ closest?: (selector: string) => unknown } | null} */ (target);
  return typeof element?.closest === 'function' && element.closest('.track-change-focused') != null;
}

/**
 * Normalize adaptive comments UI policy fields.
 *
 * @param {false | Record<string, unknown> | undefined} commentsConfig
 * @returns {false | Record<string, unknown> | undefined}
 */
export function normalizeCommentsUiPolicy(commentsConfig) {
  if (!commentsConfig || commentsConfig === false || typeof commentsConfig !== 'object') {
    return commentsConfig;
  }

  const normalized = { ...commentsConfig };
  const displayMode = normalized.displayMode;
  if (!VALID_COMMENTS_DISPLAY_MODES.has(displayMode)) {
    delete normalized.displayMode;
  }

  const breakpoint = normalized.compactBreakpointPx;
  if (!(typeof breakpoint === 'number' && Number.isFinite(breakpoint) && breakpoint >= 0)) {
    delete normalized.compactBreakpointPx;
  }

  const measurementSelector = normalized.compactMeasurementSelector;
  if (!(typeof measurementSelector === 'string' && measurementSelector.trim().length > 0)) {
    delete normalized.compactMeasurementSelector;
  } else {
    normalized.compactMeasurementSelector = measurementSelector.trim();
  }

  return normalized;
}
