export const isPersistentReviewSidebarItem = (comment) => {
  return Boolean(comment?.trackedChange);
};

export const normalizeFloatingAnchorTop = (top) => {
  return top;
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
