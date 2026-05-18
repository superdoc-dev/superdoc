import { computed, ref, watch } from 'vue';

const POPOVER_WIDTH_PX = 320;
const SAFE_MARGIN_PX = 12;
const MIN_BOTTOM_SPACE_PX = 220;
const ANCHOR_TOP_OFFSET_PX = 16;

// Clamp a value into the given inclusive range.
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toNumber = (value) => Number(value);
const isFiniteNumber = (value) => Number.isFinite(value);

const getCommentAnchorId = (comment) => comment?.commentId ?? comment?.importedId ?? null;

// Primary anchor source: stored layout bounds for the active comment thread.
const resolveEntryAnchorBottom = (resolveCommentPositionEntry, comment) => {
  const { entry } = resolveCommentPositionEntry(getCommentAnchorId(comment));
  const boundsBottom = toNumber(entry?.bounds?.bottom);
  if (isFiniteNumber(boundsBottom)) return boundsBottom;
  return toNumber(entry?.bounds?.top);
};

// Allow DOM-anchor fallback only in PDF-related contexts.
const isPdfContextForAnchorLookup = ({ selectionPosition, comment, pendingComment }) =>
  selectionPosition.value?.source === 'pdf' ||
  comment?.selection?.source === 'pdf' ||
  pendingComment.value?.selection?.source === 'pdf';

// PDF fallback when stored bounds are missing: read anchor position from DOM.
const resolvePdfDomAnchorBottom = ({ rootEl, layersRect, comment }) => {
  const anchorId = getCommentAnchorId(comment);
  if (anchorId == null) return NaN;
  const anchorElement = rootEl.querySelector(`.sd-comment-anchor[data-id="${String(anchorId)}"]`);
  if (!anchorElement || typeof anchorElement.getBoundingClientRect !== 'function') return NaN;
  const anchorRect = anchorElement.getBoundingClientRect();
  return toNumber(anchorRect.bottom) - toNumber(layersRect.top);
};

// Pending-comment fallback: derive anchor position from current selection coordinates.
const resolvePendingSelectionAnchorBottom = ({ comment, pendingComment, selectionPosition, activeZoom }) => {
  if (!pendingComment.value || comment?.commentId !== pendingComment.value?.commentId) return NaN;
  const selectedBottom = toNumber(selectionPosition.value?.bottom);
  if (isFiniteNumber(selectedBottom)) {
    const isPdf = selectionPosition.value?.source === 'pdf';
    const zoom = isPdf ? (activeZoom.value ?? 100) / 100 : 1;
    return selectedBottom * zoom;
  }
  const selectedTop = toNumber(selectionPosition.value?.top);
  if (!isFiniteNumber(selectedTop)) return NaN;
  const isPdf = selectionPosition.value?.source === 'pdf';
  const zoom = isPdf ? (activeZoom.value ?? 100) / 100 : 1;
  return selectedTop * zoom;
};

const toPopoverStyle = ({ top, left }) => ({
  top: `${Math.round(top)}px`,
  left: `${Math.round(left)}px`,
  right: 'auto',
});

// Keep the popover inside the superdoc viewport with safe margins.
const resolvePopoverPosition = ({ rootRect, layersRect, anchorBottom }) => {
  const idealTop = layersRect.top - rootRect.top + anchorBottom + ANCHOR_TOP_OFFSET_PX;
  const maxTop = Math.max(SAFE_MARGIN_PX, rootRect.height - MIN_BOTTOM_SPACE_PX);
  const top = clamp(idealTop, SAFE_MARGIN_PX, maxTop);

  const rightCandidate = rootRect.width - (layersRect.left - rootRect.left + layersRect.width) + SAFE_MARGIN_PX;
  const maxLeft = Math.max(SAFE_MARGIN_PX, rootRect.width - POPOVER_WIDTH_PX - SAFE_MARGIN_PX);
  const left = clamp(rootRect.width - rightCandidate - POPOVER_WIDTH_PX, SAFE_MARGIN_PX, maxLeft);

  return { top, left };
};

