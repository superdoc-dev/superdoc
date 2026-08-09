const COMMENT_FOCUS_VIEWPORT_RATIO = 0.38;
const COMMENT_HIGHLIGHT_SELECTOR = '.superdoc-comment-highlight';
const isElementVisibleInViewport = (element) => {
  if (typeof element?.getBoundingClientRect !== 'function') return false;

  const bounds = element.getBoundingClientRect();
  if (!Number.isFinite(bounds.top) || !Number.isFinite(bounds.bottom)) {
    return false;
  }

  return bounds.bottom > 0 && bounds.top < window.innerHeight;
};

const parseCommaSeparated = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseImportedIdMap = (value) => {
  const ids = [];
  if (!value) return ids;

  value.split(',').forEach((entry) => {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) return;

    ids.push(entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1));
  });

  return ids.filter(Boolean);
};

export const getPreferredCommentFocusTargetClientY = () => {
  return Math.round(window.innerHeight * COMMENT_FOCUS_VIEWPORT_RATIO);
};

export const getVisibleThreadAnchorClientY = (layersElement, positionEntry) => {
  const anchorTop = positionEntry?.bounds?.top;
  if (!Number.isFinite(anchorTop) || typeof layersElement?.getBoundingClientRect !== 'function') {
    return null;
  }

  const anchorClientY = layersElement.getBoundingClientRect().top + anchorTop;
  if (anchorClientY < 0 || anchorClientY >= window.innerHeight) {
    return null;
  }

  return anchorClientY;
};

export const getVisibleThreadHighlightClientY = (threadIds) => {
  if (typeof document === 'undefined') return null;

  const candidateIds = new Set((threadIds ?? []).map((id) => String(id)).filter(Boolean));
  if (candidateIds.size === 0) return null;

  let visibleTop = null;
  const highlights = document.querySelectorAll(COMMENT_HIGHLIGHT_SELECTOR);

  for (const highlight of highlights) {
    const highlightIds = new Set([
      ...parseCommaSeparated(highlight.getAttribute('data-comment-ids')),
      ...parseImportedIdMap(highlight.getAttribute('data-comment-imported-ids')),
    ]);

    const matchesThread = [...candidateIds].some((id) => highlightIds.has(id));
    if (!matchesThread) continue;
    if (!isElementVisibleInViewport(highlight)) continue;

    const highlightTop = highlight.getBoundingClientRect().top;
    if (!Number.isFinite(highlightTop)) continue;

    visibleTop = visibleTop == null ? highlightTop : Math.min(visibleTop, highlightTop);
  }

  return visibleTop;
};

export const scrollThreadAnchorToFocusTarget = (presentation, primaryThreadId, fallbackThreadId, targetClientY) => {
  if (!presentation || !Number.isFinite(targetClientY)) return null;

  const tryThread = (threadId) => {
    if (!threadId) return null;

    const reachableClientY = presentation.getReachableThreadAnchorClientY(threadId, targetClientY);
    if (!Number.isFinite(reachableClientY)) return null;

    const didResolveThread = presentation.scrollThreadAnchorToClientY(threadId, targetClientY, { behavior: 'auto' });
    return didResolveThread ? reachableClientY : null;
  };

  const primaryTargetY = tryThread(primaryThreadId);
  if (Number.isFinite(primaryTargetY)) {
    return primaryTargetY;
  }

  if (!fallbackThreadId || fallbackThreadId === primaryThreadId) {
    return null;
  }

  return tryThread(fallbackThreadId);
};
