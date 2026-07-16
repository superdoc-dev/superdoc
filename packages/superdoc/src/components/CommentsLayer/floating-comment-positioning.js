export const isPersistentReviewSidebarItem = (comment) => {
  return Boolean(comment?.trackedChange);
};

export const normalizeFloatingAnchorTop = (top) => {
  return top;
};

export const isAnchorOutsideFloatingViewport = (anchorTop, viewportTop, viewportBottom, anchorBottom = anchorTop) => {
  if (!Number.isFinite(anchorTop) || !Number.isFinite(viewportTop) || !Number.isFinite(viewportBottom)) {
    return false;
  }

  const resolvedAnchorBottom = Number.isFinite(anchorBottom) ? anchorBottom : anchorTop;
  return resolvedAnchorBottom < viewportTop || anchorTop > viewportBottom;
};

export const shouldKeepPersistentReviewCardAtAnchor = ({
  comment,
  anchorTop,
  anchorBottom,
  viewportTop,
  viewportBottom,
}) => {
  return (
    isPersistentReviewSidebarItem(comment) &&
    isAnchorOutsideFloatingViewport(anchorTop, viewportTop, viewportBottom, anchorBottom)
  );
};

export const resolvePersistentReviewCardTop = ({
  comment,
  anchorTop,
  anchorBottom,
  cardHeight,
  viewportTop,
  viewportBottom,
}) => {
  if (
    !shouldKeepPersistentReviewCardAtAnchor({ comment, anchorTop, anchorBottom, viewportTop, viewportBottom }) ||
    !Number.isFinite(cardHeight)
  ) {
    return null;
  }

  const resolvedAnchorBottom = Number.isFinite(anchorBottom) ? anchorBottom : anchorTop;
  if (resolvedAnchorBottom < viewportTop) {
    return Math.min(anchorTop, viewportTop - cardHeight - 1);
  }

  return anchorTop;
};

export const shouldMountFloatingCommentDialog = ({ id, visibleIds, activeCommentInstanceId, comment }) => {
  if (!id) {
    return false;
  }

  if (id === 'pending') {
    return true;
  }

  if (activeCommentInstanceId != null && String(id) === String(activeCommentInstanceId)) {
    return true;
  }

  if (visibleIds?.has?.(id)) {
    return true;
  }

  return isPersistentReviewSidebarItem(comment);
};