export function useCompactCommentPopover({
  activeComment,
  pendingComment,
  activeCompactComment,
  showCommentsSidebar,
  selectionPosition,
  activeZoom,
  superdocRoot,
  layers,
  resolveCommentPositionEntry,
  clearActiveComment,
  clearPendingComment,
}) {
  const fallback = {
    top: '12px',
    right: '12px',
  };
  const compactPopoverLayoutTick = ref(0);

  let compactPopoverRafId = null;
  let compactPopoverReturnFocusEl = null;

  const compactCommentPopoverStyle = computed(() => {
    void compactPopoverLayoutTick.value;

    const comment = activeCompactComment.value;
    if (!comment) return fallback;

    const rootEl = superdocRoot.value;
    const layersEl = layers.value;
    if (!rootEl || !layersEl) return fallback;

    const rootRect = rootEl.getBoundingClientRect();
    const layersRect = layersEl.getBoundingClientRect();
    let anchorBottom = resolveEntryAnchorBottom(resolveCommentPositionEntry, comment);

    if (!isFiniteNumber(anchorBottom) && isPdfContextForAnchorLookup({ selectionPosition, comment, pendingComment })) {
      anchorBottom = resolvePdfDomAnchorBottom({ rootEl, layersRect, comment });
    }

    if (!isFiniteNumber(anchorBottom)) {
      anchorBottom = resolvePendingSelectionAnchorBottom({
        comment,
        pendingComment,
        selectionPosition,
        activeZoom,
      });
    }

    if (!isFiniteNumber(anchorBottom)) return fallback;

    const position = resolvePopoverPosition({ rootRect, layersRect, anchorBottom });
    return toPopoverStyle(position);
  });

  // Recompute style on compact-popover-relevant state changes via RAF.
  watch(
    [activeComment, pendingComment, selectionPosition, activeZoom, showCommentsSidebar],
    () => {
      const requestAnimationFrameFn = typeof window !== 'undefined' ? window.requestAnimationFrame : null;
      const cancelAnimationFrameFn = typeof window !== 'undefined' ? window.cancelAnimationFrame : null;
      if (compactPopoverRafId != null) {
        cancelAnimationFrameFn?.(compactPopoverRafId);
      }
      if (!requestAnimationFrameFn) return;
      compactPopoverRafId = requestAnimationFrameFn(() => {
        compactPopoverLayoutTick.value += 1;
        compactPopoverRafId = null;
      });
    },
    { deep: false },
  );

  // Capture focus source when compact popover becomes active.
  watch(
    activeCompactComment,
    (current, previous) => {
      if (!previous && current) {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement) {
          compactPopoverReturnFocusEl = activeEl;
        }
      }
    },
    { deep: false },
  );

  // Close compact popover and restore focus to the triggering element.
  const closeCompactCommentPopover = () => {
    if (!activeCompactComment.value) return;
    if (pendingComment.value) {
      clearPendingComment();
      clearActiveComment();
    } else {
      clearActiveComment();
    }
    if (compactPopoverReturnFocusEl && typeof compactPopoverReturnFocusEl.focus === 'function') {
      compactPopoverReturnFocusEl.focus();
    }
    compactPopoverReturnFocusEl = null;
  };

  // Release transient RAF/focus state on SuperDoc unmount.
  const cleanupCompactCommentPopover = () => {
    const cancelAnimationFrameFn = typeof window !== 'undefined' ? window.cancelAnimationFrame : null;
    if (compactPopoverRafId != null) {
      cancelAnimationFrameFn?.(compactPopoverRafId);
      compactPopoverRafId = null;
    }
    compactPopoverReturnFocusEl = null;
  };

  return {
    compactCommentPopoverStyle,
    closeCompactCommentPopover,
    cleanupCompactCommentPopover,
  };
}
