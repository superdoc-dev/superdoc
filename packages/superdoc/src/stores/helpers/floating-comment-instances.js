const HEADER_FOOTER_TRACKED_CHANGE_STORY_TYPE = 'headerFooterPart';

const toFinitePageIndex = (value) => {
  return Number.isFinite(value) ? Number(value) : null;
};

const buildPageScopedInstanceId = (positionKey, pageIndex) => {
  return `${positionKey}::page:${pageIndex}`;
};

const matchesTrackedChangePositionAlias = (positionKey, alias) => {
  const normalizedPositionKey = String(positionKey);
  const normalizedAlias = String(alias);
  return (
    normalizedPositionKey === normalizedAlias ||
    (normalizedPositionKey.startsWith('tc::') && normalizedPositionKey.endsWith(`::${normalizedAlias}`))
  );
};

const aggregateRectBounds = (rects) => {
  if (!Array.isArray(rects) || rects.length === 0) {
    return null;
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  rects.forEach((rect) => {
    if (![rect?.left, rect?.top, rect?.right, rect?.bottom].every(Number.isFinite)) {
      return;
    }

    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  });

  if (![left, top, right, bottom].every(Number.isFinite)) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

const groupRectsByPage = (rects) => {
  const groupedRects = new Map();

  const geometryRects = Array.isArray(rects) ? rects : [];
  geometryRects.forEach((rect) => {
    const pageIndex = toFinitePageIndex(rect?.pageIndex);
    if (pageIndex == null) {
      return;
    }

    const pageRects = groupedRects.get(pageIndex);
    if (pageRects) {
      pageRects.push(rect);
      return;
    }

    groupedRects.set(pageIndex, [rect]);
  });

  return [...groupedRects.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pageIndex, pageRects]) => ({ pageIndex, rects: pageRects }));
};

const isRepeatedHeaderFooterTrackedChange = (comment, positionEntry) => {
  if (!comment?.trackedChange) {
    return false;
  }

  if (comment?.trackedChangeStory?.storyType !== HEADER_FOOTER_TRACKED_CHANGE_STORY_TYPE) {
    return false;
  }

  return groupRectsByPage(positionEntry?.rects).length > 1;
};

// PDF / non-editor comments have no editor-backed positionEntry, so their
// page index cannot be read from layout geometry. Fall back to the 1-based
// `selection.page` carried by the PDF selection (page 1 → pageIndex 0). Only
// applied when there is no geometry pageIndex; editor geometry stays authoritative.
const resolveSelectionPageIndex = (comment) => {
  const page = Number(comment?.selection?.page);
  if (!Number.isInteger(page) || page < 1) return null;
  return page - 1;
};

const buildSingleFloatingCommentInstance = ({ id, threadId, comment, positionKey, positionEntry }) => {
  const geometryPageIndex = toFinitePageIndex(positionEntry?.pageIndex);
  const fallbackPageIndex = comment?.trackedChange ? null : resolveSelectionPageIndex(comment);
  const pageIndex = geometryPageIndex ?? fallbackPageIndex;

  return {
    id,
    threadId,
    comment,
    positionKey,
    positionEntry: positionEntry ?? null,
    pageIndex,
    isPrimary: true,
  };
};

const buildRepeatedHeaderFooterInstances = ({ comment, positionKey, positionEntry, primaryInstanceId }) => {
  const rectGroups = groupRectsByPage(positionEntry?.rects);
  if (rectGroups.length < 2) {
    return [];
  }

  const renderableGroups = rectGroups
    .map(({ pageIndex, rects }) => {
      const bounds = aggregateRectBounds(rects);
      return bounds ? { pageIndex, rects, bounds } : null;
    })
    .filter(Boolean);
  if (renderableGroups.length < 2) {
    return [];
  }

  const geometryPageIndex = toFinitePageIndex(positionEntry?.pageIndex);
  const primaryPageIndex = renderableGroups.some(({ pageIndex }) => pageIndex === geometryPageIndex)
    ? geometryPageIndex
    : (renderableGroups[0]?.pageIndex ?? null);

  return renderableGroups.map(({ pageIndex, rects, bounds }) => {
    const isPrimary = pageIndex === primaryPageIndex;

    return {
      id: isPrimary ? primaryInstanceId : buildPageScopedInstanceId(primaryInstanceId, pageIndex),
      threadId: comment?.commentId ?? positionKey,
      comment,
      positionKey,
      pageIndex,
      isPrimary,
      positionEntry: {
        ...positionEntry,
        pageIndex,
        rects,
        bounds,
      },
    };
  });
};

export const buildFloatingCommentInstances = ({ comment, positionKey, positionEntry, fallbackId }) => {
  const hasTrackedChangePositionAlias =
    comment?.trackedChange &&
    positionKey &&
    fallbackId &&
    Array.isArray(comment?.trackedChangePositionAliases) &&
    comment.trackedChangePositionAliases.some((alias) => matchesTrackedChangePositionAlias(positionKey, alias));
  const hasSharedTrackedChangeAnchor =
    comment?.trackedChange &&
    comment?.trackedChangeCanonicalId &&
    positionKey &&
    fallbackId &&
    String(positionKey) !== String(fallbackId);
  const instanceId =
    hasTrackedChangePositionAlias || hasSharedTrackedChangeAnchor ? fallbackId : (positionKey ?? fallbackId);
  if (!instanceId) {
    return [];
  }

  if (isRepeatedHeaderFooterTrackedChange(comment, positionEntry) && positionKey) {
    const repeatedInstances = buildRepeatedHeaderFooterInstances({
      comment,
      positionKey,
      positionEntry,
      primaryInstanceId: instanceId,
    });
    if (repeatedInstances.length > 0) {
      return repeatedInstances;
    }
  }

  return [
    buildSingleFloatingCommentInstance({
      id: instanceId,
      threadId: comment?.commentId ?? fallbackId,
      comment,
      positionKey,
      positionEntry,
    }),
  ];
};
