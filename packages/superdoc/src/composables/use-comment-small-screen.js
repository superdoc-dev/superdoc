import { onBeforeUnmount, ref } from 'vue';
import {
  DEFAULT_COMMENTS_DISPLAY_MODE,
  DEFAULT_COMMENTS_MIN_GUTTER_PX,
  DEFAULT_COMMENTS_SIDEBAR_LANE_PX,
  DEFAULT_DOCUMENT_VISIBLE_MIN_WIDTH_PX,
} from '../helpers/comment-small-screen.js';

const SUPERDOC_DOCUMENT_SELECTOR = '.superdoc__document';

const isValidCompactBreakpoint = (value) => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};
const getRequiredSidebarWidth = (documentWidth) => {
  return documentWidth + DEFAULT_COMMENTS_SIDEBAR_LANE_PX + DEFAULT_COMMENTS_MIN_GUTTER_PX;
};

export function useCommentSmallScreen({ commentsModuleConfig, superdocRoot, layers }) {
  const superdocContainerWidth = ref(0);
  const isCompactCommentsMode = ref(false);

  let commentsContainerResizeObserver = null;
  let compactMeasurementTarget = null;

  // A measurement target is valid only if it can provide a meaningful width.
  // `display: contents` is skipped because it has no own box to measure.
  const isValidMeasurementTarget = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const computed = typeof window !== 'undefined' ? window.getComputedStyle(element) : null;
    if (computed?.display === 'contents') return false;
    const clientWidth = Number(element.clientWidth ?? 0);
    const rectWidth = Number(element.getBoundingClientRect?.().width ?? 0);
    return (Number.isFinite(clientWidth) && clientWidth > 0) || (Number.isFinite(rectWidth) && rectWidth > 0);
  };

  // Resolve where "available width" should be read from:
  // explicit selector -> nearest measurable ancestor -> superdoc root.
  const resolveCompactMeasurementTarget = () => {
    const root = superdocRoot.value;
    const selector = commentsModuleConfig.value?.compactMeasurementSelector;
    if (typeof selector === 'string' && selector.trim().length > 0 && typeof document !== 'undefined') {
      const selected = document.querySelector(selector.trim());
      if (isValidMeasurementTarget(selected)) return selected;
    }
    let ancestor = root?.parentElement ?? null;
    while (ancestor) {
      if (isValidMeasurementTarget(ancestor)) return ancestor;
      ancestor = ancestor.parentElement;
    }
    if (isValidMeasurementTarget(root)) return root;
    if (root instanceof HTMLElement) return root;
    return null;
  };

  // Keep a single ResizeObserver bound to the current effective target and
  // rebind it when selector/DOM structure changes.
  const ensureCompactMeasurementObserver = () => {
    const ResizeObserverClass = typeof window !== 'undefined' ? window.ResizeObserver : undefined;
    if (typeof ResizeObserverClass === 'undefined') return;
    const nextTarget = resolveCompactMeasurementTarget();
    if (nextTarget === compactMeasurementTarget) return;

    if (commentsContainerResizeObserver) {
      commentsContainerResizeObserver.disconnect();
      commentsContainerResizeObserver = null;
    }

    compactMeasurementTarget = nextTarget;
    if (!compactMeasurementTarget) return;

    commentsContainerResizeObserver = new ResizeObserverClass(() => {
      recalculateCompactCommentsMode();
    });
    commentsContainerResizeObserver.observe(compactMeasurementTarget);
  };

  // Read available width with stable priority (`clientWidth` first, then rect width).
  const getAvailableCommentsContainerWidth = () => {
    ensureCompactMeasurementObserver();
    const clientWidth = Number(compactMeasurementTarget?.clientWidth ?? 0);
    if (Number.isFinite(clientWidth) && clientWidth > 0) {
      return clientWidth;
    }
    const rectWidth = Number(compactMeasurementTarget?.getBoundingClientRect?.().width ?? 0);
    if (Number.isFinite(rectWidth) && rectWidth > 0) {
      return rectWidth;
    }
    return 0;
  };

  // Measure actual document area width; fall back to layers/default when needed.
  const getMeasuredDocumentWidth = () => {
    const root = superdocRoot.value;
    const documentElement = root?.querySelector?.(SUPERDOC_DOCUMENT_SELECTOR);
    const layersElement = layers.value;
    const measuredFromDocument = Number(
      documentElement?.clientWidth ?? documentElement?.getBoundingClientRect?.().width ?? 0,
    );
    if (Number.isFinite(measuredFromDocument) && measuredFromDocument > 0) {
      return measuredFromDocument;
    }
    const measuredFromLayers = Number(
      layersElement?.clientWidth ?? layersElement?.getBoundingClientRect?.().width ?? 0,
    );
    if (Number.isFinite(measuredFromLayers) && measuredFromLayers > 0) {
      return measuredFromLayers;
    }
    return DEFAULT_DOCUMENT_VISIBLE_MIN_WIDTH_PX;
  };

  // Compute compact mode from policy:
  // explicit display mode wins, then optional breakpoint override, then formula threshold.
  const recalculateCompactCommentsMode = () => {
    const width = getAvailableCommentsContainerWidth();

    const commentsConfig = commentsModuleConfig.value;
    const displayMode = commentsConfig?.displayMode ?? DEFAULT_COMMENTS_DISPLAY_MODE;
    if (displayMode === 'sidebar') {
      superdocContainerWidth.value = width;
      isCompactCommentsMode.value = false;
      return;
    }
    if (displayMode === 'inline') {
      superdocContainerWidth.value = width;
      isCompactCommentsMode.value = true;
      return;
    }
    if (!(Number.isFinite(width) && width > 0)) {
      return;
    }
    superdocContainerWidth.value = width;

    const configuredBreakpoint = commentsConfig?.compactBreakpointPx;
    if (isValidCompactBreakpoint(configuredBreakpoint)) {
      isCompactCommentsMode.value = width < configuredBreakpoint;
      return;
    }

    const measuredDocumentWidth = getMeasuredDocumentWidth();
    const requiredWidth = getRequiredSidebarWidth(measuredDocumentWidth);
    isCompactCommentsMode.value = width < requiredWidth;
  };

  onBeforeUnmount(() => {
    if (commentsContainerResizeObserver) {
      commentsContainerResizeObserver.disconnect();
      commentsContainerResizeObserver = null;
    }
    compactMeasurementTarget = null;
  });

  return {
    superdocContainerWidth,
    isCompactCommentsMode,
    recalculateCompactCommentsMode,
    ensureCompactMeasurementObserver,
  };
}
