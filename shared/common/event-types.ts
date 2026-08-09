export const comments_module_events = {
  RESOLVED: 'resolved',
  NEW: 'new',
  ADD: 'add',
  UPDATE: 'update',
  DELETED: 'deleted',
  PENDING: 'pending',
  SELECTED: 'selected',

  // Comments list
  COMMENTS_LIST: 'comments-list',

  // Tracked changes
  CHANGE_ACCEPTED: 'change-accepted',
  CHANGE_REJECTED: 'change-rejected',
} as const;

export type CommentEvent = (typeof comments_module_events)[keyof typeof comments_module_events];
