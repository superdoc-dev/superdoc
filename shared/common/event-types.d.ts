export declare const comments_module_events: {
  readonly RESOLVED: 'resolved';
  readonly NEW: 'new';
  readonly ADD: 'add';
  readonly UPDATE: 'update';
  readonly DELETED: 'deleted';
  readonly PENDING: 'pending';
  readonly SELECTED: 'selected';
  readonly COMMENTS_LIST: 'comments-list';
  readonly CHANGE_ACCEPTED: 'change-accepted';
  readonly CHANGE_REJECTED: 'change-rejected';
};
export type CommentEvent = (typeof comments_module_events)[keyof typeof comments_module_events];
