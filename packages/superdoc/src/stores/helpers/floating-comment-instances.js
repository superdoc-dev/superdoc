const HEADER_FOOTER_TRACKED_CHANGE_STORY_TYPE = 'headerFooterPart';

const toFinitePageIndex = (value) => {
  return Number.isFinite(value) ? Number(value) : null;
};

const buildPageScopedInstanceId = (positionKey, pageIndex) => {
  return `${positionKey}::page:${pageIndex}`;
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

  rects.forEach((rect) => {
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

const buildSingleFloatingCommentInstance = ({ id, threadId, comment, positionKey, positionEntry }) => {
  return {
    id,
    threadId,
    comment,
    positionKey,
    positionEntry: positionEntry ?? null,
    pageIndex: toFinitePageIndex(positionEntry?.pageIndex),
    isPrimary: true,
  };
};

const buildRepeatedHeaderFooterInstances = ({ comment, positionKey, positionEntry }) => {
  const rectGroups = groupRectsByPage(positionEntry?.rects);
  if (rectGroups.length < 2) {
    return [];
  }

  const primaryPageIndex = toFinitePageIndex(positionEntry?.pageIndex) ?? rectGroups[0]?.pageIndex ?? null;

  return rectGroups
    .map(({ pageIndex, rects }) => {
      const bounds = aggregateRectBounds(rects);
      if (!bounds) {
        return null;
      }

      return {
        id: buildPageScopedInstanceId(positionKey, pageIndex),
        threadId: comment?.commentId ?? positionKey,
        comment,
        positionKey,
        pageIndex,
        isPrimary: pageIndex === primaryPageIndex,
        positionEntry: {
          ...positionEntry,
          pageIndex,
          rects,
          bounds,
        },
      };
    })
    .filter(Boolean);
};

export const buildFloatingCommentInstances = ({ comment, positionKey, positionEntry, fallbackId }) => {
  const instanceId = positionKey ?? fallbackId;
  if (!instanceId) {
    return [];
  }

  if (isRepeatedHeaderFooterTrackedChange(comment, positionEntry) && positionKey) {
    const repeatedInstances = buildRepeatedHeaderFooterInstances({
      comment,
      positionKey,
      positionEntry,
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
